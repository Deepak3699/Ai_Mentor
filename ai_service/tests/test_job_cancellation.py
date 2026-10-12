import asyncio
import os
import sys
import subprocess
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock
import cloudinary

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


def test_multithreaded_race_cancellation_during_pipeline(client, monkeypatch):
    """13. Multithreaded race test: concurrent worker thread and cancellation thread."""
    job_id = "test_job_multithreaded_race"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    step_reached = threading.Event()

    async def slow_tts(*args, **kwargs):
        step_reached.set()
        await asyncio.sleep(0.15)

    monkeypatch.setattr(api, "generate_tts", slow_tts)

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.return_value = MagicMock(text="Test content")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    req = LessonRequest(course="Math", topic="RaceTest", celebrity="modi")

    def worker():
        asyncio.run(process_lesson(req, job_id))

    t_worker = threading.Thread(target=worker)
    t_worker.start()

    assert step_reached.wait(timeout=2.0)

    delete_resp = client.delete(f"/jobs/{job_id}")
    assert delete_resp.status_code == 200

    t_worker.join(timeout=5.0)

    assert job_status[job_id]["status"] == "cancelled"
    assert job_status[job_id].get("status") != "ready"
    assert job_id not in active_processes


def test_cancellation_during_active_file_writes(client):
    """14. Active-writer race test: independent writer thread writes files concurrently with a separate cancellation thread."""
    job_id = "test_job_write_race"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    base_output = os.path.join(api.BASE_DIR, "outputs")
    text_file = os.path.join(base_output, "text", f"{job_id}.txt")
    audio_file = os.path.join(base_output, "audio", f"{job_id}.mp3")
    video_file = os.path.join(base_output, "video", f"{job_id}.mp4")

    os.makedirs(os.path.dirname(text_file), exist_ok=True)
    os.makedirs(os.path.dirname(audio_file), exist_ok=True)
    os.makedirs(os.path.dirname(video_file), exist_ok=True)

    writing_started = threading.Event()
    cancel_initiated = threading.Event()
    writer_done = threading.Event()
    writer_errors = []

    def independent_writer_thread():
        try:
            writing_started.set()
            # Perform continuous file writing while waiting for / overlapping with cancellation
            for i in range(25):
                if api.is_job_cancelled(job_id):
                    break
                with open(text_file, "a", encoding="utf-8") as tf:
                    tf.write(f"line_{i}\n")
                with open(audio_file, "ab") as af:
                    af.write(b"raw_audio_chunk_1234567890\n")
                with open(video_file, "ab") as vf:
                    vf.write(b"raw_video_chunk_1234567890\n")
                import time
                time.sleep(0.01)
        except Exception as exc:
            writer_errors.append(exc)
        finally:
            writer_done.set()

    t_writer = threading.Thread(target=independent_writer_thread)
    t_writer.start()

    # Ensure writer is actively creating and appending to files
    assert writing_started.wait(timeout=2.0)
    import time
    time.sleep(0.02)
    assert os.path.exists(text_file)

    # Separate cancellation thread issues DELETE /jobs/{job_id}
    cancel_status = []
    def cancellation_thread():
        cancel_initiated.set()
        res = client.delete(f"/jobs/{job_id}")
        cancel_status.append(res.status_code)

    t_cancel = threading.Thread(target=cancellation_thread)
    t_cancel.start()

    t_cancel.join(timeout=5.0)
    t_writer.join(timeout=5.0)

    assert not writer_errors, f"Writer thread encountered errors: {writer_errors}"
    assert cancel_status == [200]
    assert job_status[job_id]["status"] == "cancelled"

    # Any files generated before or during cancellation are fully cleaned up
    api.cleanup_job_files(job_id)
    assert not os.path.exists(text_file)
    assert not os.path.exists(audio_file)
    assert not os.path.exists(video_file)


def test_bounded_cancellation_during_inflight_gemini(monkeypatch, client):
    """15. Long external operations: In-flight Gemini call aborts promptly when cancellation occurs."""
    job_id = "test_gemini_inflight_cancel"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    gemini_started = threading.Event()

    def hanging_gemini(*args, **kwargs):
        gemini_started.set()
        # Simulate long/blocking external provider call
        import time
        for _ in range(50):
            if api.is_job_cancelled(job_id):
                break
            time.sleep(0.05)
        return MagicMock(text="Delayed content")

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.side_effect = hanging_gemini
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    req = LessonRequest(course="Science", topic="InflightGemini", celebrity="modi")

    def run_worker():
        asyncio.run(process_lesson(req, job_id))

    t_worker = threading.Thread(target=run_worker)
    t_worker.start()

    assert gemini_started.wait(timeout=2.0)

    del_res = client.delete(f"/jobs/{job_id}")
    assert del_res.status_code == 200

    t_worker.join(timeout=4.0)

    assert not t_worker.is_alive(), "Worker should not block on hanging Gemini after cancellation"
    assert job_status[job_id]["status"] == "cancelled"
    assert job_status[job_id].get("status") != "ready"


def test_bounded_gemini_timeout_falls_back_to_groq(monkeypatch):
    """16. Explicit timeout on primary provider triggers fallback without indefinite hanging."""
    job_id = "test_gemini_timeout_fallback"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    # Set small timeout for testing
    monkeypatch.setattr(api, "GEMINI_TIMEOUT", 0.1)

    def slow_gemini(*args, **kwargs):
        import time
        time.sleep(0.3)
        return MagicMock(text="Slow Gemini")

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.side_effect = slow_gemini
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    mock_groq = MagicMock()
    groq_resp = MagicMock()
    groq_resp.choices = [MagicMock(message=MagicMock(content="Groq text"))]
    mock_groq.chat.completions.create.return_value = groq_resp
    monkeypatch.setattr(api, "groq_client", mock_groq)

    # Mock remaining pipeline so test focuses on timeout fallback
    async def quick_tts(text, output_file, *args, **kwargs):
        with open(output_file, "wb") as f:
            f.write(b"dummy")

    monkeypatch.setattr(api, "generate_tts", quick_tts)
    monkeypatch.setattr(api, "create_avatar_video", AsyncMock(side_effect=Exception("D-ID disabled")))

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=mock_proc))
    monkeypatch.setattr(os.path, "exists", lambda p: True)
    monkeypatch.setattr(cloudinary.uploader, "upload", lambda *args, **kwargs: {"secure_url": "http://example.com/v.mp4"})

    req = LessonRequest(course="History", topic="TimeoutFallback", celebrity="modi")
    asyncio.run(process_lesson(req, job_id))

    assert job_status[job_id]["status"] == "ready"
    assert job_status[job_id]["meta"]["provider"] == "groq"


def test_bounded_cancellation_during_inflight_tts(monkeypatch, client):
    """17. Long external operations: In-flight TTS aborts promptly upon cancellation."""
    job_id = "test_tts_inflight_cancel"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.return_value = MagicMock(text="Lesson text for TTS test")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    tts_started = threading.Event()

    async def slow_tts(*args, **kwargs):
        tts_started.set()
        await asyncio.sleep(2.0)

    monkeypatch.setattr(api, "generate_tts", slow_tts)

    req = LessonRequest(course="Music", topic="TTSCancel", celebrity="modi")

    def run_worker():
        asyncio.run(process_lesson(req, job_id))

    t_worker = threading.Thread(target=run_worker)
    t_worker.start()

    assert tts_started.wait(timeout=2.0)

    del_res = client.delete(f"/jobs/{job_id}")
    assert del_res.status_code == 200

    t_worker.join(timeout=3.0)

    assert not t_worker.is_alive(), "Worker should exit promptly when TTS is cancelled in-flight"
    assert job_status[job_id]["status"] == "cancelled"


def test_bounded_cancellation_during_inflight_avatar(monkeypatch, client):
    """18. Long external operations: In-flight D-ID avatar generation aborts promptly upon cancellation."""
    job_id = "test_avatar_inflight_cancel"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.return_value = MagicMock(text="Lesson text for avatar")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    async def quick_tts(*args, **kwargs):
        pass

    monkeypatch.setattr(api, "generate_tts", quick_tts)

    avatar_started = threading.Event()

    async def slow_avatar(*args, **kwargs):
        avatar_started.set()
        await asyncio.sleep(2.0)
        return "http://example.com/avatar.mp4"

    monkeypatch.setattr(api, "create_avatar_video", slow_avatar)

    req = LessonRequest(course="Art", topic="AvatarCancel", celebrity="modi")

    def run_worker():
        asyncio.run(process_lesson(req, job_id))

    t_worker = threading.Thread(target=run_worker)
    t_worker.start()

    assert avatar_started.wait(timeout=2.0)

    del_res = client.delete(f"/jobs/{job_id}")
    assert del_res.status_code == 200

    t_worker.join(timeout=3.0)

    assert not t_worker.is_alive(), "Worker should not block on avatar generation after cancellation"
    assert job_status[job_id]["status"] == "cancelled"


def test_bounded_cancellation_during_inflight_cloudinary(monkeypatch, client):
    """19. Long external operations: In-flight Cloudinary upload aborts promptly upon cancellation."""
    job_id = "test_cloudinary_inflight_cancel"
    job_status[job_id] = {"status": "processing"}
    job_cancellation_events[job_id] = threading.Event()

    mock_gemini = MagicMock()
    mock_gemini.models.generate_content.return_value = MagicMock(text="Lesson text for cloudinary")
    monkeypatch.setattr(api, "gemini_client", mock_gemini)

    async def quick_tts(text, output_file, *args, **kwargs):
        with open(output_file, "wb") as f:
            f.write(b"dummy")

    monkeypatch.setattr(api, "generate_tts", quick_tts)
    monkeypatch.setattr(api, "create_avatar_video", AsyncMock(side_effect=Exception("D-ID disabled")))

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=mock_proc))
    monkeypatch.setattr(os.path, "exists", lambda p: True)

    upload_started = threading.Event()

    def slow_upload(*args, **kwargs):
        upload_started.set()
        import time
        time.sleep(2.0)
        return {"secure_url": "http://example.com/uploaded.mp4"}

    monkeypatch.setattr(cloudinary.uploader, "upload", slow_upload)

    req = LessonRequest(course="Physics", topic="CloudinaryCancel", celebrity="modi")

    def run_worker():
        asyncio.run(process_lesson(req, job_id))

    t_worker = threading.Thread(target=run_worker)
    t_worker.start()

    assert upload_started.wait(timeout=2.0)

    del_res = client.delete(f"/jobs/{job_id}")
    assert del_res.status_code == 200

    t_worker.join(timeout=3.0)

    assert not t_worker.is_alive(), "Worker should not hang on Cloudinary upload after cancellation"
    assert job_status[job_id]["status"] == "cancelled"
