from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Conversation(Base):
    """
    SQLAlchemy model representing a chat conversation.
    """
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # One-to-many relationship with Message
    messages = relationship(
        "Message", 
        back_populates="conversation", 
        cascade="all, delete-orphan",
        order_by="Message.created_at.asc()"
    )

class Message(Base):
    """
    SQLAlchemy model representing a single message in a conversation.
    """
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, 
        ForeignKey("conversations.id", ondelete="CASCADE"), 
        nullable=False
    )
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Reference back to the parent conversation
    conversation = relationship("Conversation", back_populates="messages")
