from backend.api.v1.endpoints.home import home, router as home_router
from backend.api.v1.endpoints.voices import get_voices, router as voices_router
from backend.api.v1.endpoints.syllabus import (
    generate_syllabus,
    router as syllabus_router,
)
from backend.api.v1.endpoints.quiz import generate_quiz, router as quiz_router
from backend.api.v1.endpoints.flashcards import (
    generate_flashcards,
    router as flashcards_router,
)
from backend.api.v1.endpoints.code import explain_code, router as code_router
from backend.api.v1.endpoints.lessons import (
    generate_lesson,
    router as lessons_router,
)
from backend.api.v1.endpoints.jobs import (
    get_status,
    get_transcript,
    router as jobs_router,
)

__all__ = [
    "home",
    "home_router",
    "get_voices",
    "voices_router",
    "generate_syllabus",
    "syllabus_router",
    "generate_quiz",
    "quiz_router",
    "generate_flashcards",
    "flashcards_router",
    "explain_code",
    "code_router",
    "generate_lesson",
    "lessons_router",
    "get_status",
    "get_transcript",
    "jobs_router",
]
