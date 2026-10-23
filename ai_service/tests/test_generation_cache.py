import asyncio
import os
import sys
from pathlib import Path

import pytest
from unittest.mock import patch
from fastapi import BackgroundTasks

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import api

@pytest.fixture(autouse=True)
def clear_generation_caches():
    api.generation_cache.clear()
    api.job_status.clear()

    with api.active_jobs_lock:
        api.active_jobs.clear()

    yield

    api.generation_cache.clear()
    api.job_status.clear()

    with api.active_jobs_lock:
        api.active_jobs.clear()


def make_request(**overrides):
    values = {
        "course": "Python",
        "topic": "Asyncio cache regression",
        "celebrity": "Modi",
        "language": "English",
        "voice_id": "voice-a",
        "gender": "male",
        "speech_rate": "+0%",
        "speech_pitch": "+0Hz",
        "preferences": {
            "explanation_type": "concise",
            "focus_area": "asyncio",
        },
    }
    values.update(overrides)
    return api.LessonRequest(**values)


def generate(req):
    return api.generate_lesson(req, BackgroundTasks())


def test_identical_requests_reuse_cached_job():
    first = generate(make_request())
    second = generate(make_request())

    assert first["cached"] is False
    assert second["cached"] is True
    assert second["jobId"] == first["jobId"]


def test_nested_preferences_are_canonicalized_for_cache_key():
    first = generate(
        make_request(
            preferences={
                "explanation_type": "concise",
                "focus_area": "asyncio",
            }
        )
    )
    second = generate(
        make_request(
            preferences={
                "focus_area": "asyncio",
                "explanation_type": "concise",
            }
        )
    )

    assert second["cached"] is True
    assert second["jobId"] == first["jobId"]


@pytest.mark.parametrize(
    "change",
    [
        {"voice_id": "voice-b"},
        {"gender": "female"},
        {"speech_rate": "+15%"},
        {"speech_pitch": "+5Hz"},
        {
            "preferences": {
                "explanation_type": "detailed",
                "focus_area": "asyncio",
            }
        },
    ],
)
def test_output_affecting_options_create_distinct_jobs(change):
    first = generate(make_request())
    second = generate(make_request(**change))

    assert first["cached"] is False
    assert second["cached"] is False
    assert second["jobId"] != first["jobId"]


def test_real_generation_failure_clears_cache_and_allows_retry():
    first = generate(make_request())
    failed_job_id = first["jobId"]

    assert first["cached"] is False
    assert any(
        value == failed_job_id
        for value in api.generation_cache.values()
    )

    # Simulate both script-generation providers failing.
    with (
        patch.object(
            api.gemini_client.models,
            "generate_content",
            side_effect=RuntimeError("Gemini unavailable"),
        ),
        patch.object(
            api.groq_client.chat.completions,
            "create",
            side_effect=RuntimeError("Groq unavailable"),
        ),
    ):
        asyncio.run(api.process_lesson(make_request(), failed_job_id))

    assert api.job_status[failed_job_id]["status"] == "failed"
    assert not any(
        value == failed_job_id
        for value in api.generation_cache.values()
    )

    retry = generate(make_request())
    assert retry["cached"] is False
    assert retry["jobId"] != failed_job_id


def test_force_regeneration_does_not_replace_normal_cache_entry():
    normal = generate(make_request())
    forced = api.generate_lesson(
        make_request(),
        BackgroundTasks(),
        force=True,
    )
    cached = generate(make_request())

    assert forced["cached"] is False
    assert forced["jobId"] != normal["jobId"]
    assert cached["cached"] is True
    assert cached["jobId"] == normal["jobId"]


def test_new_job_rejected_when_capacity_is_reached(monkeypatch):
    monkeypatch.setattr(api, "MAX_ACTIVE_LESSON_JOBS", 1)

    with api.active_jobs_lock:
        api.active_jobs.add("already-running")

    with pytest.raises(api.HTTPException) as exc_info:
        generate(make_request())

    assert exc_info.value.status_code == 503
    assert "busy" in exc_info.value.detail.lower()
    assert not api.generation_cache


def test_cached_request_works_when_capacity_is_reached(monkeypatch):
    monkeypatch.setattr(api, "MAX_ACTIVE_LESSON_JOBS", 1)

    first = generate(make_request())
    second = generate(make_request())

    assert first["cached"] is False
    assert second["cached"] is True
    assert second["jobId"] == first["jobId"]


def test_job_slot_is_released_when_processing_raises(monkeypatch):
    job_id = "test-failed-job"

    with api.active_jobs_lock:
        api.active_jobs.add(job_id)

    async def fail_processing(data, base_filename):
        raise RuntimeError("Expected test failure")

    monkeypatch.setattr(api, "process_lesson", fail_processing)

    with pytest.raises(RuntimeError, match="Expected test failure"):
        asyncio.run(api.run_tracked_lesson(make_request(), job_id))

    with api.active_jobs_lock:
        assert job_id not in api.active_jobs
