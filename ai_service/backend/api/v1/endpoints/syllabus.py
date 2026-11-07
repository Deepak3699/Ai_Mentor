from fastapi import APIRouter
from backend.schemas.lessons import SyllabusRequest
from backend.services.providers import manager as provider_manager

router = APIRouter()


@router.post("/generate-syllabus")
def generate_syllabus(data: SyllabusRequest):
    """
    Generate a structured course syllabus using AI.

    Tries Gemini first and falls back to Groq if Gemini fails.
    This endpoint is synchronous and may take several seconds to complete.

    Returns:
        A JSON object containing generated modules and lessons,
        or an error message if both AI providers fail.
    """
    return provider_manager.generate_syllabus(data)
