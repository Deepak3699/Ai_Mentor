from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import uuid
from typing import Any
from cachetools import TTLCache

from backend.schemas.lessons import LessonRequest

# Shared state
active_jobs: set[str] = set()
shutdown_failed_jobs: set[str] = set()
shutting_down: bool = False

# Cache configs: 1000 jobs, 1 hour TTL
job_status: TTLCache = TTLCache(maxsize=1000, ttl=3600)
generation_cache: TTLCache = TTLCache(maxsize=1000, ttl=3600)


def compute_cache_key(data: LessonRequest) -> str:
    """Compute a canonical SHA-256 hash for identical lesson generation parameters."""
    cache_data = json.dumps(
        {
            "course": data.course,
            "topic": data.topic,
            "celebrity": data.celebrity,
            "language": data.language,
            "voice_id": data.voice_id,
            "gender": data.gender,
            "speech_rate": data.speech_rate,
            "speech_pitch": data.speech_pitch,
            "preferences": (
                data.preferences.model_dump(exclude_none=True)
                if data.preferences
                else None
            ),
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(cache_data.encode("utf-8")).hexdigest()


def compute_base_filename(topic: str, force: bool = False) -> str:
    """Generate a clean, timestamped base filename for artifacts."""
    topic_clean = re.sub(r"[^\w\s-]", "", topic).strip().replace(" ", "_")
    topic_clean = topic_clean[:81]
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    unique_suffix = uuid.uuid4().hex[:8]
    return f"{topic_clean}_{timestamp}_{unique_suffix}"


def remove_failed_generation_cache(base_filename: str) -> None:
    """Remove cache entries that still point to this failed job."""
    for key, cached_filename in list(generation_cache.items()):
        if cached_filename == base_filename:
            generation_cache.pop(key, None)


def queue_job(base_filename: str, cache_key: str | None = None, force: bool = False) -> None:
    """Register a new job in the queue and active tracking set."""
    if not force and cache_key:
        generation_cache[cache_key] = base_filename

    job_status[base_filename] = {
        "status": "queued",
        "meta": {
            "timestamps": {
                "queued_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
        },
    }
    active_jobs.add(base_filename)


def init_job_processing(base_filename: str) -> None:
    """Update job status to processing with a timestamp."""
    if base_filename not in job_status:
        job_status[base_filename] = {
            "status": "processing",
            "meta": {
                "timestamps": {
                    "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            },
        }
    else:
        job_status[base_filename]["status"] = "processing"
        if "meta" not in job_status[base_filename]:
            job_status[base_filename]["meta"] = {"timestamps": {}}
        if "timestamps" not in job_status[base_filename]["meta"]:
            job_status[base_filename]["meta"]["timestamps"] = {}
        job_status[base_filename]["meta"]["timestamps"]["started_at"] = (
            datetime.datetime.now(datetime.timezone.utc).isoformat()
        )


def mark_job_failed(base_filename: str, error: Exception | str | None = None) -> None:
    """Mark a job as failed, record timestamp and reason, and remove from generation cache."""
    if base_filename not in shutdown_failed_jobs:
        if base_filename in job_status:
            job_status[base_filename]["status"] = "failed"
            if error is not None:
                failure_reason = str(error)
                job_status[base_filename]["error"] = failure_reason
                job_status[base_filename]["reason"] = failure_reason

            if "meta" not in job_status[base_filename]:
                job_status[base_filename]["meta"] = {"timestamps": {}}

            if "timestamps" not in job_status[base_filename]["meta"]:
                job_status[base_filename]["meta"]["timestamps"] = {}

            job_status[base_filename]["meta"]["timestamps"]["failed_at"] = (
                datetime.datetime.now(datetime.timezone.utc).isoformat()
            )

    remove_failed_generation_cache(base_filename)


def mark_job_ready(
    base_filename: str,
    cloudinary_url: str | None,
    local_video_url: str,
    subtitle_vtt_url: str | None,
    subtitle_srt_url: str | None,
    meta_info: dict[str, Any],
) -> None:
    """Mark a job as ready, store delivery URLs, and finalize metadata and completion timestamp."""
    if base_filename not in shutdown_failed_jobs:
        if base_filename in job_status:
            job_status[base_filename]["status"] = "ready"
            job_status[base_filename]["cloudinary_url"] = cloudinary_url
            job_status[base_filename]["local_video_url"] = local_video_url
            job_status[base_filename]["subtitle_url"] = subtitle_vtt_url
            job_status[base_filename]["subtitle_vtt_url"] = subtitle_vtt_url
            job_status[base_filename]["subtitle_srt_url"] = subtitle_srt_url

            meta = job_status[base_filename].setdefault("meta", {})
            timestamps = meta.setdefault("timestamps", {})
            for key, val in meta_info.items():
                meta[key] = val
            timestamps["completed_at"] = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()


def get_job_status(job_id: str) -> dict[str, Any]:
    """Retrieve current job status object."""
    status_data = job_status.get(job_id, {"status": "not_found"})
    if isinstance(status_data, str):
        return {"status": status_data}
    return status_data


def get_transcript_content(base_dir: str, filename: str) -> dict[str, str]:
    """Read saved transcript content safely."""
    file_path = os.path.join(base_dir, "outputs", "text", filename)
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    return {"error": "Transcript not found"}
