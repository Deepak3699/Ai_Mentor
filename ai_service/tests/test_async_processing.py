import os
import sys
import httpx
import asyncio
import inspect
from pathlib import Path
import pytest
import threading
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure dummy env vars are set for config validation before importing api module
os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import api
from api import LessonRequest, process_lesson, job_status



def test_process_lesson_is_async():
    """Verify that process_lesson is defined as an async coroutine function."""
    assert inspect.iscoroutinefunction(process_lesson)



def test_tts_execution_awaited():
    """A. TTS execution: Verify that generate_tts is awaited directly without asyncio.run()."""
    req = LessonRequest(
        course="Python",
        topic="Asyncio",
        celebrity="Modi"
    )
    base_filename = "test_tts_123"

    mock_gemini_resp = MagicMock()
    mock_gemini_resp.text = "This is a test script explanation of asyncio."

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini_resp), \
         patch("api.generate_tts", new_callable=AsyncMock) as mock_tts, \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", side_effect=lambda p: False if p.endswith(".mp3") else True), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloudinary.com/test.mp4"}):

        asyncio.run(process_lesson(req, base_filename))
        mock_tts.assert_awaited_once()



def test_ffmpeg_execution_async_and_success():
    """B & C. FFmpeg execution & success: Verify FFmpeg is invoked asynchronously and preserves behavior on success."""
    req = LessonRequest(
        course="Python",
        topic="Asyncio",
        celebrity="Modi"
    )
    base_filename = "test_ffmpeg_success_123"

    mock_gemini_resp = MagicMock()
    mock_gemini_resp.text = "Test script for FFmpeg execution."

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"output", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini_resp), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", side_effect=lambda p: False if p.endswith(".mp3") else True), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec, \
         patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloudinary.com/test.mp4"}):

        asyncio.run(process_lesson(req, base_filename))

        # Verify asyncio.create_subprocess_exec was called asynchronously
        mock_exec.assert_called_once()
        args, kwargs = mock_exec.call_args
        assert args[0] == "ffmpeg"
        assert "-y" in args
        assert "-stream_loop" in args
        assert "-shortest" in args
        assert "-filter_complex" in args
        assert "libx264" in args
        assert "-c:v" in args
        assert "copy" not in args
        video_filter = args[args.index("-filter_complex") + 1]
        assert "scale=1280:720:force_original_aspect_ratio=increase" in video_filter
        assert "scale=1280:720:force_original_aspect_ratio=decrease" in video_filter
        assert "gblur=sigma=28" in video_filter

        # Verify job status is ready
        assert job_status[base_filename]["status"] == "ready"



def test_ffmpeg_execution_failure():
    """D. FFmpeg failure: Simulate a non-zero return code and verify that the error is correctly handled."""
    req = LessonRequest(
        course="Python",
        topic="Asyncio",
        celebrity="Modi"
    )
    base_filename = "test_ffmpeg_failure_123"

    mock_gemini_resp = MagicMock()
    mock_gemini_resp.text = "Test script for FFmpeg failure."

    mock_proc = AsyncMock()
    mock_proc.returncode = 1
    mock_proc.communicate.return_value = (b"", b"FFmpeg error: Invalid input")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini_resp), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", side_effect=lambda p: False if p.endswith(".mp3") else True), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc):

        asyncio.run(process_lesson(req, base_filename))

        # Verify job status is set to failed on FFmpeg non-zero exit code
        assert job_status[base_filename]["status"] == "failed"

def test_did_video_is_normalized_before_delivery():
    req = LessonRequest(course="Python", topic="Context", celebrity="Modi")
    base_filename = "test_did_normalized_123"
    mock_gemini_resp = MagicMock()
    mock_gemini_resp.text = "A short generated lesson script for avatar normalization."
    mock_response = MagicMock()
    mock_response.content = b"avatar-video"
    mock_response.raise_for_status.return_value = None
    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=mock_gemini_resp), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", return_value="https://example.test/avatar.mp4") as mock_avatar, \
         patch("api.requests.get", return_value=mock_response), \
         patch("os.path.exists", return_value=True), \
         patch("os.remove"), \
         patch("builtins.open", MagicMock()), \
         patch("asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec, \
         patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloudinary.com/test.mp4"}), \
         patch("api.probe_video_metadata", return_value={"width": 1280, "height": 720}):
        asyncio.run(process_lesson(req, base_filename))

    mock_avatar.assert_awaited_once()
    mock_exec.assert_called_once()
    args = mock_exec.call_args.args
    assert args[0] == "ffmpeg"
    assert "-stream_loop" not in args
    assert "0:a?" in args
    assert "-filter_complex" in args
    assert job_status[base_filename]["meta"]["renderer"] == "did"


def test_create_avatar_video_is_coroutine_function():
    """Verify that create_avatar_video is defined as an async coroutine function in api."""
    assert inspect.iscoroutinefunction(api.create_avatar_video)

def test_event_loop_stays_responsive_during_slow_script_generation():
    """The event loop should remain responsive while script generation blocks."""
    req = LessonRequest(
        course="Python",
        topic="Asyncio",
        celebrity="Modi",
    )
    base_filename = "test_heartbeat_123"

    generation_started = threading.Event()
    release_generation = threading.Event()

    def slow_generate_lesson_script(data):
        generation_started.set()
        release_generation.wait(timeout=3)
        return "A test lesson script.", "gemini", api.GEMINI_MODEL

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    async def run_test():
        task = asyncio.create_task(
            process_lesson(req, base_filename)
        )

        try:
            started = await asyncio.wait_for(
                asyncio.to_thread(generation_started.wait, 1),
                timeout=2,
            )
            assert started, "Script generation did not start"

            # This callback must run even while generation is waiting.
            heartbeat = asyncio.Event()
            asyncio.get_running_loop().call_soon(heartbeat.set)

            await asyncio.wait_for(heartbeat.wait(), timeout=0.5)
        finally:
            release_generation.set()
            await asyncio.wait_for(task, timeout=10)

    with patch(
        "api.generate_lesson_script",
        side_effect=slow_generate_lesson_script,
    ), patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video",
               side_effect=Exception("D-ID disabled")), \
         patch(
             "os.path.exists",
             side_effect=lambda path: not path.endswith(".mp3"),
         ), patch("os.remove"), \
         patch(
             "asyncio.create_subprocess_exec",
             return_value=mock_proc,
         ), patch(
             "cloudinary.uploader.upload",
             return_value={
                 "secure_url": "https://example.test/video.mp4"
             },
         ):
        asyncio.run(run_test())
def test_shutdown_failed_job_cleans_up_video_uploaded_after_shutdown():
    """Clean up a video if shutdown fails the job during its upload."""
    req = LessonRequest(
        course="Python",
        topic="Asyncio",
        celebrity="Modi",
    )
    base_filename = "test_shutdown_cleanup_123"

    mock_gemini_resp = MagicMock()
    mock_gemini_resp.text = "Test lesson script."

    mock_proc = AsyncMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")
    cleanup_calls = []
    def upload_and_mark_shutdown(*args, **kwargs):
        if kwargs.get("resource_type") == "video":
            api.shutdown_failed_jobs.add(base_filename)
            api.job_status[base_filename]["status"] = "failed"

        return {
            "secure_url": "https://example.test/video.mp4",
            "public_id": base_filename,
        }

    def record_destroy(*args, **kwargs):
        cleanup_calls.append((args, kwargs))
        return {"result": "ok"}

    original_shutting_down = api.shutting_down
    api.shutting_down = False
    api.job_status[base_filename] = {"status": "processing"}
    api.shutdown_failed_jobs.discard(base_filename)

    try:
        with patch.object(
            api.gemini_client.models,
            "generate_content",
            return_value=mock_gemini_resp,
        ), patch(
            "api.generate_tts",
            new_callable=AsyncMock,
        ), patch(
            "api.create_avatar_video",
            side_effect=Exception("D-ID disabled"),
        ), patch(
            "os.path.exists",
            side_effect=lambda path: not path.endswith(".mp3"),
        ), patch(
            "os.remove",
        ), patch(
            "asyncio.create_subprocess_exec",
            return_value=mock_proc,
        ), patch(
            "cloudinary.uploader.upload",
            side_effect=upload_and_mark_shutdown,
        ), patch(
            "cloudinary.uploader.destroy",
            side_effect=record_destroy,
        ):
            asyncio.run(api.process_lesson(req, base_filename))
        assert cleanup_calls, "The uploaded video should be deleted."
        args, kwargs = cleanup_calls[0]
        assert args[0] == base_filename
        assert kwargs["resource_type"] == "video"
        assert api.job_status[base_filename]["status"] == "failed"
    finally:
        api.shutting_down = original_shutting_down
        api.shutdown_failed_jobs.discard(base_filename)
        api.job_status.pop(base_filename, None)

@pytest.mark.asyncio
async def test_shutdown_failed_job_skips_video_upload():
    """A job failed during shutdown must not start a video upload."""
    job_id = "shutdown-upload-guard-test"

    api.shutdown_failed_jobs.add(job_id)
    api.job_status[job_id] = {"status": "failed"}

    try:
        with patch.object(
            api.cloudinary.uploader,
            "upload",
        ) as mock_upload:
            with patch.object(
                api,
                "write_subtitles",
                return_value=("test.vtt", "test.srt"),
            ):
                await api.process_lesson(
                    LessonRequest(
                        course="Test course",
                        topic="Test topic",
                        duration=1,
                        language="English",
                    ),
                    job_id,
                )

            mock_upload.assert_not_called()
    finally:
        api.shutdown_failed_jobs.discard(job_id)
        api.job_status.pop(job_id, None)

@pytest.mark.asyncio
async def test_status_and_voices_respond_during_lesson_processing():
    """Status and voices endpoints should respond during a running lesson."""
    job_id = "endpoint_responsiveness_test"
    request_data = LessonRequest(
        course="Python",
        topic="Endpoint responsiveness",
        celebrity="Modi",
    )

    processing_started = asyncio.Event()
    release_processing = asyncio.Event()
    original_shutting_down = api.shutting_down

    async def slow_process_lesson(data, base_filename):
        processing_started.set()
        await release_processing.wait()

    api.shutting_down = False
    api.job_status[job_id] = {"status": "processing"}
    api.active_jobs.add(job_id)

    try:
        with patch.object(api, "process_lesson", slow_process_lesson):
            worker = asyncio.create_task(
                api.run_tracked_lesson(request_data, job_id)
            )

            try:
                await asyncio.wait_for(
                    processing_started.wait(),
                    timeout=2,
                )

                transport = httpx.ASGITransport(app=api.app)
                async with httpx.AsyncClient(
                    transport=transport,
                    base_url="http://test",
                ) as client:
                    status_response, voices_response = await asyncio.wait_for(
                        asyncio.gather(
                            client.get(f"/status/{job_id}"),
                            client.get("/voices"),
                        ),
                        timeout=2,
                    )

                assert status_response.status_code == 200
                assert status_response.json()["status"] == "processing"
                assert voices_response.status_code == 200
                assert "voices" in voices_response.json()

            finally:
                release_processing.set()
                await asyncio.wait_for(worker, timeout=2)

    finally:
        release_processing.set()
        api.shutting_down = original_shutting_down
        api.active_jobs.discard(job_id)
        api.shutdown_failed_jobs.discard(job_id)
        api.job_status.pop(job_id, None)
