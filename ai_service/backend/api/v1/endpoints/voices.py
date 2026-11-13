from fastapi import APIRouter
import backend.voices as voices

router = APIRouter()


@router.get("/voices")
def get_voices(language: str | None = None, gender: str | None = None):
    return {"voices": voices.get_all_voices(language=language, gender=gender)}
