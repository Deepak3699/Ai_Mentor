from typing import Annotated
from fastapi import APIRouter, Query
import backend.voices as voices

router = APIRouter()


@router.get("/voices")
def get_voices(
    language: Annotated[str | None, Query(min_length=1, max_length=50)] = None,
    gender: Annotated[str | None, Query(min_length=1, max_length=20)] = None,
):
    return {
        "voices": voices.get_all_voices(
            language=language,
            gender=gender,
        )
    }
