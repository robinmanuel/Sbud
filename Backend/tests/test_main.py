from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.database import Base, get_db
from app import models

# SQLite test database URL in-memory with StaticPool to keep connection alive
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency override
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

main.app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_database():
    """
    Fixture to create all tables before each test and drop them after.
    Ensures a clean database state for every test case.
    """
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

client = TestClient(main.app)

@pytest.fixture
def mock_gemini():
    # Store the original model
    original_model = main.model
    # Create a mock model
    mock_model = MagicMock()
    mock_model.generate_content_async = AsyncMock()
    
    # Assign the mock model to the application
    main.model = mock_model
    
    yield mock_model
    
    # Restore the original model
    main.model = original_model

def test_root_endpoint():
    """
    Test that the root endpoint returns a 200 welcome message.
    """
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to SBud API"}

def test_chat_success(mock_gemini):
    """
    Test that a valid chat history is correctly mapped, sent to the Gemini API, 
    and the reply is returned successfully.
    """
    mock_response = MagicMock()
    mock_response.text = "Sunlight is important because it provides the energy required for photosynthesis."
    mock_gemini.generate_content_async.return_value = mock_response
    
    payload = {
        "messages": [
            {"role": "user", "content": "Explain photosynthesis."},
            {"role": "assistant", "content": "Photosynthesis is the process..."},
            {"role": "user", "content": "Why is sunlight important?"}
        ]
    }
    
    response = client.post("/chat", json=payload)
    
    assert response.status_code == 200
    assert response.json() == {"reply": "Sunlight is important because it provides the energy required for photosynthesis."}
    
    # Verify that mapping converted 'assistant' role to 'model' and wrapped content in 'parts'
    expected_contents = [
        {"role": "user", "parts": ["Explain photosynthesis."]},
        {"role": "model", "parts": ["Photosynthesis is the process..."]},
        {"role": "user", "parts": ["Why is sunlight important?"]}
    ]
    mock_gemini.generate_content_async.assert_called_once_with(expected_contents)

def test_chat_validation_empty_messages():
    """
    Test that sending an empty messages array returns a 422 Unprocessable Entity error.
    """
    payload = {
        "messages": []
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 422

def test_chat_validation_invalid_role():
    """
    Test that sending a message with an invalid role returns a 422 Unprocessable Entity error.
    """
    payload = {
        "messages": [
            {"role": "system", "content": "You are a tutee."}
        ]
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 422

def test_chat_validation_empty_content():
    """
    Test that sending a message with empty content returns a 422 Unprocessable Entity error.
    """
    payload = {
        "messages": [
            {"role": "user", "content": ""}
        ]
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 422

@patch("app.main.os.getenv")
def test_chat_missing_api_key(mock_getenv, mock_gemini):
    """
    Test that a 500 internal server error is returned when the model is not configured 
    and no API key is present in environment variables.
    """
    # Set model to None and mock getenv to return None for API key
    main.model = None
    mock_getenv.return_value = None
    
    payload = {
        "messages": [
            {"role": "user", "content": "Hello"}
        ]
    }
    
    response = client.post("/chat", json=payload)
    assert response.status_code == 500
    assert "Gemini API Key is not configured" in response.json()["detail"]


# =====================================================================
# Database-Backed Conversations and Messages Endpoint Tests
# =====================================================================

def test_create_conversation():
    """
    Test that creating a conversation successfully creates and returns metadata.
    """
    response = client.post("/conversations")
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert "created_at" in data

def test_get_conversation_not_found():
    """
    Test that requesting a non-existent conversation returns a 404 error.
    """
    response = client.get("/conversations/9999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"

def test_get_conversation_empty():
    """
    Test that a newly created conversation has no messages initially.
    """
    # Create the conversation
    create_resp = client.post("/conversations")
    conv_id = create_resp.json()["id"]

    # Fetch it
    get_resp = client.get(f"/conversations/{conv_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == conv_id
    assert data["messages"] == []

def test_create_message_success(mock_gemini):
    """
    Test sending a message to a conversation. Saves the user message, invokes AI, 
    saves AI response, and retrieves complete conversation history.
    """
    # Mock Gemini response
    mock_response = MagicMock()
    mock_response.text = "Hello! I am ready to help you with your studies."
    mock_gemini.generate_content_async.return_value = mock_response

    # Create the conversation
    create_resp = client.post("/conversations")
    conv_id = create_resp.json()["id"]

    # Post user message to conversation
    payload = {"content": "Hello, study assistant!"}
    msg_resp = client.post(f"/conversations/{conv_id}/messages", json=payload)
    
    assert msg_resp.status_code == 200
    data = msg_resp.json()
    assert data["conversation_id"] == conv_id
    assert data["role"] == "assistant"
    assert data["content"] == "Hello! I am ready to help you with your studies."
    assert "id" in data
    assert "created_at" in data

    # Verify that both user and assistant messages were saved in the database
    history_resp = client.get(f"/conversations/{conv_id}")
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history["messages"]) == 2
    
    # Check User Message
    assert history["messages"][0]["role"] == "user"
    assert history["messages"][0]["content"] == "Hello, study assistant!"
    
    # Check Assistant Message
    assert history["messages"][1]["role"] == "assistant"
    assert history["messages"][1]["content"] == "Hello! I am ready to help you with your studies."

def test_create_message_not_found():
    """
    Test sending a message to a non-existent conversation returns a 404 error.
    """
    payload = {"content": "Hello"}
    response = client.post("/conversations/9999/messages", json=payload)
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"

def test_create_message_validation():
    """
    Test validation checks (e.g., empty body or empty message content) on message sending.
    """
    # Create the conversation
    create_resp = client.post("/conversations")
    conv_id = create_resp.json()["id"]

    # Empty payload
    response = client.post(f"/conversations/{conv_id}/messages", json={})
    assert response.status_code == 422

    # Empty content string
    response = client.post(f"/conversations/{conv_id}/messages", json={"content": ""})
    assert response.status_code == 422
