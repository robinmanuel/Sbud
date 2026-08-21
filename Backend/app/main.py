import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai
from sqlalchemy.orm import Session

from app.schemas import ChatRequest, ChatResponse
from app import schemas, models
from app.database import get_db, init_db

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

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: ChatRequest):
    """
    Sends the conversation history (including the latest message) to the Gemini AI model and returns the response.
    
    - **messages**: List of previous chat messages along with the new user message.
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
        # Format conversation history for Gemini API
        # Gemini expects roles to be 'user' and 'model' (mapping 'assistant' -> 'model')
        contents = [
            {
                "role": "user" if msg.role == "user" else "model",
                "parts": [msg.content]
            }
            for msg in request.messages
        ]
        
        # Call the Gemini API asynchronously
        response = await model.generate_content_async(contents)
        
        # Verify response text is present
        if not response.text:
            raise HTTPException(
                status_code=502,
                detail="Empty response received from the Gemini AI model."
            )
            
        return ChatResponse(reply=response.text)
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
def create_conversation(db: Session = Depends(get_db)):
    """
    Creates a new, empty conversation in the database.
    """
    db_conv = models.Conversation()
    db.add(db_conv)
    db.commit()
    db.refresh(db_conv)
    return db_conv

@app.get("/conversations/{conversation_id}", response_model=schemas.ConversationDetailResponse, tags=["Conversations"])
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    """
    Retrieves the conversation metadata and all related messages.
    """
    db_conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not db_conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return db_conv

@app.post("/conversations/{conversation_id}/messages", response_model=schemas.MessageResponse, tags=["Conversations"])
async def create_message(
    conversation_id: int,
    request: schemas.MessageCreateRequest,
    db: Session = Depends(get_db)
):
    """
    Saves the student's message, retrieves the full conversation history from the database,
    sends it to the Gemini model, saves the AI's response, and returns the AI's response message.
    """
    global model

    # 1. Verify that the conversation exists
    db_conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not db_conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 2. Save the User's Message
    user_msg = models.Message(
        conversation_id=conversation_id,
        role="user",
        content=request.content
    )
    db.add(user_msg)
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
