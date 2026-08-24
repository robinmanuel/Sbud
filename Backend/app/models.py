from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base, DB_TYPE

if DB_TYPE == "postgresql":
    from pgvector.sqlalchemy import Vector
    EMBEDDING_TYPE = Vector(768)
else:
    EMBEDDING_TYPE = Text

class User(Base):
    """
    SQLAlchemy model representing a registered user.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # One-to-many relationship with Conversation
    conversations = relationship(
        "Conversation",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    # One-to-many relationship with Document
    documents = relationship(
        "Document",
        back_populates="user",
        cascade="all, delete-orphan"
    )

class Conversation(Base):
    """
    SQLAlchemy model representing a chat conversation.
    """
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    title = Column(String, server_default="New Chat", default="New Chat", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Reference back to the parent user
    user = relationship("User", back_populates="conversations")

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


class Document(Base):
    """
    SQLAlchemy model representing an uploaded study material document.
    """
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Reference back to parent user
    user = relationship("User", back_populates="documents")

    # One-to-many relationship with DocumentChunk
    chunks = relationship(
        "DocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan"
    )


class DocumentChunk(Base):
    """
    SQLAlchemy model representing a chunk of extracted text from a Document.
    Holds text, page info, and its vector embedding.
    """
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False
    )
    chunk_text = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    
    # Store embedding (Vector on PostgreSQL, Text on SQLite)
    embedding = Column(EMBEDDING_TYPE, nullable=False)

    # Reference back to parent document
    document = relationship("Document", back_populates="chunks")
