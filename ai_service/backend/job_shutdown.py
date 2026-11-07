import asyncio
import datetime
import logging

logger = logging.getLogger(__name__)


async def wait_for_jobs_to_finish(
    active_jobs: set,
    job_status: dict,
    shutdown_failed_jobs: set,
    timeout_seconds: float = 30,
    poll_interval: float = 0.1,
    generation_cache: dict | None = None,
) -> None:
    """Wait for active jobs up to the timeout, then mark unfinished jobs failed."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds

    while active_jobs and loop.time() < deadline:
        await asyncio.sleep(poll_interval)

    for job_id in list(active_jobs):
        if job_status.get(job_id, {}).get("status") == "processing":
            shutdown_failed_jobs.add(job_id)
            try:
                status = job_status[job_id]
                status["status"] = "failed"
                shutdown_message = "Job stopped because service shutdown timed out."
                status.setdefault("error", shutdown_message)
                status.setdefault("reason", shutdown_message)
                status.setdefault("failure_code", "shutdown_timeout")
                meta = status.setdefault("meta", {})
                timestamps = meta.setdefault("timestamps", {})
                timestamps.setdefault(
                    "failed_at",
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                )
            finally:
                if generation_cache is not None:
                    for key, cached_job_id in list(generation_cache.items()):
                        if cached_job_id == job_id:
                            generation_cache.pop(key, None)
            logger.warning("Job marked failed because shutdown timed out.")
