from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="The message from the student")

class ChatResponse(BaseModel):
    reply: str = Field(..., description="The response reply to the student")
