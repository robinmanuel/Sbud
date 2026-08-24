import os
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Response, UploadFile, File
import pypdf
import io
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai
from sqlalchemy.orm import Session

from app.schemas import ChatRequest, ChatResponse
from app import schemas, models
from app.database import get_db, init_db
from app.security import hash_password, verify_password, create_access_token, get_current_user

# Load environment variables from .env
load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Life-span events to initialize the database (automatically checking/creating the database 
    and generating the tables) before the application starts accepting requests.
    """
    init_db()
    yield

app = FastAPI(
    title="SBud API",
    description="Backend API for SBud educational assistant helper.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration (supporting cookies and credentials)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_INSTRUCTION = (
    "You are an AI study tutor. Your goal is to help students learn effectively. "
    "Please follow these behavioral guidelines:\n"
    "1. Explain concepts clearly and adapt the explanation to the student's level.\n"
    "2. Prefer teaching and guiding the student over simply giving direct answers.\n"
    "3. Break down difficult or complex concepts into smaller, digestible pieces.\n"
    "4. Use practical examples, scenarios, and analogies where helpful.\n"
    "5. Ask a relevant follow-up question at the end of your response to help the student think and learn.\n"
    "6. If the student asks for an answer to a homework/study problem, explain the step-by-step reasoning "
    "and logic rather than only providing the final answer.\n"
    "7. Never make up facts or pretend to know something you do not know. If you are unsure, be honest.\n"
    "8. Keep your responses reasonably concise, unless the student explicitly asks for more detail."
)

# Configure Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    # Initialize the generative model (using gemini-3.6-flash as the standard fast model)
    model = genai.GenerativeModel("gemini-3.6-flash", system_instruction=SYSTEM_INSTRUCTION)
else:
    model = None
    print("WARNING: GEMINI_API_KEY is not set. The /chat endpoint will return 500 errors until it is configured.")

@app.get("/", tags=["General"])
async def root():
    """
    Root endpoint offering a simple welcome message and status.
    """
    return {"message": "Welcome to SBud API"}

# =====================================================================
# Authentication Endpoints
# =====================================================================

@app.post("/auth/register", response_model=schemas.UserResponse, status_code=201, tags=["Auth"])
def register(request: schemas.UserAuthRequest, db: Session = Depends(get_db)):
    """
    Registers a new student user. Validates email uniqueness and hashes their password.
    """
    existing_user = db.query(models.User).filter(models.User.email == request.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")

    hashed_pw = hash_password(request.password)
    new_user = models.User(email=request.email, password_hash=hashed_pw)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/auth/login", response_model=schemas.TokenResponse, tags=["Auth"])
def login(request: schemas.UserAuthRequest, response: Response, db: Session = Depends(get_db)):
    """
    Authenticates user credentials, sets an HttpOnly JWT access token cookie, and returns it.
    """
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": str(user.id)})
    
    # Set HttpOnly cookie for web security (to prevent XSS theft)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=1440 * 60,  # 24 hours
        expires=1440 * 60,
        samesite="lax",
        secure=False,  # Set to True in production (HTTPS)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/logout", tags=["Auth"])
def logout(response: Response):
    """
    Logs out the user by deleting the secure HttpOnly JWT access token cookie.
    """
    response.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="lax",
        secure=False,
    )
    return {"message": "Logged out successfully"}

@app.get("/users/me", response_model=schemas.UserResponse, tags=["Users"])
def get_me(current_user: models.User = Depends(get_current_user)):
    """
    Retrieves information about the currently authenticated user.
    """
    return current_user


# =====================================================================
# Chat Endpoints
# =====================================================================

@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(
    request: ChatRequest, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Sends the conversation history (including the latest message) to the Gemini AI model,
    saves both user input and AI response to the database, and returns the response.
    
    - **messages**: List of previous chat messages along with the new user message.
    - **conversation_id**: Optional ID of an existing conversation to save messages to.
    """
    global model
    
    # Check if AI model is configured
    if not model:
         # Try loading it dynamically in case .env was updated without restarting process (dev convenience)
         dynamic_api_key = os.getenv("GEMINI_API_KEY")
         if dynamic_api_key:
             genai.configure(api_key=dynamic_api_key)
             model = genai.GenerativeModel("gemini-3.6-flash", system_instruction=SYSTEM_INSTRUCTION)
         else:
             raise HTTPException(
                 status_code=500,
                 detail="Gemini API Key is not configured on the backend. Please check the .env file."
             )
        
    try:
        # Get the latest user message content from request
        user_content = request.messages[-1].content
        
        # If conversation_id is provided, verify it exists and belongs to current_user; otherwise, create a new conversation
        if request.conversation_id is not None:
            db_conv = db.query(models.Conversation).filter(
                models.Conversation.id == request.conversation_id,
                models.Conversation.user_id == current_user.id
            ).first()
            if not db_conv:
                raise HTTPException(status_code=404, detail="Conversation not found")
            conversation_id = request.conversation_id

            # Save user's latest message to the database
            user_msg = models.Message(
                conversation_id=conversation_id,
                role="user",
                content=user_content
            )
            db.add(user_msg)
            db.commit()
        else:
            db_conv = models.Conversation(user_id=current_user.id)
            db.add(db_conv)
            db.commit()
            db.refresh(db_conv)
            conversation_id = db_conv.id

            # Save the entire incoming message history to the database
            for msg in request.messages:
                db_msg = models.Message(
                    conversation_id=conversation_id,
                    role=msg.role,
                    content=msg.content
                )
                db.add(db_msg)
            
            # Automatically set conversation title based on first message
            first_user_msg = next((m for m in request.messages if m.role == "user"), None)
            if first_user_msg:
                title_snippet = first_user_msg.content.strip().split("\n")[0]
                if len(title_snippet) > 30:
                    title_snippet = title_snippet[:27] + "..."
                db_conv.title = title_snippet or "New Chat"

            db.commit()

        # Retrieve the complete conversation history from database to build history for Gemini
        history_messages = db.query(models.Message).filter(
            models.Message.conversation_id == conversation_id
        ).order_by(models.Message.created_at.asc()).all()

        # Format history for Gemini (user -> user, assistant -> model)
        contents = [
            {
                "role": "user" if msg.role == "user" else "model",
                "parts": [msg.content]
            }
            for msg in history_messages
        ]
        
        # Call the Gemini API asynchronously
        response = await model.generate_content_async(contents)
        
        # Verify response text is present
        if not response.text:
            raise HTTPException(
                status_code=502,
                detail="Empty response received from the Gemini AI model."
            )

        # Save AI's response to the database
        assistant_msg = models.Message(
            conversation_id=conversation_id,
            role="assistant",
            content=response.text
        )
        db.add(assistant_msg)
        db.commit()
            
        return ChatResponse(reply=response.text, conversation_id=conversation_id)
    except HTTPException:
        raise
    except Exception as e:
        # Catch other API failures or exceptions
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f"AI model API failure: {str(e)}"
        )


# =====================================================================
# Database-Backed Conversations and Messages Endpoints
# =====================================================================

@app.post("/conversations", response_model=schemas.ConversationCreateResponse, status_code=201, tags=["Conversations"])
def create_conversation(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Creates a new, empty conversation in the database belonging to the authenticated user.
    """
    db_conv = models.Conversation(user_id=current_user.id)
    db.add(db_conv)
    db.commit()
    db.refresh(db_conv)
    return db_conv

@app.get("/conversations", response_model=List[schemas.ConversationResponse], tags=["Conversations"])
def list_conversations(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Retrieves all conversations belonging to the currently authenticated user.
    """
    return db.query(models.Conversation).filter(
        models.Conversation.user_id == current_user.id
    ).order_by(models.Conversation.created_at.desc()).all()

@app.delete("/conversations/{conversation_id}", tags=["Conversations"])
def delete_conversation(conversation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Deletes a specific conversation, verifying owner authorization.
    """
    db_conv = db.query(models.Conversation).filter(
        models.Conversation.id == conversation_id,
        models.Conversation.user_id == current_user.id
    ).first()
    if not db_conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(db_conv)
    db.commit()
    return {"message": "Conversation deleted successfully"}

@app.get("/conversations/{conversation_id}", response_model=schemas.ConversationDetailResponse, tags=["Conversations"])
def get_conversation(conversation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Retrieves the conversation metadata and all related messages, verifying owner authorization.
    """
    db_conv = db.query(models.Conversation).filter(
        models.Conversation.id == conversation_id,
        models.Conversation.user_id == current_user.id
    ).first()
    if not db_conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return db_conv

@app.post("/conversations/{conversation_id}/messages", response_model=schemas.MessageResponse, tags=["Conversations"])
async def create_message(
    conversation_id: int,
    request: schemas.MessageCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Saves the student's message, retrieves the full conversation history from the database,
    sends it to the Gemini model, saves the AI's response, and returns the AI's response message.
    Ensures that the conversation belongs to the authenticated user.
    """
    global model

    # 1. Verify that the conversation exists and belongs to the current user
    db_conv = db.query(models.Conversation).filter(
        models.Conversation.id == conversation_id,
        models.Conversation.user_id == current_user.id
    ).first()
    if not db_conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 2. Save the User's Message
    user_msg = models.Message(
        conversation_id=conversation_id,
        role="user",
        content=request.content
    )
    db.add(user_msg)
    
    # Automatically set conversation title based on first message
    if db_conv.title == "New Chat":
        title_snippet = request.content.strip().split("\n")[0]
        if len(title_snippet) > 30:
            title_snippet = title_snippet[:27] + "..."
        db_conv.title = title_snippet or "New Chat"
        
    db.commit()
    db.refresh(user_msg)

    # 3. Retrieve all messages for this conversation to build conversation history for Gemini
    history_messages = db.query(models.Message).filter(
        models.Message.conversation_id == conversation_id
    ).order_by(models.Message.created_at.asc()).all()

    # 4. Check if Gemini model is configured
    if not model:
         dynamic_api_key = os.getenv("GEMINI_API_KEY")
         if dynamic_api_key:
             genai.configure(api_key=dynamic_api_key)
             model = genai.GenerativeModel("gemini-3.6-flash", system_instruction=SYSTEM_INSTRUCTION)
         else:
             raise HTTPException(
                 status_code=500,
                 detail="Gemini API Key is not configured on the backend. Please check the .env file."
             )

    try:
        # 5. Format history for Gemini (user -> user, assistant -> model)
        contents = [
            {
                "role": "user" if msg.role == "user" else "model",
                "parts": [msg.content]
            }
            for msg in history_messages
        ]

        # 6. Call the Gemini API asynchronously
        response = await model.generate_content_async(contents)

        if not response.text:
            raise HTTPException(
                status_code=502,
                detail="Empty response received from the Gemini AI model."
            )

        # 7. Save the Assistant's Message
        assistant_msg = models.Message(
            conversation_id=conversation_id,
            role="assistant",
            content=response.text
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(assistant_msg)

        return assistant_msg

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f"AI model API failure: {str(e)}"
        )


# =====================================================================
# Document Management Endpoints (Study Materials)
# =====================================================================

@app.post("/documents", response_model=schemas.DocumentResponse, status_code=201, tags=["Documents"])
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Accepts a PDF upload, validates its size and type, extracts its text,
    and stores its metadata and extracted content in the database.
    """
    # 1. Validate File MIME Type
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PDF documents are supported."
        )

    # 2. Validate File Size (Limit: 10MB)
    max_size = 10 * 1024 * 1024  # 10 Megabytes
    file_content = await file.read()
    file_size = len(file_content)
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds the 10MB limit."
        )

    # 3. Extract Text from PDF using pypdf
    try:
        pdf_stream = io.BytesIO(file_content)
        reader = pypdf.PdfReader(pdf_stream)
        extracted_parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_parts.append(text)
        extracted_text = "\n".join(extracted_parts)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse PDF document: {str(e)}"
        )

    # 4. Save to Database
    db_doc = models.Document(
        user_id=current_user.id,
        filename=file.filename,
        file_type=file.content_type,
        file_size=file_size,
        extracted_text=extracted_text
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

@app.get("/documents", response_model=List[schemas.DocumentResponse], tags=["Documents"])
def list_documents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Lists all documents uploaded by the authenticated user.
    """
    return db.query(models.Document).filter(
        models.Document.user_id == current_user.id
    ).order_by(models.Document.created_at.desc()).all()

@app.delete("/documents/{document_id}", tags=["Documents"])
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Deletes a specific uploaded document, verifying owner authorization.
    """
    db_doc = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id
    ).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    db.delete(db_doc)
    db.commit()
    return {"message": "Document deleted successfully"}
