import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from job_shutdown import wait_for_jobs_to_finish


def test_shutdown_waits_for_job_that_finishes():
    async def scenario():
        active_jobs = {"job-1"}
        job_status = {"job-1": {"status": "processing"}}
        failed_jobs = set()

        async def finish_job():
            await asyncio.sleep(0.02)
            active_jobs.discard("job-1")

        task = asyncio.create_task(finish_job())
        await wait_for_jobs_to_finish(
            active_jobs,
            job_status,
            failed_jobs,
            timeout_seconds=0.5,
            poll_interval=0.005,
        )
        await task

        assert active_jobs == set()
        assert failed_jobs == set()
        assert job_status["job-1"]["status"] == "processing"

    asyncio.run(scenario())


def test_shutdown_marks_unfinished_job_failed():
    async def scenario():
        active_jobs = {"job-2"}
        job_status = {"job-2": {"status": "processing"}}
        failed_jobs = set()

        await wait_for_jobs_to_finish(
            active_jobs,
            job_status,
            failed_jobs,
            timeout_seconds=0.02,
            poll_interval=0.002,
        )

        assert "job-2" in failed_jobs
        assert job_status["job-2"]["status"] == "failed"
        assert "job-2" in active_jobs

    asyncio.run(scenario())


def test_api_rejects_new_jobs_during_shutdown():
    source = (BACKEND_DIR / "api.py").read_text(encoding="utf-8")

    assert "if shutting_down:" in source
    assert "status_code=503" in source


def test_api_does_not_overwrite_shutdown_failed_job_as_ready():
    source = (BACKEND_DIR / "api.py").read_text(encoding="utf-8")

    assert (
        "if base_filename not in shutdown_failed_jobs:" in source
    )
