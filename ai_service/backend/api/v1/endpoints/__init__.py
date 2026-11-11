from backend.api.v1.endpoints.code import explain_code
from backend.api.v1.endpoints.code import router as code_router
from backend.api.v1.endpoints.flashcards import (
    generate_flashcards,
)
from backend.api.v1.endpoints.flashcards import (
    router as flashcards_router,
)
from backend.api.v1.endpoints.home import home
from backend.api.v1.endpoints.home import router as home_router
from backend.api.v1.endpoints.jobs import (
    get_status,
    get_transcript,
)
from backend.api.v1.endpoints.jobs import (
    router as jobs_router,
)
from backend.api.v1.endpoints.lessons import (
    generate_lesson,
)
from backend.api.v1.endpoints.lessons import (
    router as lessons_router,
)
from backend.api.v1.endpoints.quiz import generate_quiz
from backend.api.v1.endpoints.quiz import router as quiz_router
from backend.api.v1.endpoints.syllabus import (
    generate_syllabus,
)
from backend.api.v1.endpoints.syllabus import (
    router as syllabus_router,
)
from backend.api.v1.endpoints.voices import get_voices
from backend.api.v1.endpoints.voices import router as voices_router

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
