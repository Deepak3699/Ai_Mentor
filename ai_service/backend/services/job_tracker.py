from __future__ import annotations

import threading
import datetime
import hashlib
import json
import os
import re
import uuid
import time
from typing import Any
from cachetools import TTLCache

from backend.schemas.lessons import LessonRequest

# Shared state
active_jobs: set[str] = set()
job_lock = threading.Lock()
shutdown_failed_jobs: set[str] = set()
shutting_down: bool = False

class JobStatusCache(TTLCache):
    """Keep active job statuses available while applying TTL to terminal jobs."""

    def __init__(self, maxsize: int, ttl: int, timer=time.monotonic):
        super().__init__(maxsize=maxsize, ttl=ttl, timer=timer)
        self.active_statuses: dict[str, dict] = {}

    def __getitem__(self, key):
        if key in self.active_statuses:
            return self.active_statuses[key]

        return super().__getitem__(key)

    def __contains__(self, key):
        return key in self.active_statuses or super().__contains__(key)

    def get(self, key, default=None):
        if key in self.active_statuses:
            return self.active_statuses[key]

        return super().get(key, default)

    def set_active(self, key, status):
        self.active_statuses[key] = status
        super().__setitem__(key, status)

    def finish(self, key):
        status = self.active_statuses.pop(key, None)

        if status is not None:
            super().__setitem__(key, status)

    def clear(self):
        self.active_statuses.clear()
        super().clear()


# Cache configs: 1000 jobs, 1 hour TTL
job_status: JobStatusCache = JobStatusCache(maxsize=1000, ttl=3600)
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

    status = {
        "status": "queued",
        "meta": {
            "timestamps": {
                "queued_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
        },
    }
    job_status.set_active(base_filename, status)
    active_jobs.add(base_filename)


def try_queue_job(
    base_filename: str,
    cache_key: str | None = None,
    force: bool = False,
    max_active_jobs: int = 2,
) -> bool:
    """Register a job only when active-job capacity is available."""
    with job_lock:
        if len(active_jobs) >= max_active_jobs:
            return False

        queue_job(base_filename, cache_key=cache_key, force=force)
        return True


def init_job_processing(base_filename: str) -> None:
    """Update job status to processing with a timestamp."""
    status = job_status.get(base_filename, {})
    status["status"] = "processing"

    if "meta" not in status:
        status["meta"] = {"timestamps": {}}

    if "timestamps" not in status["meta"]:
        status["meta"]["timestamps"] = {}

    status["meta"]["timestamps"]["started_at"] = (
        datetime.datetime.now(datetime.timezone.utc).isoformat()
    )

    job_status.set_active(base_filename, status)


def mark_job_failed(
    base_filename: str,
    error: Exception | str | None = None,
    *,
    failure_code: str = "generation_failed",
) -> None:
    """Record a safe public failure state and always clear the generation cache."""
    public_messages = {
        "narration_failed": "Narration generation failed.",
        "source_video_missing": "Video rendering failed.",
        "ffmpeg_failed": "Video rendering failed.",
        "output_missing": "Video rendering failed.",
        "provider_failed": "AI provider generation failed.",
        "generation_failed": "Lesson generation failed.",
    }
    if failure_code not in public_messages:
        failure_code = "generation_failed"

    try:
        status = job_status.setdefault(base_filename, {})

        if base_filename not in shutdown_failed_jobs:
            message = public_messages[failure_code]
            status["status"] = "failed"
            status["error"] = message
            status["reason"] = message
            status["failure_code"] = failure_code

        meta = status.setdefault("meta", {})
        timestamps = meta.setdefault("timestamps", {})
        timestamps.setdefault(
            "failed_at",
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )

        job_status.set_active(base_filename, status)
        job_status.finish(base_filename)

    finally:
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
            status = job_status[base_filename]
            status["status"] = "ready"
            status["cloudinary_url"] = cloudinary_url
            status["local_video_url"] = local_video_url
            status["subtitle_url"] = subtitle_vtt_url
            status["subtitle_vtt_url"] = subtitle_vtt_url
            status["subtitle_srt_url"] = subtitle_srt_url

            meta = status.setdefault("meta", {})
            timestamps = meta.setdefault("timestamps", {})

            for key, val in meta_info.items():
                meta[key] = val

            timestamps["completed_at"] = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()

            job_status.finish(base_filename)


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
