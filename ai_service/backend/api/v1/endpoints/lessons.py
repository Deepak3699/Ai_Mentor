from fastapi import APIRouter, BackgroundTasks, HTTPException
from backend.schemas.lessons import LessonRequest
from backend.services.job_tracker import (
    active_jobs,
    compute_base_filename,
    compute_cache_key,
    generation_cache,
    job_status,
    queue_job,
    shutting_down,
)
from backend.services.lesson_pipeline import run_tracked_lesson

router = APIRouter()


@router.post("/generate")
def generate_lesson(
    data: LessonRequest,
    background_tasks: BackgroundTasks,
    force: bool = False,
):
    import backend.services.job_tracker as jt

    if jt.shutting_down:
        raise HTTPException(
            status_code=503,
            detail="Service is shutting down; new jobs are not accepted.",
        )

    cache_key = compute_cache_key(data)
    base_filename = compute_base_filename(data.topic, force=force)

    if not force and cache_key in generation_cache:
        base_filename = generation_cache[cache_key]
        existing_status = job_status.get(
            base_filename,
            {"status": "processing"},
        )

        return {
            "status": existing_status.get("status", "processing").capitalize(),
            "filename": f"{base_filename}.mp4",
            "text_file": f"{base_filename}.txt",
            "audio_file": f"{base_filename}.mp3",
            "jobId": base_filename,
            "cached": True,
        }

    queue_job(base_filename, cache_key=cache_key, force=force)
    background_tasks.add_task(run_tracked_lesson, data, base_filename)

    return {
        "status": "Processing",
        "filename": f"{base_filename}.mp4",
        "text_file": f"{base_filename}.txt",
        "audio_file": f"{base_filename}.mp3",
        "jobId": base_filename,
        "cached": False,
    }
