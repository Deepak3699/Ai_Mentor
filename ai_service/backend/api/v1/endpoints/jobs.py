from fastapi import APIRouter, Path
from backend.services.job_tracker import get_job_status, get_transcript_content
from backend.services.media_processor import BASE_DIR

router = APIRouter()


@router.get("/status/{job_id}")
def get_status(
    job_id: str = Path(..., min_length=1, max_length=150, pattern=r"^[\w-]+$")
):
    return get_job_status(job_id)


@router.get("/transcript/{filename}")
def get_transcript(
    filename: str = Path(
        ...,
        min_length=6,
        max_length=200,
        pattern=r"^[\w-]+\.txt$",
    )
):
    return get_transcript_content(BASE_DIR, filename)
