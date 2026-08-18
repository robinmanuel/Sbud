from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.schemas import ChatRequest, ChatResponse

app = FastAPI(
    title="SBud API",
    description="Backend API for SBud educational assistant helper.",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", tags=["General"])
async def root():
    """
    Root endpoint offering a simple welcome message and status.
    """
    return {"message": "Welcome to SBud API"}

@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: ChatRequest):
    """
    Echoes back the student's message in a response object.
    
    - **message**: The student's text input (must be a non-empty string).
    """
    try:
        reply_message = f"You asked: {request.message}"
        return ChatResponse(reply=reply_message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
