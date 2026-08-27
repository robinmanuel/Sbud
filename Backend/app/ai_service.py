import os
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
import google.generativeai as genai

from app import models

# Rate limits definitions (requests per rolling hour)
RATE_LIMITS = {
    "chat": 20,
    "quiz_generation": 5,
    "summaries": 5
}

SYSTEM_INSTRUCTION = (
    "You are an AI study tutor. Your goal is to help students learn effectively. "
    "Please follow these behavioral guidelines:\n"
    "1. Explain concepts clearly and adapt the explanation to the student's level.\n"
    "2. Prefer teaching and guiding the student over simply giving direct answers.\n"
    "3. Break down difficult or complex concepts into smaller, digestible pieces.\n"
    "4. Use practical examples, scenarios, and analogies where helpful.\n"
    "5. Ask a relevant follow-up question at the end of your response to help the student think and learn.\n"
    "6. If the student asks for an answer to a homework/study problem, explain the step-by-step reasoning "
    "and logic rather than only providing the final answer.\n"
    "7. Never make up facts or pretend to know something you do not know. If you are unsure, be honest.\n"
    "8. Keep your responses reasonably concise, unless the student explicitly asks for more detail.\n"
    "9. If study materials are provided under [SUPPLIED STUDY MATERIAL CONTEXT], use them to answer the student's question. "
    "If the material doesn't contain enough information to answer the question, explicitly state that you do not "
    "have that information rather than inventing an answer. Clearly distinguish information from the student's materials "
    "from general knowledge."
)

QUIZ_GENERATOR_INSTRUCTION = (
    "You are an expert academic quiz designer. Your task is to generate multiple-choice questions "
    "to test a student's comprehension of the supplied study materials.\n\n"
    "Generate a multiple-choice quiz adhering to these strict output constraints:\n"
    "1. Output MUST be a valid JSON array of objects. Do not include markdown code fence formatting (like ```json ... ```) in your raw response.\n"
    "2. Each object in the array represents a question and MUST contain the following keys exactly:\n"
    "   - \"question\": The question text.\n"
    "   - \"options\": A JSON list of 4 options, each prefixed with \"A. \", \"B. \", \"C. \", and \"D. \".\n"
    "   - \"correct_answer\": The single letter corresponding to the correct option: \"A\", \"B\", \"C\", or \"D\".\n"
    "   - \"explanation\": A clear explanation of why that answer is correct and why the others are incorrect.\n"
    "   - \"subject\": The broad academic subject area (e.g. \"Physics\", \"Biology\", \"History\").\n"
    "   - \"topic\": The specific study topic within that subject (e.g. \"Newton's Laws\", \"Mitosis\", \"American Revolution\").\n"
    "3. Keep the questions focused on testing key conceptual understanding rather than trivial details."
)

GOAL_GENERATOR_INSTRUCTION = (
    "You are an expert curriculum planner and study coach. Your task is to analyze a student's learning target "
    "and/or uploaded study materials, and decompose it into a structured learning goal and a set of 4 to 8 distinct, key topics/concepts to master.\n\n"
    "Generate a JSON object matching the following output constraints:\n"
    "1. Output MUST be a valid JSON object. Do not include markdown code fence formatting (like ```json ... ```) in your raw response.\n"
    "2. The object MUST contain the following keys exactly:\n"
    "   - \"goal_title\": A concise, polished, and standardized title for the learning goal (e.g. \"Python Programming Basics\" or \"AP Calculus Preparation\").\n"
    "   - \"topics\": A JSON array of 4 to 8 distinct string subtopics/concepts that represent the core pillars of this goal (e.g., [\"Variables\", \"Functions\", \"Loops\"]). Each subtopic name must be very short, concise, and clear (1-3 words max).\n"
    "   - \"description\": A brief, encouraging 1-2 sentence description summarizing the target scope.\n"
    "3. Focus on logical, step-by-step breakdown of concepts needed to answer: 'Does this student actually know this?'"
)

class AIService:
    mock_model = None

    @staticmethod
    def get_model(feature: str) -> genai.GenerativeModel:
        """
        Retrieves configured Gemini model based on feature requirements.
        """
        if AIService.mock_model is not None:
            return AIService.mock_model

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Gemini API Key is not configured on the backend."
            )
        
        genai.configure(api_key=api_key)
        
        if feature == "quiz_generation":
            return genai.GenerativeModel(
                "gemini-3.6-flash",
                system_instruction=QUIZ_GENERATOR_INSTRUCTION
            )
        elif feature == "goal_generation":
            return genai.GenerativeModel(
                "gemini-3.6-flash",
                system_instruction=GOAL_GENERATOR_INSTRUCTION
            )
        else:
            return genai.GenerativeModel(
                "gemini-3.6-flash",
                system_instruction=SYSTEM_INSTRUCTION
            )

    @staticmethod
    def check_rate_limit(user_id: int, feature: str, db: Session):
        """
        Enforces rolling 1-hour rate limits per feature for a specific user.
        """
        limit = RATE_LIMITS.get(feature)
        if limit is None:
            return # No rate limits configured for this feature type

        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        
        # Count usage records in the past rolling hour
        count = db.query(models.AIUsage).filter(
            models.AIUsage.user_id == user_id,
            models.AIUsage.feature == feature,
            models.AIUsage.created_at >= one_hour_ago
        ).count()

        if count >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. You can only make {limit} {feature.replace('_', ' ')} requests per hour."
            )

    @staticmethod
    def log_usage(user_id: int, feature: str, model_name: str, input_tokens: int, output_tokens: int, db: Session):
        """
        Writes token and model usage metrics record to DB.
        """
        try:
            log_record = models.AIUsage(
                user_id=user_id,
                feature=feature,
                model=model_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens
            )
            db.add(log_record)
            db.commit()
        except Exception as e:
            print(f"WARNING: Failed to log AI usage metrics: {e}")
            db.rollback()

    @staticmethod
    def get_cached_response(prompt_payload: str, feature: str, db: Session) -> Optional[str]:
        """
        Checks cache repository for identical prompt strings.
        """
        prompt_hash = hashlib.sha256(prompt_payload.encode("utf-8")).hexdigest()
        cache_hit = db.query(models.AICache).filter_by(
            prompt_hash=prompt_hash,
            feature=feature
        ).first()

        if cache_hit:
            print(f"DEBUG AI - Cache Hit for feature: {feature}")
            return cache_hit.response
        return None

    @staticmethod
    def save_cached_response(prompt_payload: str, response_text: str, feature: str, db: Session):
        """
        Saves static generation responses into Cache.
        """
        try:
            prompt_hash = hashlib.sha256(prompt_payload.encode("utf-8")).hexdigest()
            cache_record = models.AICache(
                prompt_hash=prompt_hash,
                prompt=prompt_payload,
                response=response_text,
                feature=feature
            )
            db.add(cache_record)
            db.commit()
        except Exception as e:
            print(f"WARNING: Failed to save AI cache record: {e}")
            db.rollback()

    @classmethod
    async def generate_chat_response(cls, contents: list, user_id: int, db: Session) -> str:
        """
        Handles chat tutor requests, executing rate limits and logging.
        """
        feature = "chat"
        cls.check_rate_limit(user_id, feature, db)

        model_instance = cls.get_model(feature)
        model_name = "gemini-3.6-flash"

        # Calculate approximate input tokens
        # Standard fallback: characters / 4
        flat_contents = str(contents)
        approx_input = len(flat_contents) // 4

        try:
            response = await model_instance.generate_content_async(contents)
            reply = response.text

            # Get token stats if supported, fallback to char count estimation
            input_tokens = approx_input
            output_tokens = len(reply) // 4

            if hasattr(response, "usage_metadata") and response.usage_metadata:
                if response.usage_metadata.prompt_token_count:
                    input_tokens = response.usage_metadata.prompt_token_count
                if response.usage_metadata.candidates_token_count:
                    output_tokens = response.usage_metadata.candidates_token_count

            # Log metrics
            cls.log_usage(user_id, feature, model_name, input_tokens, output_tokens, db)
            return reply

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI tutor model invocation failed: {str(e)}"
            )

    @classmethod
    async def generate_quiz(cls, document_text: str, user_id: int, db: Session, topics: Optional[List[str]] = None) -> list:
        """
        Generates study quizzes from document texts, supporting caching and usage checks.
        """
        feature = "quiz_generation"
        
        # 1. Enforce rate limits
        cls.check_rate_limit(user_id, feature, db)

        # 2. Check Cache
        # Include topics in cache key if provided
        cache_key = document_text
        if topics:
            cache_key += f"\ntopics:{','.join(topics)}"
        cached_result = cls.get_cached_response(cache_key, feature, db)
        if cached_result:
            return json.loads(cached_result)

        # 3. Cache Miss - Execute Gemini Call
        model_instance = cls.get_model(feature)
        model_name = "gemini-3.6-flash"

        topic_instruction = ""
        if topics:
            topic_instruction = (
                f"The quiz MUST focus specifically on testing comprehension of these subtopics: {', '.join(topics)}.\n"
                "Each question must cover one of these subtopics and assign that exact subtopic name (word-for-word) to the 'topic' field in the output JSON.\n"
            )

        prompt = (
            f"[STUDY MATERIAL]\n{document_text}\n\n"
            f"Generate a 5-question multiple-choice quiz based on this study material.\n"
            f"{topic_instruction}"
        )
        approx_input = len(prompt) // 4

        try:
            response = await model_instance.generate_content_async(
                contents=[prompt],
                generation_config={"response_mime_type": "application/json"}
            )
            raw_text = response.text
            if not raw_text:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Empty response received from the quiz generator."
                )

            # Validate output is valid JSON
            questions_data = json.loads(raw_text)
            if not isinstance(questions_data, list) or len(questions_data) == 0:
                raise ValueError("Returned JSON is not a valid list of questions.")

            # Calculate tokens
            input_tokens = approx_input
            output_tokens = len(raw_text) // 4

            if hasattr(response, "usage_metadata") and response.usage_metadata:
                if response.usage_metadata.prompt_token_count:
                    input_tokens = response.usage_metadata.prompt_token_count
                if response.usage_metadata.candidates_token_count:
                    output_tokens = response.usage_metadata.candidates_token_count

            # 4. Save to Cache
            cls.save_cached_response(cache_key, raw_text, feature, db)

            # 5. Log usage metrics
            cls.log_usage(user_id, feature, model_name, input_tokens, output_tokens, db)

            return questions_data

        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Tutor quiz generator did not output valid JSON. Please try again."
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Tutor quiz generator invocation failed: {str(e)}"
            )

    @classmethod
    async def generate_learning_goal(
        cls,
        user_prompt: Optional[str],
        document_text: Optional[str],
        user_id: int,
        db: Session
    ) -> dict:
        """
        Generates a learning goal title, description, and list of subtopics
        from a user description (Option A), document text (Option B), or both (Option C).
        """
        feature = "goal_generation"
        # Rate limiting: use the summaries rate limit as a proxy or default to summaries rate limit
        cls.check_rate_limit(user_id, "summaries", db)

        # Build prompt payload
        prompt_parts = []
        if user_prompt:
            prompt_parts.append(f"STUDENT SPECIFIED TARGET: {user_prompt}")
        if document_text:
            # Send first 10,000 characters of the document text to avoid blowing token count on large PDFs
            preview_text = document_text[:12000]
            prompt_parts.append(f"EXTRACTED MATERIAL TEXT PREVIEW:\n{preview_text}")
        
        prompt_payload = "\n\n".join(prompt_parts)
        if not prompt_payload.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either a goal description or document text is required to generate a goal."
            )

        prompt = (
            f"[INPUT SOURCE INFO]\n{prompt_payload}\n\n"
            "Create a learning goal and decompose it into 4 to 8 key subtopics in JSON format."
        )

        # Check Cache
        cached_result = cls.get_cached_response(prompt, feature, db)
        if cached_result:
            return json.loads(cached_result)

        model_instance = cls.get_model(feature)
        model_name = "gemini-3.6-flash"
        approx_input = len(prompt) // 4

        try:
            response = await model_instance.generate_content_async(
                contents=[prompt],
                generation_config={"response_mime_type": "application/json"}
            )
            raw_text = response.text
            if not raw_text:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Empty response received from the goal generator."
                )

            # Validate output is valid JSON
            goal_data = json.loads(raw_text)
            if "goal_title" not in goal_data or "topics" not in goal_data:
                raise ValueError("Returned JSON is missing required fields.")
            
            if not isinstance(goal_data["topics"], list) or len(goal_data["topics"]) == 0:
                raise ValueError("Topics is not a valid list.")

            # Calculate tokens
            input_tokens = approx_input
            output_tokens = len(raw_text) // 4

            if hasattr(response, "usage_metadata") and response.usage_metadata:
                if response.usage_metadata.prompt_token_count:
                    input_tokens = response.usage_metadata.prompt_token_count
                if response.usage_metadata.candidates_token_count:
                    output_tokens = response.usage_metadata.candidates_token_count

            # Save to Cache
            cls.save_cached_response(prompt, raw_text, feature, db)

            # Log usage
            cls.log_usage(user_id, "summaries", model_name, input_tokens, output_tokens, db)

            return goal_data

        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Tutor goal generator did not output valid JSON. Please try again."
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Tutor goal generator invocation failed: {str(e)}"
            )
