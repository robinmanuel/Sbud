from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from app import main

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
