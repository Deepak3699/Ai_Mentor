from fastapi import APIRouter
from backend.services.job_tracker import get_job_status, get_transcript_content
from backend.services.media_processor import BASE_DIR

router = APIRouter()


@router.get("/status/{job_id}")
def get_status(job_id: str):
    return get_job_status(job_id)


@router.get("/transcript/{filename}")
def get_transcript(filename: str):
    return get_transcript_content(BASE_DIR, filename)
