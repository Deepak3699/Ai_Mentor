import pytest
from pydantic import ValidationError

from backend.schemas.lessons import (
    LessonPreferences,
    LessonRequest,
    SyllabusRequest,
    ExplainCodeRequest,
    QuizRequest,
    FlashcardRequest,
)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        (LessonPreferences, {"learning_style": "   "}),
        (
            LessonRequest,
            {
                "course": "Python",
                "topic": "Loops",
                "voice_id": " ",
            },
        ),
        (
            LessonRequest,
            {
                "course": "Python",
                "topic": "Loops",
                "preferences": {"focus_area": " "},
            },
        ),
        (SyllabusRequest, {"course_title": " "}),
        (
            ExplainCodeRequest,
            {
                "code": " ",
                "language": "Python",
                "mode": "explain",
            },
        ),
        (QuizRequest, {"lesson": " "}),
        (FlashcardRequest, {"transcript": " "}),
    ],
)
def test_request_models_reject_blank_strings(model, payload):
    with pytest.raises(ValidationError):
        model.model_validate(payload)