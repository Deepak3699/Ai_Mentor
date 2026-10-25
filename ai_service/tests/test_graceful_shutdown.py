import asyncio
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from job_shutdown import wait_for_jobs_to_finish

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")


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
        job_status = {
            "job-2": {
                "status": "processing",
                "meta": {"provider": "gemini", "timestamps": {"queued_at": "queued"}},
            }
        }
        failed_jobs = set()
        generation_cache = {"request-hash": "job-2", "other": "job-3"}

        await wait_for_jobs_to_finish(
            active_jobs,
            job_status,
            failed_jobs,
            timeout_seconds=0.02,
            poll_interval=0.002,
            generation_cache=generation_cache,
        )

        assert "job-2" in failed_jobs
        assert job_status["job-2"]["status"] == "failed"
        assert job_status["job-2"]["error"] == "Job stopped because service shutdown timed out."
        assert job_status["job-2"]["reason"] == job_status["job-2"]["error"]
        assert job_status["job-2"]["failure_code"] == "shutdown_timeout"
        assert job_status["job-2"]["meta"]["provider"] == "gemini"
        assert job_status["job-2"]["meta"]["timestamps"]["queued_at"] == "queued"
        assert job_status["job-2"]["meta"]["timestamps"]["failed_at"]
        assert generation_cache == {"other": "job-3"}
        assert "job-2" in active_jobs

    asyncio.run(scenario())


def test_shutdown_cleans_generation_cache_if_status_update_raises():
    class BrokenJobStatus(dict):
        def __getitem__(self, key):
            if key == "broken-job":
                raise RuntimeError("status store unavailable")
            return super().__getitem__(key)

    async def scenario():
        job_id = "broken-job"
        active_jobs = {job_id}
        job_status = BrokenJobStatus({job_id: {"status": "processing"}})
        failed_jobs = set()
        generation_cache = {"request-hash": job_id}

        with pytest.raises(RuntimeError, match="status store unavailable"):
            await wait_for_jobs_to_finish(
                active_jobs,
                job_status,
                failed_jobs,
                timeout_seconds=0,
                generation_cache=generation_cache,
            )

        assert job_id in failed_jobs
        assert generation_cache == {}

    asyncio.run(scenario())


def test_api_rejects_new_jobs_during_shutdown():
    source = (BACKEND_DIR / "api.py").read_text(encoding="utf-8")

    assert "if shutting_down:" in source
    assert "status_code=503" in source


def test_late_failure_preserves_shutdown_status_and_cleans_cache():
    import api

    job_id = "shutdown-job"
    api.job_status[job_id] = {
        "status": "processing",
        "meta": {
            "provider": "gemini",
            "timestamps": {"queued_at": "queued-time"},
        },
    }
    api.active_jobs.add(job_id)
    api.shutdown_failed_jobs.discard(job_id)
    api.generation_cache.clear()
    api.generation_cache["request-hash"] = job_id
    try:
        asyncio.run(
            wait_for_jobs_to_finish(
                api.active_jobs,
                api.job_status,
                api.shutdown_failed_jobs,
                timeout_seconds=0,
                generation_cache=api.generation_cache,
            )
        )
        shutdown_status = api.job_status[job_id]
        shutdown_timestamp = shutdown_status["meta"]["timestamps"]["failed_at"]
        shutdown_reason = shutdown_status["reason"]

        api.mark_job_failed(job_id, RuntimeError("private diagnostic"))

        assert api.job_status[job_id]["status"] == "failed"
        assert api.job_status[job_id]["error"] == shutdown_reason
        assert api.job_status[job_id]["reason"] == shutdown_reason
        assert api.job_status[job_id]["failure_code"] == "shutdown_timeout"
        assert api.job_status[job_id]["meta"]["provider"] == "gemini"
        assert api.job_status[job_id]["meta"]["timestamps"]["queued_at"] == "queued-time"
        assert api.job_status[job_id]["meta"]["timestamps"]["failed_at"] == shutdown_timestamp
        assert not any(value == job_id for value in api.generation_cache.values())
    finally:
        api.active_jobs.discard(job_id)
        api.shutdown_failed_jobs.discard(job_id)
        api.job_status.pop(job_id, None)
        api.generation_cache.clear()
