import os
import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TEST_KEY = "test-service-secret-key-123"

for k, v in [
    ("GEMINI_API_KEY", "dummy-gemini-key"),
    ("GROQ_API_KEY", "dummy-groq-key"),
    ("CLOUDINARY_CLOUD_NAME", "dummy-cloud"),
    ("CLOUDINARY_API_KEY", "dummy-key"),
    ("CLOUDINARY_API_SECRET", "dummy-secret"),
    ("AI_SERVICE_KEY", TEST_KEY),
]:
    os.environ[k] = v

import config
config.GEMINI_API_KEY = "dummy-gemini-key"
config.GROQ_API_KEY = "dummy-groq-key"
config.CLOUDINARY_CLOUD_NAME = "dummy-cloud"
config.CLOUDINARY_API_KEY = "dummy-key"
config.CLOUDINARY_API_SECRET = "dummy-secret"
config.AI_SERVICE_KEY = TEST_KEY

from starlette.testclient import TestClient
from api import app, video_output_path, text_output_path


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "AI_SERVICE_KEY", TEST_KEY)
    monkeypatch.setenv("AI_SERVICE_KEY", TEST_KEY)
    return TestClient(app)


def test_public_health_endpoints_accessible_without_auth(client):
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "AI Lesson Generator Backend Running" in res_root.json()["message"]

    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "ok"


@pytest.mark.parametrize("method,path,kwargs", [
    ("post", "/generate", {"json": {"course": "c", "topic": "t", "celebrity": "modi"}}),
    ("post", "/generate-syllabus", {"json": {"course_title": "Test Course"}}),
    ("post", "/generate-quiz", {"json": {"lesson": "Test Lesson"}}),
    ("get", "/status/nonexistent-job", {}),
    ("get", "/transcript/nonexistent.txt", {}),
    ("get", "/voices", {}),
    ("get", "/video-stream/nonexistent.mp4", {}),
    ("head", "/video-stream/nonexistent.mp4", {}),
    ("get", "/transcript-stream/nonexistent.txt", {}),
    ("head", "/transcript-stream/nonexistent.txt", {}),
])
def test_operational_endpoints_reject_missing_credential(client, method, path, kwargs):
    call = getattr(client, method)
    res = call(path, **kwargs)
    assert res.status_code == 401
    if method != "head":
        assert "detail" in res.json()
        assert "Missing service credential" in res.json()["detail"]


@pytest.mark.parametrize("auth_headers", [
    {"x-service-key": "wrong-key"},
    {"authorization": "Bearer wrong-key"},
    {"authorization": "wrong-key"},
    {"x-api-key": "wrong-key"},
])
def test_operational_endpoints_reject_invalid_credential(client, auth_headers):
    res = client.get("/voices", headers=auth_headers)
    assert res.status_code == 401
    assert "Invalid service credential" in res.json()["detail"]


def test_operational_endpoints_accept_valid_x_service_key(client):
    res = client.get("/voices", headers={"x-service-key": TEST_KEY})
    assert res.status_code == 200
    assert "voices" in res.json()


def test_operational_endpoints_accept_valid_bearer_token(client):
    res = client.get("/status/test-job-id", headers={"authorization": f"Bearer {TEST_KEY}"})
    assert res.status_code == 200
    assert res.json()["status"] == "not_found"


def test_operational_endpoints_accept_valid_x_api_key(client):
    res = client.get("/status/test-job-id", headers={"x-api-key": TEST_KEY})
    assert res.status_code == 200
    assert res.json()["status"] == "not_found"


def test_missing_server_key_fails_closed(client, monkeypatch):
    monkeypatch.setattr(config, "AI_SERVICE_KEY", None)
    monkeypatch.delenv("AI_SERVICE_KEY", raising=False)

    res = client.get("/voices", headers={"x-service-key": TEST_KEY})
    assert res.status_code == 500
    assert "AI_SERVICE_KEY is not configured" in res.json()["detail"]


def test_static_media_streams_protected_and_accessible_with_credential(client):
    sample_text = Path(text_output_path) / "test_auth_sample.txt"
    sample_video = Path(video_output_path) / "test_auth_sample.mp4"

    try:
        sample_text.write_text("secure transcript content", encoding="utf-8")
        sample_video.write_bytes(b"fake-mp4-data")

        # 1. Unauthenticated requests are rejected
        assert client.get("/transcript-stream/test_auth_sample.txt").status_code == 401
        assert client.get("/video-stream/test_auth_sample.mp4").status_code == 401
        assert client.head("/video-stream/test_auth_sample.mp4").status_code == 401

        # 2. Authenticated requests succeed
        res_txt = client.get(
            "/transcript-stream/test_auth_sample.txt",
            headers={"x-service-key": TEST_KEY}
        )
        assert res_txt.status_code == 200
        assert res_txt.text == "secure transcript content"

        res_vid = client.head(
            "/video-stream/test_auth_sample.mp4",
            headers={"x-service-key": TEST_KEY}
        )
        assert res_vid.status_code == 200

    finally:
        if sample_text.exists():
            sample_text.unlink()
        if sample_video.exists():
            sample_video.unlink()
