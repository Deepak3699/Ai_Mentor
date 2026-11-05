from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

class APIRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def reject_blank_strings(cls, value):
        if isinstance(value, str) and not value.strip():
            raise ValueError("Field must not be empty or whitespace-only")
        return value
class LessonPreferences(APIRequest):
    model_config = ConfigDict(extra="forbid")

    explanation_type: str | None = Field(None, max_length=100)
    learning_style: str | None = Field(None, max_length=100)
    teaching_pace: str | None = Field(None, max_length=100)
    example_type: str | None = Field(None, max_length=100)
    focus_area: str | None = Field(None, max_length=100)


class LessonRequest(APIRequest):
    course: str = Field(..., min_length=1, max_length=100)
    topic: str = Field(..., min_length=1, max_length=200)
    celebrity: str = Field("modi", min_length=1, max_length=50)
    language: str = Field("English", max_length=50)
    preferences: LessonPreferences | None = None
    voice_id: str | None = None
    gender: str | None = None
    speech_rate: str | None = Field(
        "+0%",
        pattern=r"^[+-](?:100|[1-9]?\d)%$",
    )
    speech_pitch: str | None = Field(
        "+0Hz",
        pattern=r"^[+-](?:100|[1-9]?\d)Hz$",
    )


class SyllabusRequest(APIRequest):
    course_title: str = Field(..., min_length=1, max_length=100)
    category: str | None = Field(None, max_length=100)


class ExplainCodeRequest(APIRequest):
    code: str = Field(..., min_length=1, max_length=20000)
    language: str = Field(..., min_length=1, max_length=50)
    mode: str = Field(..., pattern="^(explain|debug|optimize)$")


class QuizRequest(APIRequest):
    lesson: str = Field(..., min_length=1, max_length=30000)


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]


class FlashcardRequest(APIRequest):
    transcript: str = Field(..., min_length=1, max_length=30000)
    count: int = Field(5, ge=5, le=10)


class Flashcard(BaseModel):
    id: int = Field(..., ge=1)
    front: str = Field(..., min_length=1, max_length=500)
    back: str = Field(..., min_length=1, max_length=2000)
    hint: str = Field(..., min_length=1, max_length=300)
