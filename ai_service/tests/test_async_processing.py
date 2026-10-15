import os
import sys
import asyncio
from pathlib import Path
import pytest
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
    assert asyncio.iscoroutinefunction(process_lesson)



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
    """B & C. FFmpeg execution & success: Verify FFmpeg is invoked asynchronously and preserves behavior on success.

    The pipeline now runs two FFmpeg processes:
      1. Merge stock video + synthesised audio (uses -stream_loop / -shortest)
      2. Burn AI-disclosure watermark into the merged video (uses -vf drawtext)
    Both must be called; the first must carry the expected flags.
    """
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

        # The pipeline calls create_subprocess_exec twice:
        # call 1 = merge (stock video + audio), call 2 = watermark (drawtext)
        assert mock_exec.call_count == 2, (
            f"Expected 2 FFmpeg calls (merge + watermark), got {mock_exec.call_count}"
        )

        # --- Verify the first call (merge) carries expected flags ---
        first_call_args = mock_exec.call_args_list[0][0]
        assert first_call_args[0] == "ffmpeg"
        assert "-y" in first_call_args
        assert "-stream_loop" in first_call_args
        assert "-shortest" in first_call_args

        # --- Verify the second call (watermark) uses drawtext ---
        second_call_args = mock_exec.call_args_list[1][0]
        assert second_call_args[0] == "ffmpeg"
        assert any("drawtext" in arg for arg in second_call_args), (
            "Second FFmpeg call must apply the AI-disclosure drawtext filter"
        )

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
