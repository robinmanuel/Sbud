import os
from typing import List
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Response, UploadFile, File
import pypdf
import io
import json
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
    "8. Keep your responses reasonably concise, unless the student explicitly asks for more detail.\n"
    "9. If study materials are provided under [SUPPLIED STUDY MATERIAL CONTEXT], use them to answer the student's question. "
    "If the material doesn't contain enough information to answer the question, explicitly state that you do not "
    "have that information rather than inventing an answer. Clearly distinguish information from the student's materials "
    "from general knowledge."
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
        contents = []
        for i, msg in enumerate(history_messages):
            role = "user" if msg.role == "user" else "model"
            if i == len(history_messages) - 1 and msg.role == "user":
                student_ctx = get_student_context(current_user.id, db)
                combined = f"{msg.content}\n\n{student_ctx}"
                contents.append({
                    "role": role,
                    "parts": [combined]
                })
            else:
                contents.append({
                    "role": role,
                    "parts": [msg.content]
                })
        
        # Call the Gemini API asynchronously via AIService
        from app.ai_service import AIService
        reply_text = await AIService.generate_chat_response(contents, current_user.id, db)

        # Save AI's response to the database
        assistant_msg = models.Message(
            conversation_id=conversation_id,
            role="assistant",
            content=reply_text
        )
        db.add(assistant_msg)
        db.commit()
            
        return ChatResponse(reply=reply_text, conversation_id=conversation_id)
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

    # RAG: Search relevant study materials of this user
    context_list = []
    sources_list = []
    
    # Check if the user has uploaded any study materials
    user_docs_count = db.query(models.Document).filter(models.Document.user_id == current_user.id).count()
    if user_docs_count > 0:
        try:
            # Embed the student's question (retrieval_query task type)
            query_vector = get_embedding(request.content, task_type="retrieval_query")
            
            # Retrieve relevant chunks across all user's documents
            from app.database import DB_TYPE
            if DB_TYPE == "postgresql":
                db_chunks = db.query(
                    models.DocumentChunk
                ).join(
                    models.Document, models.Document.id == models.DocumentChunk.document_id
                ).filter(
                    models.Document.user_id == current_user.id
                ).order_by(
                    models.DocumentChunk.embedding.cosine_distance(query_vector)
                ).limit(3).all()
            else:
                # SQLite Cosine Similarity calculation in Python memory
                import math
                def cosine_similarity(v1, v2):
                    dot_product = sum(x * y for x, y in zip(v1, v2))
                    magnitude1 = math.sqrt(sum(x * x for x in v1))
                    magnitude2 = math.sqrt(sum(y * y for y in v2))
                    if not magnitude1 or not magnitude2:
                        return 0.0
                    return dot_product / (magnitude1 * magnitude2)

                all_chunks = db.query(models.DocumentChunk).join(
                    models.Document, models.Document.id == models.DocumentChunk.document_id
                ).filter(
                    models.Document.user_id == current_user.id
                ).all()

                scored_chunks = []
                for chunk in all_chunks:
                    try:
                        chunk_vector = json.loads(chunk.embedding)
                        score = cosine_similarity(query_vector, chunk_vector)
                        scored_chunks.append((score, chunk))
                    except Exception:
                        continue

                # Sort by similarity score descending and take top 3
                scored_chunks.sort(key=lambda x: x[0], reverse=True)
                # Filter by similarity threshold to avoid completely unrelated noise (0.35 is standard)
                db_chunks = [item[1] for item in scored_chunks[:3] if item[0] >= 0.35]

            for chunk in db_chunks:
                context_list.append(
                    f"Document: {chunk.document.filename}\n"
                    f"Content: {chunk.chunk_text}"
                )
                sources_list.append({
                    "document": chunk.document.filename,
                    "page": chunk.page_number or "N/A"
                })
        except Exception as e:
            print(f"WARNING: RAG retrieval failed: {e}")

    try:
        # 5. Format history for Gemini (user -> user, assistant -> model)
        contents = []
        for i, msg in enumerate(history_messages):
            role = "user" if msg.role == "user" else "model"
            
            # If this is the last user message, inject context
            if i == len(history_messages) - 1 and msg.role == "user":
                student_ctx = get_student_context(current_user.id, db)
                
                rag_context_str = ""
                if context_list:
                    rag_context_str = "\n---\n".join(context_list)
                
                combined_content = f"[STUDENT QUESTION]\n{msg.content}\n\n"
                if rag_context_str:
                    combined_content += f"[SUPPLIED STUDY MATERIAL CONTEXT]\n{rag_context_str}\n\n"
                combined_content += student_ctx
                
                contents.append({
                    "role": role,
                    "parts": [combined_content]
                })
            else:
                contents.append({
                    "role": role,
                    "parts": [msg.content]
                })

        # 6. Call the Gemini API asynchronously via AIService
        from app.ai_service import AIService
        reply_text = await AIService.generate_chat_response(contents, current_user.id, db)

        # 7. Format and append citations if sources were retrieved and referenced
        # Filter for unique sources
        if sources_list:
            seen = set()
            unique_sources = []
            for s in sources_list:
                k = (s["document"], s["page"])
                if k not in seen:
                    seen.add(k)
                    unique_sources.append(s)
            
            # Only append sources block if the AI actually has an answer and didn't state it's missing
            lower_reply = reply_text.lower()
            missing_keywords = [
                "do not have that information", 
                "not in the supplied", 
                "not in the provided",
                "not mention",
                "does not contain"
            ]
            is_missing = any(keyword in lower_reply for keyword in missing_keywords)
            
            if unique_sources and not is_missing:
                citations = [
                    f"📄 {s['document']} — Page {s['page']}"
                    for s in unique_sources
                ]
                reply_text += "\n\nSources:\n" + "\n".join(citations)

        # 8. Save the Assistant's Message
        assistant_msg = models.Message(
            conversation_id=conversation_id,
            role="assistant",
            content=reply_text
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

def chunk_text(text: str, max_chars: int = 800) -> List[str]:
    """
    Splits text semantically, preserving paragraph boundaries where possible.
    """
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_len = 0
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        # If paragraph is too long, split it by sentence-like structures
        if len(para) > max_chars:
            sentences = para.replace(". ", ".\n").split("\n")
            for sent in sentences:
                sent = sent.strip()
                if not sent:
                    continue
                if current_len + len(sent) > max_chars:
                    if current_chunk:
                        chunks.append("\n".join(current_chunk))
                    current_chunk = [sent]
                    current_len = len(sent)
                else:
                    current_chunk.append(sent)
                    current_len += len(sent)
        else:
            if current_len + len(para) > max_chars:
                if current_chunk:
                    chunks.append("\n\n".join(current_chunk))
                current_chunk = [para]
                current_len = len(para)
            else:
                current_chunk.append(para)
                current_len += len(para)
                
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
        
    return chunks

def get_embedding(text: str, task_type: str = "retrieval_document") -> List[float]:
    """
    Generates text embeddings using Gemini's text-embedding-004 model.
    """
    dynamic_api_key = os.getenv("GEMINI_API_KEY")
    if dynamic_api_key:
        genai.configure(api_key=dynamic_api_key)
    else:
        raise HTTPException(
            status_code=500,
            detail="Gemini API Key is not configured. Cannot perform vector embeddings."
        )
    
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type=task_type
        )
        return result["embedding"]
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI model embedding failure: {str(e)}"
        )


def get_student_context(user_id: int, db: Session) -> str:
    """
    Helper function to build a context string containing the student's 
    progress statistics, weak topics, and available study materials.
    """
    progress_records = db.query(models.StudentProgress).filter(
        models.StudentProgress.user_id == user_id
    ).all()
    
    user_docs = db.query(models.Document).filter(
        models.Document.user_id == user_id
    ).all()
    
    progress_lines = []
    for rec in progress_records:
        accuracy_str = f"{rec.accuracy:.0f}%"
        is_weak = rec.accuracy < 70.0
        status = "⚠️ Weak" if is_weak else "Good"
        progress_lines.append(
            f"- {rec.subject} > {rec.topic}: {accuracy_str} accuracy "
            f"({rec.questions_correct}/{rec.questions_attempted} correct) [{status}]"
        )
    progress_str = "\n".join(progress_lines) if progress_lines else "No progress tracked yet. Encourage the student to take quizzes!"
    
    doc_lines = []
    for doc in user_docs:
        doc_lines.append(f"- {doc.filename}")
    doc_str = "\n".join(doc_lines) if doc_lines else "No study materials uploaded yet."
    
    context = (
        "[STUDENT PROGRESS & PERFORMANCE]\n"
        f"{progress_str}\n\n"
        "[AVAILABLE STUDY MATERIALS]\n"
        f"{doc_str}\n\n"
        "INSTRUCTION: Use the student's progress and weak topics (accuracy < 70%) to recommend what they should study next "
        "when they ask for recommendations (e.g. 'What should I study today?'). Recommend specific review steps and "
        "refer to their available study materials if relevant. Do not calculate scores yourself; use the provided accuracy and performance stats."
    )
    return context


@app.post("/documents", response_model=schemas.DocumentResponse, status_code=201, tags=["Documents"])
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Accepts a PDF upload, validates its size and type, extracts its text,
    segments it into chunks, generates vector embeddings, and stores everything in database.
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

    # 4. Save parent Document metadata to Database
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

    # 5. Semantic Chunking
    chunks = chunk_text(extracted_text)

    # 6. Generate embeddings and save related DocumentChunks
    from app.database import DB_TYPE
    for index, chunk_text_content in enumerate(chunks):
        vector = get_embedding(chunk_text_content, task_type="retrieval_document")
        stored_embedding = json.dumps(vector) if DB_TYPE == "sqlite" else vector
        
        db_chunk = models.DocumentChunk(
            document_id=db_doc.id,
            chunk_text=chunk_text_content,
            page_number=None,
            embedding=stored_embedding
        )
        db.add(db_chunk)
    
    db.commit()
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

@app.post("/documents/{document_id}/search", response_model=List[schemas.ChunkSearchResponse], tags=["Documents"])
def search_document(
    document_id: int,
    request: schemas.SearchRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Verifies document ownership, embeds the search query, performs similarity search,
    and returns the top 3-5 relevant chunks.
    """
    # 1. Verify owner authorization
    db_doc = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id
    ).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not request.query.strip():
        return []

    # 2. Embed the query (retrieval_query task type)
    query_vector = get_embedding(request.query, task_type="retrieval_query")

    # 3. Perform Similarity Search based on database engine type
    from app.database import DB_TYPE
    if DB_TYPE == "postgresql":
        # Cosine distance order (closest has smallest distance)
        db_chunks = db.query(
            models.DocumentChunk,
            (1 - models.DocumentChunk.embedding.cosine_distance(query_vector)).label("similarity")
        ).filter(
            models.DocumentChunk.document_id == document_id
        ).order_by(
            models.DocumentChunk.embedding.cosine_distance(query_vector)
        ).limit(5).all()

        results = [
            schemas.ChunkSearchResponse(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                chunk_text=chunk.chunk_text,
                page_number=chunk.page_number,
                similarity=float(similarity)
            )
            for chunk, similarity in db_chunks
        ]
    else:
        # SQLite Cosine Similarity fallback in Python memory
        import math
        
        def cosine_similarity(v1, v2):
            dot_product = sum(x * y for x, y in zip(v1, v2))
            magnitude1 = math.sqrt(sum(x * x for x in v1))
            magnitude2 = math.sqrt(sum(y * y for y in v2))
            if not magnitude1 or not magnitude2:
                return 0.0
            return dot_product / (magnitude1 * magnitude2)

        db_chunks = db.query(models.DocumentChunk).filter(
            models.DocumentChunk.document_id == document_id
        ).all()

        scored_chunks = []
        for chunk in db_chunks:
            # Decode the JSON array stored in Text column
            try:
                chunk_vector = json.loads(chunk.embedding)
                score = cosine_similarity(query_vector, chunk_vector)
                scored_chunks.append((score, chunk))
            except Exception:
                continue

        # Sort descending by similarity score
        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        results = [
            schemas.ChunkSearchResponse(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                chunk_text=chunk.chunk_text,
                page_number=chunk.page_number,
                similarity=float(score)
            )
            for score, chunk in scored_chunks[:5]
        ]

    return results


# =====================================================================
# Quiz Generation & Grading Endpoints
# =====================================================================

QUIZ_GENERATOR_INSTRUCTION = (
    "You are an expert quiz generator. Your task is to generate a multiple-choice quiz of exactly 5 questions "
    "based strictly on the provided study material. Each question must have exactly 4 options, a correct answer ('A', 'B', 'C', or 'D'), "
    "a brief explanation explaining the reasoning, a 'subject' (the broad field, e.g. 'Physics', 'Biology', 'History'), "
    "and a specific 'topic' (e.g. 'Newton's Laws', 'Genetics', 'French Revolution').\n"
    "You must return a JSON array of objects conforming to the following structure:\n"
    "[\n"
    "  {\n"
    "    \"question\": \"What is the primary function of chlorophyll?\",\n"
    "    \"options\": [\n"
    "      \"A. Absorbing water\",\n"
    "      \"B. Absorbing light energy\",\n"
    "      \"C. Releasing oxygen\",\n"
    "      \"D. Transporting sugars\"\n"
    "    ],\n"
    "    \"correct_answer\": \"B\",\n"
    "    \"explanation\": \"Chlorophyll absorbs light energy...\",\n"
    "    \"subject\": \"Biology\",\n"
    "    \"topic\": \"Cells\"\n"
    "  }\n"
    "]"
)

@app.post("/quizzes", response_model=schemas.QuizResponse, status_code=201, tags=["Quizzes"])
async def generate_quiz(
    request: schemas.QuizCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieves document content, prompts Gemini to generate a 5-question multiple-choice quiz,
    records it in the database, and returns the questions (without correct answers).
    """
    # 1. Verify document ownership
    db_doc = db.query(models.Document).filter(
        models.Document.id == request.document_id,
        models.Document.user_id == current_user.id
    ).first()
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not db_doc.extracted_text or not db_doc.extracted_text.strip():
        raise HTTPException(status_code=400, detail="Document has no text content to generate a quiz from.")

    # Check if learning goal is specified and belongs to user
    db_goal = None
    target_topics = None
    if request.learning_goal_id is not None:
        db_goal = db.query(models.LearningGoal).filter(
            models.LearningGoal.id == request.learning_goal_id,
            models.LearningGoal.user_id == current_user.id
        ).first()
        if not db_goal:
            raise HTTPException(status_code=404, detail="Learning goal not found")
        target_topics = [t.name for t in db_goal.topics]

    # 2. Call AIService to generate quiz JSON array (handles rate limits, caching, usage logs)
    from app.ai_service import AIService
    try:
        questions_data = await AIService.generate_quiz(
            db_doc.extracted_text,
            current_user.id,
            db,
            topics=target_topics
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate quiz: {str(e)}"
        )

    # 4. Save Quiz parent to Database
    db_quiz = models.Quiz(
        user_id=current_user.id,
        document_id=db_doc.id,
        learning_goal_id=request.learning_goal_id,
        title=f"{db_doc.filename.rsplit('.', 1)[0]} Quiz",
        score=None
    )
    db.add(db_quiz)
    db.commit()
    db.refresh(db_quiz)

    # 5. Save QuizQuestions to Database
    for item in questions_data:
        # Extract correct answer key e.g. "A", "B", "C", "D"
        ans_key = item.get("correct_answer", "").strip().upper()
        if len(ans_key) > 1:
            ans_key = ans_key[0] # Fallback if model returns e.g. "A."

        # Find matching topic ID if goal is provided
        matched_topic_id = None
        item_topic = item.get("topic", "General")
        if db_goal:
            item_topic_lower = item_topic.strip().lower()
            for topic_obj in db_goal.topics:
                tname_lower = topic_obj.name.lower()
                if (tname_lower in item_topic_lower) or (item_topic_lower in tname_lower):
                    matched_topic_id = topic_obj.id
                    break

        db_q = models.QuizQuestion(
            quiz_id=db_quiz.id,
            question_text=item.get("question"),
            options=json.dumps(item.get("options", [])),
            correct_answer=ans_key,
            explanation=item.get("explanation", ""),
            student_answer=None,
            subject=item.get("subject", "General"),
            topic=item_topic,
            topic_id=matched_topic_id
        )
        db.add(db_q)
    
    db.commit()
    db.refresh(db_quiz)

    # 6. Return response (options decoded from JSON string)
    questions_resp = [
        schemas.QuizQuestionResponse(
            id=q.id,
            question_text=q.question_text,
            options=json.loads(q.options)
        )
        for q in db_quiz.questions
    ]
    return schemas.QuizResponse(
        id=db_quiz.id,
        document_id=db_quiz.document_id,
        learning_goal_id=db_quiz.learning_goal_id,
        title=db_quiz.title,
        created_at=db_quiz.created_at,
        questions=questions_resp
    )

@app.get("/quizzes/{quiz_id}", response_model=schemas.QuizResponse, tags=["Quizzes"])
def get_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Fetches details of a specific quiz, hiding the answers.
    """
    db_quiz = db.query(models.Quiz).filter(
        models.Quiz.id == quiz_id,
        models.Quiz.user_id == current_user.id
    ).first()
    if not db_quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions_resp = [
        schemas.QuizQuestionResponse(
            id=q.id,
            question_text=q.question_text,
            options=json.loads(q.options)
        )
        for q in db_quiz.questions
    ]
    return schemas.QuizResponse(
        id=db_quiz.id,
        document_id=db_quiz.document_id,
        learning_goal_id=db_quiz.learning_goal_id,
        title=db_quiz.title,
        created_at=db_quiz.created_at,
        questions=questions_resp
    )

@app.post("/quizzes/{quiz_id}/submit", response_model=schemas.QuizResultResponse, tags=["Quizzes"])
def submit_quiz(
    quiz_id: int,
    request: schemas.QuizSubmitRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Receives student selections, compares them deterministically to correct answers,
    updates database records, and returns the graded results.
    """
    db_quiz = db.query(models.Quiz).filter(
        models.Quiz.id == quiz_id,
        models.Quiz.user_id == current_user.id
    ).first()
    if not db_quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    score = 0
    graded_questions = []

    for q in db_quiz.questions:
        # Check student selection for this question id
        student_ans = request.answers.get(str(q.id))
        if student_ans:
            student_ans = student_ans.strip().upper()
            if len(student_ans) > 1:
                student_ans = student_ans[0]
        else:
            student_ans = None

        q.student_answer = student_ans
        is_correct = (student_ans == q.correct_answer)
        if is_correct:
            score += 1

        # Determine subject and topic
        subj = q.subject or "General"
        top = q.topic or "General"

        # Update student progress statistics if they attempted the question
        if student_ans in ["A", "B", "C", "D"]:
            progress = db.query(models.StudentProgress).filter_by(
                user_id=current_user.id,
                subject=subj,
                topic=top
            ).first()

            if not progress:
                progress = models.StudentProgress(
                    user_id=current_user.id,
                    subject=subj,
                    topic=top,
                    questions_attempted=0,
                    questions_correct=0,
                    accuracy=0.0
                )
                db.add(progress)

            progress.questions_attempted += 1
            if is_correct:
                progress.questions_correct += 1

            # Recalculate accuracy percentage (0.0 to 100.0)
            if progress.questions_attempted > 0:
                progress.accuracy = (progress.questions_correct / progress.questions_attempted) * 100.0

        graded_questions.append(
            schemas.GradedQuestionResponse(
                id=q.id,
                question_text=q.question_text,
                options=json.loads(q.options),
                student_answer=student_ans,
                correct_answer=q.correct_answer,
                explanation=q.explanation,
                is_correct=is_correct,
                subject=subj,
                topic=top
            )
        )

    db_quiz.score = score
    db.commit()

    return schemas.QuizResultResponse(
        id=db_quiz.id,
        document_id=db_quiz.document_id,
        learning_goal_id=db_quiz.learning_goal_id,
        title=db_quiz.title,
        score=score,
        total_questions=len(db_quiz.questions),
        created_at=db_quiz.created_at,
        questions=graded_questions
    )


@app.get("/progress", response_model=List[schemas.StudentProgressResponse], tags=["Progress"])
def get_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieves the progress statistics for the currently authenticated user.
    """
    return db.query(models.StudentProgress).filter(
        models.StudentProgress.user_id == current_user.id
    ).all()


# =====================================================================
# Learning Goals Endpoints
# =====================================================================

@app.post("/learning-goals", response_model=schemas.LearningGoalResponse, status_code=201, tags=["Learning Goals"])
async def create_learning_goal(
    request: schemas.LearningGoalCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Creates a new learning goal by decomposing user input and/or study materials
    into 4-8 logical subtopics using the Gemini AI model.
    """
    doc_text = None
    db_doc = None
    if request.document_id is not None:
        db_doc = db.query(models.Document).filter(
            models.Document.id == request.document_id,
            models.Document.user_id == current_user.id
        ).first()
        if not db_doc:
            raise HTTPException(status_code=404, detail="Document not found")
        doc_text = db_doc.extracted_text

    # Call AI service to generate learning goal title, description, and topics
    from app.ai_service import AIService
    try:
        goal_data = await AIService.generate_learning_goal(
            user_prompt=request.title,
            document_text=doc_text,
            user_id=current_user.id,
            db=db
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate learning goal details: {str(e)}"
        )

    # Use student-specified title if provided, otherwise default to AI title
    title = request.title if (request.title and not request.document_id) else goal_data.get("goal_title", "New Goal")
    description = request.description or goal_data.get("description", "")

    # Create the Learning Goal
    db_goal = models.LearningGoal(
        user_id=current_user.id,
        title=title,
        description=description,
        completed=0
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)

    # Link the document to this goal if provided
    if db_doc:
        db_doc.learning_goal_id = db_goal.id
        db.commit()

    # Create topics
    topics_list = goal_data.get("topics", [])
    for topic_name in topics_list:
        db_topic = models.LearningGoalTopic(
            learning_goal_id=db_goal.id,
            name=topic_name
        )
        db.add(db_topic)
    
    db.commit()
    db.refresh(db_goal)
    return db_goal


@app.get("/learning-goals", response_model=List[schemas.LearningGoalResponse], tags=["Learning Goals"])
def list_learning_goals(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieves all learning goals for the currently authenticated user.
    """
    return db.query(models.LearningGoal).filter(
        models.LearningGoal.user_id == current_user.id
    ).order_by(models.LearningGoal.created_at.desc()).all()


@app.get("/learning-goals/{goal_id}", response_model=schemas.LearningGoalDetailResponse, tags=["Learning Goals"])
def get_learning_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieves detailed info for a specific learning goal, including dynamic topic mastery statistics,
    attached documents, and associated quizzes.
    """
    db_goal = db.query(models.LearningGoal).filter(
        models.LearningGoal.id == goal_id,
        models.LearningGoal.user_id == current_user.id
    ).first()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Learning goal not found")

    # Fetch document and quiz IDs
    doc_ids = [d.id for d in db_goal.documents]
    quiz_ids = [q.id for q in db_goal.quizzes]

    # Calculate topic mastery/progress details
    topic_details = []
    goal_completed = True if len(db_goal.topics) > 0 else False

    for topic in db_goal.topics:
        # Query quiz questions matching this topic_id
        questions = db.query(models.QuizQuestion).filter(
            models.QuizQuestion.topic_id == topic.id
        ).all()

        attempted = 0
        correct = 0
        for q in questions:
            if q.student_answer in ["A", "B", "C", "D"]:
                attempted += 1
                if q.student_answer == q.correct_answer:
                    correct += 1

        accuracy = (correct / attempted) * 100.0 if attempted > 0 else 0.0

        # Mastery calculation:
        # Not Started: 0 attempts
        # Mastered: Accuracy >= 80%
        # Needs Practice: Accuracy < 70%
        # Reviewing: Accuracy between 70% and 79%
        if attempted == 0:
            status = "Not Started"
            goal_completed = False
        elif accuracy >= 80.0:
            status = "Mastered"
        elif accuracy < 70.0:
            status = "Needs Practice"
            goal_completed = False
        else:
            status = "Reviewing"
            goal_completed = False

        topic_details.append(
            schemas.TopicProgressDetail(
                id=topic.id,
                name=topic.name,
                questions_attempted=attempted,
                questions_correct=correct,
                accuracy=accuracy,
                mastery_status=status
            )
        )

    # Check if the goal should be marked completed
    if goal_completed and db_goal.completed == 0:
        db_goal.completed = 1
        db.commit()
    elif not goal_completed and db_goal.completed == 1:
        db_goal.completed = 0
        db.commit()

    return schemas.LearningGoalDetailResponse(
        id=db_goal.id,
        user_id=db_goal.user_id,
        title=db_goal.title,
        description=db_goal.description,
        completed=(db_goal.completed == 1),
        created_at=db_goal.created_at,
        topics=topic_details,
        document_ids=doc_ids,
        quiz_ids=quiz_ids
    )


@app.delete("/learning-goals/{goal_id}", tags=["Learning Goals"])
def delete_learning_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Deletes a specific learning goal, verifying owner authorization.
    """
    db_goal = db.query(models.LearningGoal).filter(
        models.LearningGoal.id == goal_id,
        models.LearningGoal.user_id == current_user.id
    ).first()
    if not db_goal:
        raise HTTPException(status_code=404, detail="Learning goal not found")

    db.delete(db_goal)
    db.commit()
    return {"message": "Learning goal deleted successfully"}


