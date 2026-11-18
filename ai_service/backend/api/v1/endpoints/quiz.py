from fastapi import APIRouter
from backend.schemas.lessons import QuizRequest, QuizResponse
from backend.services.providers import manager as provider_manager

router = APIRouter()


@router.post("/generate-quiz", response_model=QuizResponse)
def generate_quiz(data: QuizRequest):
    return provider_manager.generate_quiz(data)
