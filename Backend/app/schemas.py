from pydantic import BaseModel, Field
from typing import List, Literal

class Message(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="The role of the sender")
    content: str = Field(..., min_length=1, description="The content of the message")

class ChatRequest(BaseModel):
    messages: List[Message] = Field(..., min_length=1, description="The conversation history")

class ChatResponse(BaseModel):
    reply: str = Field(..., description="The response reply to the student")
