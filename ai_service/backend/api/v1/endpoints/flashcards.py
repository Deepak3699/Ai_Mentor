from fastapi import APIRouter
from backend.schemas.lessons import Flashcard, FlashcardRequest
from backend.services.providers import manager as provider_manager

router = APIRouter()


@router.post("/generate-flashcards", response_model=list[Flashcard])
def generate_flashcards(data: FlashcardRequest):
    return provider_manager.generate_flashcards(data)
