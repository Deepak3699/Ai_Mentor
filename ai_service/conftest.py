import os

import pytest

os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("GROQ_API_KEY", "test-key")


@pytest.fixture(autouse=True)
def reset_shutdown_state():
    from backend.services import job_tracker

    job_tracker.shutting_down = False
    job_tracker.active_jobs.clear()
    job_tracker.shutdown_failed_jobs.clear()
    yield
    job_tracker.shutting_down = False
    job_tracker.active_jobs.clear()
    job_tracker.shutdown_failed_jobs.clear()