from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from datetime import datetime

# Existing schemas for stateful /chat (backward compatibility)
class Message(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="The role of the sender")
    content: str = Field(..., min_length=1, description="The content of the message")

class ChatRequest(BaseModel):
    messages: List[Message] = Field(..., min_length=1, description="The conversation history")
    conversation_id: Optional[int] = Field(None, description="The ID of the conversation to save messages to")

class ChatResponse(BaseModel):
    reply: str = Field(..., description="The response reply to the student")
    conversation_id: int = Field(..., description="The active conversation ID")


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
    user_id: int
    title: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class ConversationDetailResponse(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime
    messages: List[MessageResponse]

    model_config = {
        "from_attributes": True
    }

class ConversationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

# New schemas for User Auth and Profiles
class UserAuthRequest(BaseModel):
    email: str = Field(..., description="The user's email address")
    password: str = Field(..., min_length=6, description="The user's password (min 6 characters)")

class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class DocumentResponse(BaseModel):
    id: int
    user_id: int
    filename: str
    file_type: str
    file_size: int
    learning_goal_id: Optional[int] = None
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class DocumentDetailResponse(BaseModel):
    id: int
    user_id: int
    filename: str
    file_type: str
    file_size: int
    extracted_text: Optional[str]
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class SearchRequest(BaseModel):
    query: str

class ChunkSearchResponse(BaseModel):
    chunk_id: int
    document_id: int
    chunk_text: str
    page_number: Optional[int] = None
    similarity: float

class QuizCreateRequest(BaseModel):
    document_id: int
    learning_goal_id: Optional[int] = None

class QuizQuestionResponse(BaseModel):
    id: int
    question_text: str
    options: List[str]

class QuizResponse(BaseModel):
    id: int
    document_id: int
    title: str
    learning_goal_id: Optional[int] = None
    created_at: datetime
    questions: List[QuizQuestionResponse]

    model_config = {
        "from_attributes": True
    }

class QuizSubmitRequest(BaseModel):
    answers: dict[str, str]

class GradedQuestionResponse(BaseModel):
    id: int
    question_text: str
    options: List[str]
    student_answer: Optional[str]
    correct_answer: str
    explanation: str
    is_correct: bool
    subject: Optional[str] = None
    topic: Optional[str] = None

class QuizResultResponse(BaseModel):
    id: int
    document_id: int
    title: str
    score: int
    total_questions: int
    learning_goal_id: Optional[int] = None
    created_at: datetime
    questions: List[GradedQuestionResponse]

    model_config = {
        "from_attributes": True
    }


class StudentProgressResponse(BaseModel):
    id: int
    subject: str
    topic: str
    questions_attempted: int
    questions_correct: int
    accuracy: float
    last_studied_at: datetime

    model_config = {
        "from_attributes": True
    }


class LearningGoalTopicResponse(BaseModel):
    id: int
    learning_goal_id: int
    name: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


class LearningGoalCreateRequest(BaseModel):
    title: Optional[str] = Field(None, description="The high-level learning goal topic/exam/subject")
    description: Optional[str] = Field(None, description="Additional notes or constraints")
    document_id: Optional[int] = Field(None, description="Optional uploaded document to extract topics from")


class LearningGoalResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    completed: bool
    created_at: datetime
    topics: List[LearningGoalTopicResponse]

    model_config = {
        "from_attributes": True
    }


class TopicProgressDetail(BaseModel):
    id: int
    name: str
    questions_attempted: int
    questions_correct: int
    accuracy: float
    mastery_status: str # "Not Started" | "Mastered" | "Reviewing" | "Needs Practice"


class LearningGoalDetailResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    completed: bool
    created_at: datetime
    topics: List[TopicProgressDetail]
    document_ids: List[int]
    quiz_ids: List[int]

    model_config = {
        "from_attributes": True
    }


