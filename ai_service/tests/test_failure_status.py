import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api


SENSITIVE_EXCEPTION = (
    "token=private-token https://provider.invalid/resource?signature=private-signature "
    "C:\\private\\workspace\\input.mp4 request-body=private generated-output=private"
)


def test_failure_cache_cleanup_runs_if_status_update_raises(monkeypatch):
    class BrokenJobStatus(dict):
        def setdefault(self, _key, _default=None):
            raise RuntimeError("status store unavailable")

    job_id = "status-store-failure"
    original_status = api.job_status
    api.job_status = BrokenJobStatus()
    api.generation_cache.clear()
    api.generation_cache["request-hash"] = job_id
    try:
        with pytest.raises(RuntimeError, match="status store unavailable"):
            api.mark_job_failed(job_id)
        assert not any(value == job_id for value in api.generation_cache.values())
    finally:
        api.job_status = original_status
        api.generation_cache.clear()


@pytest.fixture(autouse=True)
def clear_job_state():
    api.generation_cache.clear()
    api.job_status.clear()
    api.shutdown_failed_jobs.clear()
    api.shutting_down = False
    yield
    api.generation_cache.clear()
    api.job_status.clear()
    api.shutdown_failed_jobs.clear()
    api.shutting_down = False


@pytest.mark.parametrize(
    ("scenario", "expected_code", "expected_message"),
    [
        ("tts", "narration_failed", "Narration generation failed."),
        ("missing_source", "source_video_missing", "Video rendering failed."),
        ("ffmpeg_failure", "ffmpeg_failed", "Video rendering failed."),
        ("missing_output", "output_missing", "Video rendering failed."),
    ],
)
def test_failure_paths_update_status_cache_and_public_response(
    scenario, expected_code, expected_message, tmp_path, capsys, monkeypatch
):
    job_id = f"failure-{scenario}"
    monkeypatch.setattr(api, "BASE_DIR", str(tmp_path))
    monkeypatch.setattr(
        api,
        "generate_lesson_script",
        lambda _data: ("Generated lesson content must stay private.", "gemini", "test-model"),
    )
    monkeypatch.setattr(
        api,
        "create_avatar_video",
        AsyncMock(side_effect=RuntimeError(SENSITIVE_EXCEPTION)),
    )
    monkeypatch.setattr(api, "get_celebrity_video", lambda _celebrity: str(tmp_path / "missing.mp4"))
    api.shutdown_failed_jobs.discard(job_id)
    api.generation_cache.clear()
    api.job_status[job_id] = {
        "status": "queued",
        "local_video_url": "/video-stream/previous.mp4",
        "meta": {
            "provider": "preserved-provider",
            "custom": "preserved-metadata",
            "timestamps": {"queued_at": "queued-time"},
        },
    }
    api.generation_cache["request-hash"] = job_id

    async def generate_audio(_text, output_file, **_kwargs):
        if scenario == "tts":
            raise RuntimeError(SENSITIVE_EXCEPTION)
        Path(output_file).write_bytes(b"test audio")

    monkeypatch.setattr(api, "generate_tts", generate_audio)

    if scenario == "missing_source":
        pass
    elif scenario in {"ffmpeg_failure", "missing_output"}:
        source_video = tmp_path / "source.mp4"
        source_video.write_bytes(b"source")
        monkeypatch.setattr(api, "get_celebrity_video", lambda _celebrity: str(source_video))
        returncode = 1 if scenario == "ffmpeg_failure" else 0
        diagnostic = SENSITIVE_EXCEPTION if returncode else ""
        monkeypatch.setattr(
            api,
            "run_ffmpeg_command",
            AsyncMock(return_value=(returncode, diagnostic)),
        )

    request = api.LessonRequest(course="Python", topic="Private topic", celebrity="modi")
    asyncio.run(api.process_lesson(request, job_id))

    status = api.job_status[job_id]
    assert status["status"] == "failed"
    assert status["failure_code"] == expected_code
    assert status["error"] == expected_message
    assert status["reason"] == expected_message
    assert status["meta"]["timestamps"]["queued_at"] == "queued-time"
    assert status["meta"]["timestamps"]["failed_at"]
    failed_at = datetime.fromisoformat(status["meta"]["timestamps"]["failed_at"])
    assert failed_at.tzinfo is not None
    assert status["meta"]["provider"] == "preserved-provider"
    assert status["meta"]["custom"] == "preserved-metadata"
    assert status["local_video_url"] == "/video-stream/previous.mp4"
    assert not any(value == job_id for value in api.generation_cache.values())

    with patch.object(api, "check_ffmpeg", return_value=None), TestClient(api.app) as client:
        response = client.get(f"/status/{job_id}")

    assert response.status_code == 200
    assert response.json() == status
    response_text = response.text
    captured = capsys.readouterr()
    logs = captured.out + captured.err
    for secret in (
        "private-token",
        "private-signature",
        "C:\\private\\workspace\\input.mp4",
        "request-body=private",
        "generated-output=private",
        "Generated lesson content must stay private.",
        "Private topic",
    ):
        assert secret not in response_text
        assert secret not in logs

    api.job_status.pop(job_id, None)
    api.generation_cache.clear()
