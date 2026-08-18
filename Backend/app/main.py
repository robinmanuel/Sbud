import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import google.generativeai as genai
from app.schemas import ChatRequest, ChatResponse

# Load environment variables from .env
load_dotenv()

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

# Configure Gemini API
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    # Initialize the generative model (using gemini-3.6-flash as the standard fast model)
    model = genai.GenerativeModel("gemini-3.6-flash")
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
    Sends the student's message to the Gemini AI model and returns the response.
    
    - **message**: The student's text input (must be a non-empty string).
    """
    global model
    
    # Check if AI model is configured
    if not model:
         # Try loading it dynamically in case .env was updated without restarting process (dev convenience)
         dynamic_api_key = os.getenv("GEMINI_API_KEY")
         if dynamic_api_key:
             genai.configure(api_key=dynamic_api_key)
             model = genai.GenerativeModel("gemini-3.6-flash")
         else:
             raise HTTPException(
                 status_code=500,
                 detail="Gemini API Key is not configured on the backend. Please check the .env file."
             )
        
    try:
        # Call the Gemini API asynchronously
        response = await model.generate_content_async(request.message)
        
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
