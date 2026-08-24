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

@pytest.fixture
def auth_headers():
    """
    Fixture that registers and logs in a test user, returning the Bearer Authorization header.
    """
    register_payload = {"email": "testuser@example.com", "password": "testpassword"}
    client.post("/auth/register", json=register_payload)
    login_resp = client.post("/auth/login", json=register_payload)
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_root_endpoint():
    """
    Test that the root endpoint returns a 200 welcome message without authentication.
    """
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to SBud API"}


# =====================================================================
# Authentication Endpoint Tests
# =====================================================================

def test_register_user_success():
    """
    Test that registration works with valid data, hashes passwords, and doesn't store plaintext.
    """
    payload = {"email": "student@example.com", "password": "securepassword"}
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    
    data = response.json()
    assert data["email"] == "student@example.com"
    assert "id" in data
    assert "created_at" in data

    # Verify in DB that it is stored and NOT in plaintext
    db = TestingSessionLocal()
    db_user = db.query(models.User).filter(models.User.email == "student@example.com").first()
    assert db_user is not None
    assert db_user.password_hash != "securepassword"
    db.close()

def test_register_duplicate_email():
    """
    Test that registering an email that already exists returns a 400 Bad Request error.
    """
    payload = {"email": "student@example.com", "password": "securepassword"}
    response1 = client.post("/auth/register", json=payload)
    assert response1.status_code == 201

    response2 = client.post("/auth/register", json=payload)
    assert response2.status_code == 400
    assert response2.json()["detail"] == "Email is already registered"

def test_login_user_success():
    """
    Test that login succeeds with correct credentials and returns a valid JWT token.
    """
    # Register first
    register_payload = {"email": "student@example.com", "password": "securepassword"}
    client.post("/auth/register", json=register_payload)

    # Login
    response = client.post("/auth/login", json=register_payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_user_invalid_credentials():
    """
    Test that login fails and returns a 400 Bad Request error when credentials are wrong.
    """
    # Register first
    register_payload = {"email": "student@example.com", "password": "securepassword"}
    client.post("/auth/register", json=register_payload)

    # Login with wrong password
    login_payload = {"email": "student@example.com", "password": "wrongpassword"}
    response = client.post("/auth/login", json=login_payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Incorrect email or password"

def test_get_me_success(auth_headers):
    """
    Test that GET /users/me successfully returns details of the authenticated user.
    """
    response = client.get("/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "testuser@example.com"
    assert "id" in data


# =====================================================================
# Security Boundary Tests
# =====================================================================

def test_unauthenticated_protected_endpoints():
    """
    Test that protected endpoints return 401 Unauthorized when no authentication is provided.
    """
    # Test POST /chat
    response = client.post("/chat", json={"messages": [{"role": "user", "content": "Hello"}]})
    assert response.status_code == 401

    # Test POST /conversations
    response = client.post("/conversations")
    assert response.status_code == 401

    # Test GET /conversations/1
    response = client.get("/conversations/1")
    assert response.status_code == 401

    # Test POST /conversations/1/messages
    response = client.post("/conversations/1/messages", json={"content": "Hello"})
    assert response.status_code == 401

def test_user_isolation(auth_headers):
    """
    Test data boundary enforcement: User A cannot retrieve or modify User B's conversations.
    """
    # Create conversation for User A (using auth_headers fixture)
    convA_resp = client.post("/conversations", headers=auth_headers)
    assert convA_resp.status_code == 201
    convA_id = convA_resp.json()["id"]

    # Register & Login User B
    userB_payload = {"email": "userB@example.com", "password": "userBpassword"}
    client.post("/auth/register", json=userB_payload)
    login_resp = client.post("/auth/login", json=userB_payload)
    userB_token = login_resp.json()["access_token"]
    userB_headers = {"Authorization": f"Bearer {userB_token}"}

    # User B tries to fetch User A's conversation -> should get 404 Not Found
    response_get = client.get(f"/conversations/{convA_id}", headers=userB_headers)
    assert response_get.status_code == 404

    # User B tries to post a message to User A's conversation -> should get 404 Not Found
    response_post = client.post(f"/conversations/{convA_id}/messages", json={"content": "Hello"}, headers=userB_headers)
    assert response_post.status_code == 404

    # User B tries to chat on User A's conversation id -> should get 404 Not Found
    payload_chat = {
        "messages": [{"role": "user", "content": "Hi"}],
        "conversation_id": convA_id
    }
    response_chat = client.post("/chat", json=payload_chat, headers=userB_headers)
    assert response_chat.status_code == 404


# =====================================================================
# Chat Endpoint Tests
# =====================================================================

def test_chat_success(mock_gemini, auth_headers):
    """
    Test that a valid chat history is correctly mapped, sent to the Gemini API, 
    persisted under the authenticated user, and response returned successfully.
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
    
    response = client.post("/chat", json=payload, headers=auth_headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Sunlight is important because it provides the energy required for photosynthesis."
    assert "conversation_id" in data
    
    # Verify that mapping converted 'assistant' role to 'model' and wrapped content in 'parts'
    expected_contents = [
        {"role": "user", "parts": ["Explain photosynthesis."]},
        {"role": "model", "parts": ["Photosynthesis is the process..."]},
        {"role": "user", "parts": ["Why is sunlight important?"]}
    ]
    mock_gemini.generate_content_async.assert_called_once_with(expected_contents)

def test_chat_with_conversation_id_success(mock_gemini, auth_headers):
    """
    Test that sending a chat with a conversation_id successfully saves the latest user message
    to that conversation and responds.
    """
    # Create a conversation first
    conv_resp = client.post("/conversations", headers=auth_headers)
    assert conv_resp.status_code == 201
    conv_id = conv_resp.json()["id"]

    # Mock Gemini response
    mock_response = MagicMock()
    mock_response.text = "Water is crucial for photosynthesis."
    mock_gemini.generate_content_async.return_value = mock_response

    payload = {
        "messages": [
            {"role": "user", "content": "What about water?"}
        ],
        "conversation_id": conv_id
    }

    response = client.post("/chat", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Water is crucial for photosynthesis."
    assert data["conversation_id"] == conv_id

    # Verify message count in database
    history_resp = client.get(f"/conversations/{conv_id}", headers=auth_headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history["messages"]) == 2
    assert history["messages"][0]["role"] == "user"
    assert history["messages"][0]["content"] == "What about water?"
    assert history["messages"][1]["role"] == "assistant"
    assert history["messages"][1]["content"] == "Water is crucial for photosynthesis."

def test_chat_conversation_id_not_found(mock_gemini, auth_headers):
    """
    Test that sending a chat with a non-existent conversation_id returns a 404 error.
    """
    payload = {
        "messages": [
            {"role": "user", "content": "Hello"}
        ],
        "conversation_id": 9999
    }
    response = client.post("/chat", json=payload, headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"

def test_chat_validation_empty_messages(auth_headers):
    """
    Test that sending an empty messages array returns a 422 Unprocessable Entity error.
    """
    payload = {
        "messages": []
    }
    response = client.post("/chat", json=payload, headers=auth_headers)
    assert response.status_code == 422

def test_chat_validation_invalid_role(auth_headers):
    """
    Test that sending a message with an invalid role returns a 422 Unprocessable Entity error.
    """
    payload = {
        "messages": [
            {"role": "system", "content": "You are a tutee."}
        ]
    }
    response = client.post("/chat", json=payload, headers=auth_headers)
    assert response.status_code == 422

def test_chat_validation_empty_content(auth_headers):
    """
    Test that sending a message with empty content returns a 422 Unprocessable Entity error.
    """
    payload = {
        "messages": [
            {"role": "user", "content": ""}
        ]
    }
    response = client.post("/chat", json=payload, headers=auth_headers)
    assert response.status_code == 422

@patch("app.main.os.getenv")
def test_chat_missing_api_key(mock_getenv, mock_gemini, auth_headers):
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
    
    response = client.post("/chat", json=payload, headers=auth_headers)
    assert response.status_code == 500
    assert "Gemini API Key is not configured" in response.json()["detail"]


# =====================================================================
# Database-Backed Conversations and Messages Endpoint Tests
# =====================================================================

def test_create_conversation(auth_headers):
    """
    Test that creating a conversation successfully creates and returns metadata.
    """
    response = client.post("/conversations", headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert "user_id" in data
    assert "created_at" in data

def test_get_conversation_not_found(auth_headers):
    """
    Test that requesting a non-existent conversation returns a 404 error.
    """
    response = client.get("/conversations/9999", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"

def test_get_conversation_empty(auth_headers):
    """
    Test that a newly created conversation has no messages initially.
    """
    # Create the conversation
    create_resp = client.post("/conversations", headers=auth_headers)
    conv_id = create_resp.json()["id"]

    # Fetch it
    get_resp = client.get(f"/conversations/{conv_id}", headers=auth_headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == conv_id
    assert data["messages"] == []

def test_create_message_success(mock_gemini, auth_headers):
    """
    Test sending a message to a conversation. Saves the user message, invokes AI, 
    saves AI response, and retrieves complete conversation history.
    """
    # Mock Gemini response
    mock_response = MagicMock()
    mock_response.text = "Hello! I am ready to help you with your studies."
    mock_gemini.generate_content_async.return_value = mock_response

    # Create the conversation
    create_resp = client.post("/conversations", headers=auth_headers)
    conv_id = create_resp.json()["id"]

    # Post user message to conversation
    payload = {"content": "Hello, study assistant!"}
    msg_resp = client.post(f"/conversations/{conv_id}/messages", json=payload, headers=auth_headers)
    
    assert msg_resp.status_code == 200
    data = msg_resp.json()
    assert data["conversation_id"] == conv_id
    assert data["role"] == "assistant"
    assert data["content"] == "Hello! I am ready to help you with your studies."
    assert "id" in data
    assert "created_at" in data

    # Verify that both user and assistant messages were saved in the database
    history_resp = client.get(f"/conversations/{conv_id}", headers=auth_headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history["messages"]) == 2
    
    # Check User Message
    assert history["messages"][0]["role"] == "user"
    assert history["messages"][0]["content"] == "Hello, study assistant!"
    
    # Check Assistant Message
    assert history["messages"][1]["role"] == "assistant"
    assert history["messages"][1]["content"] == "Hello! I am ready to help you with your studies."

def test_create_message_not_found(auth_headers):
    """
    Test sending a message to a non-existent conversation returns a 404 error.
    """
    payload = {"content": "Hello"}
    response = client.post("/conversations/9999/messages", json=payload, headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"

def test_create_message_validation(auth_headers):
    """
    Test validation checks (e.g., empty body or empty message content) on message sending.
    """
    # Create the conversation
    create_resp = client.post("/conversations", headers=auth_headers)
    conv_id = create_resp.json()["id"]

    # Empty payload
    response = client.post(f"/conversations/{conv_id}/messages", json={}, headers=auth_headers)
    assert response.status_code == 422

    # Empty content string
    response = client.post(f"/conversations/{conv_id}/messages", json={"content": ""}, headers=auth_headers)
    assert response.status_code == 422
