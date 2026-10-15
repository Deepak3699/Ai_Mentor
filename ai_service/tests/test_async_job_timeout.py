import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
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
from api import (
    DEFAULT_LESSON_JOB_TIMEOUT,
    LessonRequest,
    active_jobs,
    generation_cache,
    job_status,
    run_tracked_lesson,
    shutdown_failed_jobs,
    _cleanup_subprocess,
)
from job_shutdown import wait_for_jobs_to_finish


@pytest.fixture(autouse=True)
def clean_state():
    job_status.clear()
    generation_cache.clear()
    active_jobs.clear()
    shutdown_failed_jobs.clear()
    api.shutting_down = False
    yield
    job_status.clear()
    generation_cache.clear()
    active_jobs.clear()
    shutdown_failed_jobs.clear()
    api.shutting_down = False


def make_request(**overrides):
    values = {
        "course": "Python",
        "topic": "Async Timeout Testing",
        "celebrity": "Modi",
        "language": "English",
        "voice_id": "test-voice",
        "gender": "male",
        "speech_rate": "+0%",
        "speech_pitch": "+0Hz",
        "preferences": {"level": "beginner"},
    }
    values.update(overrides)
    return LessonRequest(**values)


def test_production_default_timeout_is_120_seconds():
    """Verify that default production timeout is exactly 120 seconds."""
    assert DEFAULT_LESSON_JOB_TIMEOUT == 120.0
    assert api.LESSON_JOB_TIMEOUT == 120.0


@pytest.mark.asyncio
async def test_job_completes_successfully_within_timeout():
    """1. A job that completes successfully within the timeout."""
    req = make_request()
    base_filename = "test_job_success_1"
    active_jobs.add(base_filename)

    mock_gemini = MagicMock()
    mock_gemini.text = "Fast educational script within timeout limit."

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"ffmpeg output", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", side_effect=lambda p: False if p.endswith(".mp3") else True), \
         patch("os.path.isfile", return_value=True), \
         patch("os.path.getsize", return_value=1024), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch("api.write_subtitles", return_value=("sub.vtt", "sub.srt")), \
         patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloudinary.com/test.mp4"}):

        await run_tracked_lesson(req, base_filename, timeout_seconds=5.0)

    assert job_status[base_filename]["status"] == "ready"
    assert "completed_at" in job_status[base_filename]["meta"]["timestamps"]
    assert "duration_ms" in job_status[base_filename]["meta"]
    assert base_filename not in active_jobs


@pytest.mark.asyncio
async def test_job_exceeds_deadline_and_marked_failed():
    """2. A job that exceeds the deadline is cancelled and marked failed."""
    req = make_request()
    base_filename = "test_job_timeout_1"
    active_jobs.add(base_filename)
    job_status[base_filename] = {
        "status": "queued",
        "meta": {"timestamps": {"queued_at": "2026-10-13T00:00:00Z"}},
    }

    mock_gemini = MagicMock()
    mock_gemini.text = "Script generated."

    async def slow_tts(*args, **kwargs):
        await asyncio.sleep(0.5)

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
         patch("api.generate_tts", side_effect=slow_tts), \
         patch("os.path.exists", return_value=True), \
         patch("os.remove"):

        # Injected short timeout: 0.05s
        await run_tracked_lesson(req, base_filename, timeout_seconds=0.05)

    assert job_status[base_filename]["status"] == "failed"
    assert "failed_at" in job_status[base_filename]["meta"]["timestamps"]
    assert base_filename not in active_jobs


@pytest.mark.asyncio
async def test_cache_cleanup_after_timeout():
    """3. Cache cleanup after timeout: failed/timed out jobs do not leave stale cache entries."""
    req = make_request(topic="Cache Timeout Clean")
    gen_res = api.generate_lesson(req, BackgroundTasks())
    base_filename = gen_res["jobId"]

    assert gen_res["cached"] is False
    assert any(val == base_filename for val in generation_cache.values())

    mock_gemini = MagicMock()
    mock_gemini.text = "Script generated."

    async def hanging_tts(*args, **kwargs):
        await asyncio.sleep(0.5)

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
         patch("api.generate_tts", side_effect=hanging_tts), \
         patch("os.path.exists", return_value=True), \
         patch("os.remove"):

        await run_tracked_lesson(req, base_filename, timeout_seconds=0.05)

    assert job_status[base_filename]["status"] == "failed"
    # Entry removed from generation_cache
    assert not any(val == base_filename for val in generation_cache.values())

    # Retrying same payload produces a fresh generation, not a stale cache hit
    retry_res = api.generate_lesson(req, BackgroundTasks())
    assert retry_res["cached"] is False
    assert retry_res["jobId"] != base_filename


@pytest.mark.asyncio
async def test_active_jobs_cleanup_after_success_failure_and_timeout():
    """4. active_jobs cleanup after success, failure, and timeout."""
    req = make_request()

    # Success case
    job_success = "job_clean_success"
    active_jobs.add(job_success)
    mock_gemini = MagicMock()
    mock_gemini.text = "Script."
    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", return_value=True), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch("api.write_subtitles", return_value=("sub.vtt", "sub.srt")), \
         patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloud/video.mp4"}):

        await run_tracked_lesson(req, job_success, timeout_seconds=5.0)

    assert job_success not in active_jobs

    # Failure case (ordinary exception)
    job_fail = "job_clean_fail"
    active_jobs.add(job_fail)
    with patch.object(api.gemini_client.models, "generate_content", side_effect=ValueError("Primary failed")), \
         patch.object(api.groq_client.chat.completions, "create", side_effect=ValueError("Groq failed")):

        await run_tracked_lesson(req, job_fail, timeout_seconds=5.0)

    assert job_fail not in active_jobs
    assert job_status[job_fail]["status"] == "failed"

    # Timeout case
    job_timeout = "job_clean_timeout"
    active_jobs.add(job_timeout)
    async def slow_work(*args, **kwargs):
        await asyncio.sleep(0.5)

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
         patch("api.generate_tts", side_effect=slow_work), \
         patch("os.path.exists", return_value=True), \
         patch("os.remove"):

        await run_tracked_lesson(req, job_timeout, timeout_seconds=0.05)

    assert job_timeout not in active_jobs
    assert job_status[job_timeout]["status"] == "failed"


@pytest.mark.asyncio
async def test_ffmpeg_subprocess_termination_on_timeout():
    """5. FFmpeg subprocess termination and cleanup on timeout."""
    req = make_request()
    base_filename = "test_ffmpeg_timeout"
    active_jobs.add(base_filename)

    mock_gemini = MagicMock()
    mock_gemini.text = "Script for FFmpeg timeout test."

    mock_proc = MagicMock()
    mock_proc.returncode = None
    mock_proc.terminate = MagicMock()

    async def hanging_communicate():
        await asyncio.sleep(1.0)
        return (b"", b"")

    async def mock_wait():
        mock_proc.returncode = -15
        return -15

    mock_proc.communicate = hanging_communicate
    mock_proc.wait = mock_wait

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", return_value=True), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc):

        await run_tracked_lesson(req, base_filename, timeout_seconds=0.05)

    assert job_status[base_filename]["status"] == "failed"
    assert base_filename not in active_jobs
    mock_proc.terminate.assert_called_once()


@pytest.mark.asyncio
async def test_ffmpeg_subprocess_cleanup_helper():
    """Verify _cleanup_subprocess explicitly handles process termination and wait."""
    mock_proc = MagicMock()
    mock_proc.returncode = None
    mock_proc.terminate = MagicMock()

    async def mock_wait():
        mock_proc.returncode = -15
        return -15

    mock_proc.wait = mock_wait

    await _cleanup_subprocess(mock_proc)
    mock_proc.terminate.assert_called_once()


@pytest.mark.asyncio
async def test_ordinary_exceptions_handling_and_cleanup():
    """6. Correct handling of ordinary exceptions without crashing."""
    req = make_request()
    base_filename = "test_ordinary_exc"
    active_jobs.add(base_filename)

    with patch.object(api.gemini_client.models, "generate_content", side_effect=RuntimeError("Provider crashed")), \
         patch.object(api.groq_client.chat.completions, "create", side_effect=RuntimeError("Fallback crashed")):

        await run_tracked_lesson(req, base_filename, timeout_seconds=5.0)

    assert job_status[base_filename]["status"] == "failed"
    assert "failed_at" in job_status[base_filename]["meta"]["timestamps"]
    assert base_filename not in active_jobs


@pytest.mark.asyncio
async def test_compatibility_with_graceful_shutdown():
    """7. Compatibility with existing graceful-shutdown behavior."""
    job_id = "shutdown_test_job"
    active_jobs.add(job_id)
    job_status[job_id] = {"status": "processing"}

    # Run shutdown with 0 timeout
    await wait_for_jobs_to_finish(
        active_jobs=active_jobs,
        job_status=job_status,
        shutdown_failed_jobs=shutdown_failed_jobs,
        timeout_seconds=0.01,
        poll_interval=0.005,
    )

    assert job_id in shutdown_failed_jobs
    assert job_status[job_id]["status"] == "failed"

    # Verify that run_tracked_lesson does not overwrite shutdown_failed_jobs
    req = make_request()
    mock_gemini = MagicMock()
    mock_gemini.text = "Script."
    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini), \
     patch("api.generate_tts", new_callable=AsyncMock), \
     patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
     patch("os.path.exists", side_effect=lambda p: False if p.endswith(".mp3") else True), \
     patch("os.path.isfile", return_value=True), \
     patch("os.path.getsize", return_value=1024), \
     patch("os.remove"), \
     patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
     patch("api.write_subtitles", return_value=("sub.vtt", "sub.srt")), \
     patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloudinary.com/test.mp4"}):
        await run_tracked_lesson(req, job_id, timeout_seconds=5.0)

    # Status remains failed as established by graceful shutdown
    assert job_status[job_id]["status"] == "failed"
    assert job_id not in active_jobs


def test_cache_hit_and_force_regeneration_remain_intact():
    """8. Existing cache-hit and force-regeneration behavior remaining unchanged."""
    req = make_request(topic="Cache Hit Test")
    first = api.generate_lesson(req, BackgroundTasks())
    second = api.generate_lesson(req, BackgroundTasks())
    forced = api.generate_lesson(req, BackgroundTasks(), force=True)

    assert first["cached"] is False
    assert second["cached"] is True
    assert second["jobId"] == first["jobId"]
    assert forced["cached"] is False
    assert forced["jobId"] != first["jobId"]

