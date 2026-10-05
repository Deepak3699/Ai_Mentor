import asyncio
import base64
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import avatar_service


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


def test_auth_header_requires_a_configured_key(monkeypatch):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", None)
    with pytest.raises(RuntimeError, match="DID_API_KEY is not configured"):
        avatar_service._get_auth_header()


def test_auth_header_validates_username_password_format(monkeypatch):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "missing-separator")
    with pytest.raises(RuntimeError, match="USERNAME:PASSWORD"):
        avatar_service._get_auth_header()


def test_auth_header_encodes_the_complete_credentials(monkeypatch):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "account:secret:value")
    expected = base64.b64encode(b"account:secret:value").decode("utf-8")
    assert avatar_service._get_auth_header() == f"Basic {expected}"


def test_upload_audio_wraps_file_read_failures(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "user:pass")
    missing = tmp_path / "missing.mp3"
    with pytest.raises(RuntimeError, match="Could not read audio file"):
        avatar_service.upload_audio(str(missing))


def test_upload_audio_requires_a_success_status_and_url(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "user:pass")
    audio = tmp_path / "voice.mp3"
    audio.write_bytes(b"audio")

    monkeypatch.setattr(
        avatar_service.requests,
        "post",
        lambda *args, **kwargs: FakeResponse(400, text="bad request"),
    )
    with pytest.raises(RuntimeError, match="400 bad request"):
        avatar_service.upload_audio(str(audio))

    monkeypatch.setattr(
        avatar_service.requests,
        "post",
        lambda *args, **kwargs: FakeResponse(201, {}),
    )
    with pytest.raises(RuntimeError, match="returned no audio URL"):
        avatar_service.upload_audio(str(audio))


def test_upload_audio_returns_the_did_url_without_network(monkeypatch, tmp_path):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "user:pass")
    audio = tmp_path / "voice.mp3"
    audio.write_bytes(b"audio")
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return FakeResponse(201, {"url": "https://media.test/audio.mp3"})

    monkeypatch.setattr(avatar_service.requests, "post", fake_post)
    assert avatar_service.upload_audio(str(audio)) == "https://media.test/audio.mp3"
    assert captured["url"].endswith("/audios")
    assert captured["kwargs"]["timeout"] == 60
    assert "Content-Type" not in captured["kwargs"]["headers"]


def test_create_avatar_requires_a_source_url_before_upload(monkeypatch):
    monkeypatch.setattr(avatar_service, "DID_SOURCE_URL", None)
    monkeypatch.setattr(
        avatar_service,
        "upload_audio",
        lambda path: pytest.fail("audio must not upload without a source URL"),
    )
    with pytest.raises(RuntimeError, match="DID_SOURCE_URL is not configured"):
        avatar_service.create_avatar_video("voice.mp3")


def test_create_avatar_validates_creation_response_before_polling(monkeypatch):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "user:pass")
    monkeypatch.setattr(avatar_service, "DID_SOURCE_URL", "https://media.test/source.jpg")
    monkeypatch.setattr(avatar_service, "upload_audio", lambda path: "https://media.test/audio.mp3")
    monkeypatch.setattr(
        avatar_service.requests,
        "post",
        lambda *args, **kwargs: FakeResponse(201, {}),
    )
    with pytest.raises(RuntimeError, match="did not return a talk ID"):
        avatar_service.create_avatar_video("voice.mp3")


def test_poll_returns_completed_video_and_rejects_missing_result(monkeypatch):
    monkeypatch.setattr(avatar_service, "DID_API_KEY", "user:pass")

    async def no_sleep(_):
        return None

    monkeypatch.setattr(avatar_service.asyncio, "sleep", no_sleep)
    monkeypatch.setattr(
        avatar_service.requests,
        "get",
        lambda *args, **kwargs: FakeResponse(200, {"status": "done", "result_url": "https://media.test/video.mp4"}),
    )
    assert asyncio.run(avatar_service._poll_for_video("talk-1")) == "https://media.test/video.mp4"

    monkeypatch.setattr(
        avatar_service.requests,
        "get",
        lambda *args, **kwargs: FakeResponse(200, {"status": "done"}),
    )
    with pytest.raises(RuntimeError, match="returned no video URL"):
        asyncio.run(avatar_service._poll_for_video("talk-2"))
