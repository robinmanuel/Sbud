import json
from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.database import Base, get_db
from app import models
from app.ai_service import AIService

# Setup memory database for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

main.app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    # Lightweight auto-migrations
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE documents ADD COLUMN learning_goal_id INTEGER;"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE quizzes ADD COLUMN learning_goal_id INTEGER;"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE quiz_questions ADD COLUMN topic_id INTEGER;"))
                conn.commit()
            except Exception:
                pass
    except Exception:
        pass
    yield
    Base.metadata.drop_all(bind=engine)

client = TestClient(main.app)

@pytest.fixture
def mock_gemini():
    original_model = main.model
    mock_model = MagicMock()
    mock_model.generate_content_async = AsyncMock()
    
    main.model = mock_model
    AIService.mock_model = mock_model
    
    yield mock_model
    
    main.model = original_model
    AIService.mock_model = None

@pytest.fixture
def auth_headers():
    register_payload = {"email": "student@example.com", "password": "securepassword"}
    client.post("/auth/register", json=register_payload)
    login_resp = client.post("/auth/login", json=register_payload)
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_create_learning_goal_option_a(mock_gemini, auth_headers):
    """
    Test creating a learning goal by student prompt only (Option A).
    """
    # Mock AI response for goal extraction
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "goal_title": "Python for Exam",
        "description": "Master core concepts of Python for university exams.",
        "topics": ["Variables", "Functions", "Loops"]
    })
    mock_gemini.generate_content_async.return_value = mock_response

    payload = {
        "title": "Learn Python for my university exam",
        "description": "Need to pass the CS101 final next week"
    }

    response = client.post("/learning-goals", json=payload, headers=auth_headers)
    assert response.status_code == 201
    
    data = response.json()
    assert data["title"] == "Learn Python for my university exam" # Student specified title
    assert len(data["topics"]) == 3
    assert data["topics"][0]["name"] == "Variables"
    assert data["topics"][1]["name"] == "Functions"
    assert data["topics"][2]["name"] == "Loops"

def test_list_learning_goals(mock_gemini, auth_headers):
    """
    Test listing multiple learning goals.
    """
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "goal_title": "Calculus",
        "description": "Learn Derivatives",
        "topics": ["Limits", "Derivatives"]
    })
    mock_gemini.generate_content_async.return_value = mock_response

    # Create Goal 1
    client.post("/learning-goals", json={"title": "Calculus"}, headers=auth_headers)

    # List Goals
    response = client.get("/learning-goals", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Calculus"
    assert len(data[0]["topics"]) == 2

def test_get_learning_goal_details_with_mastery(mock_gemini, auth_headers):
    """
    Test retrieving a learning goal's details and calculating dynamic topic mastery.
    """
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "goal_title": "Physics 101",
        "description": "Mechanics and Forces",
        "topics": ["Gravity", "Velocity", "Friction"]
    })
    mock_gemini.generate_content_async.return_value = mock_response

    # Create Goal
    create_resp = client.post("/learning-goals", json={"title": "Physics 101"}, headers=auth_headers)
    goal_id = create_resp.json()["id"]
    topics = create_resp.json()["topics"]

    # Locate topic IDs
    gravity_topic_id = next(t["id"] for t in topics if t["name"] == "Gravity")
    velocity_topic_id = next(t["id"] for t in topics if t["name"] == "Velocity")
    friction_topic_id = next(t["id"] for t in topics if t["name"] == "Friction")

    # Manually populate some mock question answers in the DB to test calculations
    db = TestingSessionLocal()
    
    # 1. Create a dummy Quiz linked to the goal
    # Create a dummy Document first
    doc = models.Document(user_id=1, filename="syllabus.pdf", file_type="application/pdf", file_size=1024, learning_goal_id=goal_id)
    db.add(doc)
    db.commit()

    quiz = models.Quiz(user_id=1, document_id=doc.id, learning_goal_id=goal_id, title="Physics Quiz", score=2)
    db.add(quiz)
    db.commit()

    # 2. Add Questions for "Gravity" (Attempted: 3, Correct: 3 => 100% => Mastered)
    for i in range(3):
        q = models.QuizQuestion(
            quiz_id=quiz.id,
            question_text=f"Gravity Q{i}",
            options=json.dumps(["A", "B", "C", "D"]),
            correct_answer="A",
            explanation="Gravity explanation",
            student_answer="A",
            topic="Gravity",
            topic_id=gravity_topic_id
        )
        db.add(q)

    # 3. Add Questions for "Velocity" (Attempted: 2, Correct: 1 => 50% => Needs Practice)
    q1 = models.QuizQuestion(
        quiz_id=quiz.id,
        question_text="Velocity Q1",
        options=json.dumps(["A", "B", "C", "D"]),
        correct_answer="A",
        explanation="Velocity explanation 1",
        student_answer="A",
        topic="Velocity",
        topic_id=velocity_topic_id
    )
    q2 = models.QuizQuestion(
        quiz_id=quiz.id,
        question_text="Velocity Q2",
        options=json.dumps(["A", "B", "C", "D"]),
        correct_answer="A",
        explanation="Velocity explanation 2",
        student_answer="B",
        topic="Velocity",
        topic_id=velocity_topic_id
    )
    db.add(q1)
    db.add(q2)

    # Friction is untouched => Not Started

    db.commit()
    db.close()

    # Get Goal Details
    response = client.get(f"/learning-goals/{goal_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == goal_id
    assert len(data["document_ids"]) == 1
    assert len(data["quiz_ids"]) == 1

    topics_progress = {t["name"]: t for t in data["topics"]}
    
    assert topics_progress["Gravity"]["questions_attempted"] == 3
    assert topics_progress["Gravity"]["questions_correct"] == 3
    assert topics_progress["Gravity"]["accuracy"] == 100.0
    assert topics_progress["Gravity"]["mastery_status"] == "Mastered"

    assert topics_progress["Velocity"]["questions_attempted"] == 2
    assert topics_progress["Velocity"]["questions_correct"] == 1
    assert topics_progress["Velocity"]["accuracy"] == 50.0
    assert topics_progress["Velocity"]["mastery_status"] == "Needs Practice"

    assert topics_progress["Friction"]["questions_attempted"] == 0
    assert topics_progress["Friction"]["mastery_status"] == "Not Started"

def test_delete_learning_goal(mock_gemini, auth_headers):
    """
    Test deleting a learning goal.
    """
    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "goal_title": "Goal to Delete",
        "description": "N/A",
        "topics": ["Topic"]
    })
    mock_gemini.generate_content_async.return_value = mock_response

    # Create Goal
    create_resp = client.post("/learning-goals", json={"title": "To Delete"}, headers=auth_headers)
    goal_id = create_resp.json()["id"]

    # Delete Goal
    del_resp = client.delete(f"/learning-goals/{goal_id}", headers=auth_headers)
    assert del_resp.status_code == 200
    
    # Confirm it's gone
    get_resp = client.get(f"/learning-goals/{goal_id}", headers=auth_headers)
    assert get_resp.status_code == 404
