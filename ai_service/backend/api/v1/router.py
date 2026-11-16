from fastapi import APIRouter
from backend.api.v1.endpoints.home import router as home_router
from backend.api.v1.endpoints.voices import router as voices_router
from backend.api.v1.endpoints.syllabus import router as syllabus_router
from backend.api.v1.endpoints.quiz import router as quiz_router
from backend.api.v1.endpoints.flashcards import router as flashcards_router
from backend.api.v1.endpoints.code import router as code_router
from backend.api.v1.endpoints.lessons import router as lessons_router
from backend.api.v1.endpoints.jobs import router as jobs_router

api_v1_router = APIRouter()

api_v1_router.include_router(home_router)
api_v1_router.include_router(voices_router)
api_v1_router.include_router(syllabus_router)
api_v1_router.include_router(quiz_router)
api_v1_router.include_router(flashcards_router)
api_v1_router.include_router(code_router)
api_v1_router.include_router(lessons_router)
api_v1_router.include_router(jobs_router)
