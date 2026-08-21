from pydantic import BaseModel, Field
from typing import List, Literal
from datetime import datetime

# Existing schemas for stateful /chat (backward compatibility)
class Message(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="The role of the sender")
    content: str = Field(..., min_length=1, description="The content of the message")

class ChatRequest(BaseModel):
    messages: List[Message] = Field(..., min_length=1, description="The conversation history")

class ChatResponse(BaseModel):
    reply: str = Field(..., description="The response reply to the student")


# New database-backed schemas
class MessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, description="The message content")

class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class ConversationCreateResponse(BaseModel):
    id: int
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class ConversationDetailResponse(BaseModel):
    id: int
    created_at: datetime
    messages: List[MessageResponse]

    model_config = {
        "from_attributes": True
    }
