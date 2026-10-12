import asyncio
import logging

logger = logging.getLogger(__name__)


async def wait_for_jobs_to_finish(
    active_jobs: set,
    job_status: dict,
    shutdown_failed_jobs: set,
    timeout_seconds: float = 30,
    poll_interval: float = 0.1,
) -> None:
    """Wait for active jobs up to the timeout, then mark unfinished jobs failed."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_seconds

    while active_jobs and loop.time() < deadline:
        await asyncio.sleep(poll_interval)

    for job_id in list(active_jobs):
        if job_status.get(job_id, {}).get("status") == "processing":
            shutdown_failed_jobs.add(job_id)
            job_status[job_id] = {"status": "failed"}
            logger.warning(
                "Job %s marked failed because shutdown timed out.",
                job_id,
            )
