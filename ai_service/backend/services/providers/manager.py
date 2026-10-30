from __future__ import annotations

import json
import logging
from typing import Any
from fastapi import HTTPException

from backend.config import GEMINI_MODEL, LLM_TIMEOUT_SECONDS
from backend.schemas.lessons import (
    ExplainCodeRequest,
    Flashcard,
    FlashcardRequest,
    LessonRequest,
    QuizRequest,
    QuizResponse,
    SyllabusRequest,
)
from backend.services.providers.base import (
    UNTRUSTED_INPUT_INSTRUCTION,
    serialize_user_data,
)
from backend.services.providers.gemini_provider import (
    GeminiProvider,
    gemini_client,
    generate_gemini_content,
    get_gemini_client,
)
from backend.services.providers.groq_provider import (
    GroqProvider,
    groq_client,
    generate_groq_content,
    get_groq_client,
)
from backend.utils.logging_utils import log_event, short_error

logger = logging.getLogger(__name__)

gemini_provider = GeminiProvider()
groq_provider = GroqProvider()


def generate_lesson_script(data: LessonRequest) -> tuple[str, str, str]:
    """Generate lesson script using Gemini, falling back to Groq upon failure."""
    gemini_failure = ""
    try:
        return gemini_provider.generate_lesson_script(data)
    except Exception as gemini_error:
        gemini_failure = short_error(gemini_error)
        log_event(
            "WARN",
            "Gemini lesson generation failed",
            error=gemini_failure,
        )

    log_event("RUN", "Trying Groq fallback for lesson script")
    try:
        return groq_provider.generate_lesson_script(data)
    except Exception as groq_error:
        raise RuntimeError(
            "LLM generation failed: primary provider (Gemini) failed: "
            f"{gemini_failure}; fallback provider (Groq) failed: "
            f"{short_error(groq_error)}"
        ) from groq_error


def generate_syllabus(data: SyllabusRequest) -> dict[str, Any]:
    """Generate course syllabus using Gemini, falling back to Groq upon failure."""
    try:
        return gemini_provider.generate_syllabus(data)
    except Exception as gemini_error:
        log_event(
            "WARN",
            "Gemini syllabus generation failed; trying Groq",
            error=short_error(gemini_error),
        )

        try:
            return groq_provider.generate_syllabus(data)
        except Exception as groq_error:
            log_event(
                "ERROR",
                "Groq syllabus generation failed",
                error=short_error(groq_error),
            )
            raise HTTPException(
                status_code=503,
                detail="Failed to generate syllabus",
            ) from groq_error


def generate_quiz(data: QuizRequest) -> QuizResponse | dict[str, Any]:
    """Generate quiz using Gemini with Groq fallback across up to 2 attempts."""
    system_instruction = f"""
    {UNTRUSTED_INPUT_INSTRUCTION}

    Generate a multiple-choice quiz based on the lesson text provided in the
    JSON data. Respond with ONLY a valid JSON object, without markdown or code
    fences, using this structure:
    {{
      "questions": [
        {{
          "question": "Question text",
          "options": [
            "Option A",
            "Option B",
            "Option C",
            "Option D"
          ],
          "correct_index": 0,
          "explanation": "Explanation of why the answer is correct."
        }}
      ]
    }}

    Generate exactly 4 questions. Each question must have exactly 4 options,
    a correct_index from 0 to 3, and a clear explanation.
    """
    user_data = {"lesson": data.lesson}

    for attempt in range(2):
        try:
            log_event("RUN", "Generating quiz", attempt=f"{attempt + 1}/2")

            try:
                log_event("RUN", "Trying Gemini")
                response = generate_gemini_content(
                    system_instruction,
                    user_data,
                )
                text = response.text.strip()
            except Exception as gemini_error:
                log_event("WARN", "Gemini quiz generation failed", error=short_error(gemini_error))
                log_event("RUN", "Trying Groq fallback")

                groq_response = generate_groq_content(
                    system_instruction,
                    user_data,
                    max_tokens=2000,
                    timeout=LLM_TIMEOUT_SECONDS,
                )
                text = groq_response.choices[0].message.content.strip()

            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]

            if text.endswith("```"):
                text = text[:-3]

            quiz_data = json.loads(text.strip())
            validated_quiz = QuizResponse.model_validate(quiz_data)

            if len(validated_quiz.questions) != 4:
                raise ValueError("Quiz must contain exactly 4 questions.")

            for question in validated_quiz.questions:
                if len(question.options) != 4:
                    raise ValueError("Each question must contain exactly 4 options.")
                if not 0 <= question.correct_index < 4:
                    raise ValueError("correct_index must be between 0 and 3.")

            log_event("OK", "Quiz generated and validated")
            return validated_quiz

        except Exception as e:
            log_event("WARN", "Quiz generation attempt failed", attempt=attempt + 1, error=short_error(e))
            if attempt == 1:
                return {"questions": []}

    return {"questions": []}


def generate_flashcards(data: FlashcardRequest) -> list[Flashcard]:
    """Generate study flashcards with Gemini and Groq fallback across up to 2 attempts."""
    system_instruction = f"""
    {UNTRUSTED_INPUT_INSTRUCTION}

    Create the requested number of study flashcards from the lesson transcript
    in the JSON data. Focus on distinct, important concepts and concise question-
    and-answer pairs. Do not introduce facts that are not supported by the
    transcript. Return only a valid JSON array, without markdown or code fences,
    containing objects with id, front, back, and hint fields. Each card must
    have a unique question and useful hint. Number IDs from 1 through the
    requested count.
    """
    user_data = {
        "count": data.count,
        "transcript": data.transcript,
    }

    for attempt in range(2):
        try:
            try:
                response = generate_gemini_content(
                    system_instruction,
                    user_data,
                )
                text = response.text.strip()
            except Exception as gemini_error:
                logger.warning("Gemini flashcard generation failed: %s", gemini_error)
                if not get_groq_client():
                    raise
                groq_response = generate_groq_content(
                    system_instruction,
                    user_data,
                    max_tokens=3000,
                    temperature=0.4,
                )
                text = groq_response.choices[0].message.content.strip()

            if text.startswith("```"):
                text = text.split("\n", 1)[-1]
                if text.endswith("```"):
                    text = text[:-3]

            flashcard_data = json.loads(text.strip())
            if not isinstance(flashcard_data, list) or len(flashcard_data) != data.count:
                raise ValueError(f"Expected exactly {data.count} flashcards.")

            cards = [Flashcard.model_validate(card) for card in flashcard_data]
            if len({card.front.strip().casefold() for card in cards}) != data.count:
                raise ValueError("Flashcard questions must be unique.")

            return [
                Flashcard.model_validate({**card.model_dump(), "id": index})
                for index, card in enumerate(cards, start=1)
            ]
        except Exception as error:
            logger.warning(
                "Flashcard generation attempt %s failed: %s", attempt + 1, error
            )

    raise HTTPException(status_code=503, detail="Failed to generate flashcards")


def explain_code(data: ExplainCodeRequest) -> dict[str, Any]:
    """Explain, debug, or optimize code using Gemini with Groq fallback."""
    try:
        return gemini_provider.explain_code(data)
    except Exception as gemini_error:
        print(f"Gemini failed: {gemini_error}. Trying Groq...")
        try:
            return groq_provider.explain_code(data)
        except Exception as groq_error:
            print(f"Groq failed: {groq_error}")
            raise HTTPException(
                status_code=502,
                detail="Both AI providers failed to analyze the code.",
            ) from groq_error
