import asyncio
import os
import sys
import subprocess
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import api
import avatar_service
from api import app, job_status, generation_cache, job_cancellation_events, active_processes, cleanup_job_files, process_lesson, LessonRequest


@pytest.fixture(autouse=True)
def reset_state():
    """Reset global in-memory tracking dicts before each test."""
    job_status.clear()
    generation_cache.clear()
    job_cancellation_events.clear()
    active_processes.clear()
    yield
    job_status.clear()
    generation_cache.clear()
    job_cancellation_events.clear()
    active_processes.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_delete_route_exists(client):
    """1. Verify DELETE /jobs/{job_id} route is registered."""
    response = client.delete("/jobs/non_existent_job_123")
    assert response.status_code == 404


def test_unknown_job_returns_404(client):
    """2. Unknown job returns 404."""
    response = client.delete("/jobs/unknown_job_xyz")
    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_cancel_processing_job_sets_cancelled_status(client):
    """3 & 4. Processing/running job can be cancelled, status becomes 'cancelled'."""
    job_id = "test_job_101"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()
    generation_cache["some_hash"] = job_id

    response = client.delete(f"/jobs/{job_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "cancelled"
    assert data["jobId"] == job_id
    assert job_status[job_id]["status"] == "cancelled"
    assert job_cancellation_events[job_id].is_set()


def test_cancelled_job_cannot_become_ready(monkeypatch):
    """5. A cancelled job cannot later become 'ready'."""
    job_id = "test_job_cancel_ready"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    # Pre-cancel the job
    job_cancellation_events[job_id].set()
    job_status[job_id] = {"status": "cancelled"}

    # Mock Gemini
    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.return_value = MagicMock(text="Test lesson content")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    req = LessonRequest(course="Math", topic="Algebra", celebrity="modi")
    asyncio.run(process_lesson(req, job_id))

    assert job_status[job_id]["status"] == "cancelled"
    assert "ready" not in job_status[job_id].values()


def test_cancelled_job_cannot_become_failed(monkeypatch):
    """6. A cancelled job cannot later become 'failed' even if exceptions occur."""
    job_id = "test_job_cancel_failed"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    # Set cancelled
    job_cancellation_events[job_id].set()
    job_status[job_id] = {"status": "cancelled"}

    # Force Gemini to fail
    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.side_effect = RuntimeError("Gemini unreachable")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    # Force Groq to fail
    mock_groq = MagicMock()
    mock_groq.chat.completions.create.side_effect = RuntimeError("Groq unreachable")
    monkeypatch.setattr(api, "groq_client", mock_groq)

    req = LessonRequest(course="Math", topic="Algebra", celebrity="modi")
    asyncio.run(process_lesson(req, job_id))

    assert job_status[job_id]["status"] == "cancelled"
    assert job_status[job_id].get("status") != "failed"


def test_partial_files_removed_on_cancellation(client, tmp_path):
    """7. Partial .txt, .mp3 and .mp4 files are removed on cancellation."""
    job_id = "test_job_cleanup_files"
    base_output = os.path.join(api.BASE_DIR, "outputs")
    text_file = os.path.join(base_output, "text", f"{job_id}.txt")
    audio_file = os.path.join(base_output, "audio", f"{job_id}.mp3")
    video_file = os.path.join(base_output, "video", f"{job_id}.mp4")

    os.makedirs(os.path.dirname(text_file), exist_ok=True)
    os.makedirs(os.path.dirname(audio_file), exist_ok=True)
    os.makedirs(os.path.dirname(video_file), exist_ok=True)

    with open(text_file, "w") as f:
        f.write("sample transcript")
    with open(audio_file, "wb") as f:
        f.write(b"sample audio")
    with open(video_file, "wb") as f:
        f.write(b"sample video")

    assert os.path.exists(text_file)
    assert os.path.exists(audio_file)
    assert os.path.exists(video_file)

    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    response = client.delete(f"/jobs/{job_id}")
    assert response.status_code == 200

    assert not os.path.exists(text_file)
    assert not os.path.exists(audio_file)
    assert not os.path.exists(video_file)


def test_cancelled_jobs_removed_from_generation_cache(client):
    """8. Cancelled jobs are removed from generation_cache."""
    job_id = "test_job_cache_evict"
    cache_key = "abc123hash"
    generation_cache[cache_key] = job_id
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    response = client.delete(f"/jobs/{job_id}")
    assert response.status_code == 200
    assert cache_key not in generation_cache


def test_running_ffmpeg_is_terminated_on_cancellation(client):
    """9. Running FFmpeg is terminated when cancellation occurs."""
    job_id = "test_job_ffmpeg_kill"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    mock_proc = MagicMock(spec=subprocess.Popen)
    active_processes[job_id] = mock_proc

    response = client.delete(f"/jobs/{job_id}")
    assert response.status_code == 200

    mock_proc.terminate.assert_called_once()
    assert job_id not in active_processes


def test_already_ready_and_failed_jobs_handled_appropriately(client):
    """10. Already-ready and already-failed jobs return 400."""
    # Ready job
    job_status["ready_job"] = {"status": "ready", "cloudinary_url": "http://example.com/v.mp4"}
    res_ready = client.delete("/jobs/ready_job")
    assert res_ready.status_code == 400
    assert "Cannot cancel job with status 'ready'" in res_ready.json()["detail"]

    # Failed job
    job_status["failed_job"] = {"status": "failed"}
    res_failed = client.delete("/jobs/failed_job")
    assert res_failed.status_code == 400
    assert "Cannot cancel job with status 'failed'" in res_failed.json()["detail"]

    # Already cancelled job idempotent return
    job_status["cancelled_job"] = {"status": "cancelled"}
    res_cancelled = client.delete("/jobs/cancelled_job")
    assert res_cancelled.status_code == 200
    assert res_cancelled.json()["status"] == "cancelled"


def test_generate_and_status_behavior_intact(client, monkeypatch):
    """11. Existing /generate and /status/{job_id} behavior remains intact."""
    # Test status endpoint for not_found
    status_res = client.get("/status/non_existent_job_abc")
    assert status_res.status_code == 200
    assert status_res.json() == {"status": "not_found"}

    # Test status endpoint for existing job
    job_status["job_status_check"] = {"status": "ready", "cloudinary_url": "https://res.cloudinary.com/demo.mp4"}
    status_res = client.get("/status/job_status_check")
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "ready"

    # Mock process_lesson to avoid real external API calls
    mock_process = MagicMock()
    monkeypatch.setattr(api, "process_lesson", mock_process)

    # Test /generate endpoint creation
    gen_res = client.post(
        "/generate",
        json={"course": "Science", "topic": "Photosynthesis", "celebrity": "modi"},
    )
    assert gen_res.status_code == 200
    gen_data = gen_res.json()
    assert gen_data["status"] == "Processing"
    assert "jobId" in gen_data
    created_job_id = gen_data["jobId"]
    assert created_job_id in job_status
    assert created_job_id in job_cancellation_events
    mock_process.assert_called_once()


def test_job_cancellation_events_cleaned_up_after_completion(monkeypatch):
    """Verify job_cancellation_events dictionary does not leak after worker finishes."""
    job_id = "test_job_leak_check"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    # Mock all external calls to succeed quickly
    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.return_value = MagicMock(text="Test lesson content")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    async def mock_tts(*args, **kwargs):
        pass

    monkeypatch.setattr(api, "generate_tts", mock_tts)
    monkeypatch.setattr(api, "create_avatar_video", lambda p: avatar_service.AwaitableStr("http://example.com/avatar.mp4"))

    mock_resp = MagicMock()
    mock_resp.content = b"fake video content"
    mock_resp.raise_for_status = MagicMock()
    monkeypatch.setattr(api.requests, "get", lambda *args, **kwargs: mock_resp)

    mock_uploader = MagicMock()
    mock_uploader.upload.return_value = {"secure_url": "https://cloudinary.com/test.mp4"}
    monkeypatch.setattr(api.cloudinary, "uploader", mock_uploader)

    req = LessonRequest(course="Science", topic="Biology", celebrity="modi")
    asyncio.run(process_lesson(req, job_id))

    assert job_status[job_id]["status"] == "ready"
    assert job_id not in job_cancellation_events
    assert job_id not in active_processes


def test_concurrent_cancellation_during_pipeline(monkeypatch, client):
    """Verify that canceling a job concurrently while process_lesson is running guarantees status is 'cancelled' and not 'ready'."""
    job_id = "test_job_concurrent_cancel"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    # Simulate slow LLM generation where cancellation happens mid-flight
    def slow_generate_content(*args, **kwargs):
        # Cancel the job during the LLM call via the client
        del_resp = client.delete(f"/jobs/{job_id}")
        assert del_resp.status_code == 200
        return MagicMock(text="Generated text after cancel triggered")

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.side_effect = slow_generate_content
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    req = LessonRequest(course="Science", topic="ConcurrentTest", celebrity="modi")
    asyncio.run(process_lesson(req, job_id))

    assert job_status[job_id]["status"] == "cancelled"
    assert job_status[job_id].get("status") != "ready"
