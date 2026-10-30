from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LessonPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    explanation_type: str | None = Field(None, max_length=100)
    learning_style: str | None = Field(None, max_length=100)
    teaching_pace: str | None = Field(None, max_length=100)
    example_type: str | None = Field(None, max_length=100)
    focus_area: str | None = Field(None, max_length=100)


class LessonRequest(BaseModel):
    course: str = Field(..., min_length=1, max_length=100)
    topic: str = Field(..., min_length=1, max_length=200)
    celebrity: str = Field("modi", min_length=1, max_length=50)
    language: str = Field("English", max_length=50)
    preferences: LessonPreferences | None = None
    voice_id: str | None = None
    gender: str | None = None
    speech_rate: str | None = "+0%"
    speech_pitch: str | None = "+0Hz"


class SyllabusRequest(BaseModel):
    course_title: str = Field(..., min_length=1, max_length=100)
    category: str | None = Field(None, max_length=100)


class ExplainCodeRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=20000)
    language: str = Field(..., min_length=1, max_length=50)
    mode: str = Field(..., pattern="^(explain|debug|optimize)$")


class QuizRequest(BaseModel):
    lesson: str = Field(..., min_length=1, max_length=30000)


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]


class FlashcardRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=30000)
    count: int = Field(5, ge=5, le=10)


class Flashcard(BaseModel):
    id: int = Field(..., ge=1)
    front: str = Field(..., min_length=1, max_length=500)
    back: str = Field(..., min_length=1, max_length=2000)
    hint: str = Field(..., min_length=1, max_length=300)
