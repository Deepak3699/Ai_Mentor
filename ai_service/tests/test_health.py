import os
import sys
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure dummy env vars are set before importing api
os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

import api
from api import app, check_ffmpeg_readiness, check_gemini_key_readiness, check_default_input_video_readiness, check_outputs_writable_readiness


@pytest.fixture
def client():
    return TestClient(app)


def test_health_live_always_returns_200(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_health_ready_returns_200_when_all_dependencies_ready(client):
    with patch("api.check_ffmpeg_readiness", return_value=(True, None)), \
         patch("api.check_gemini_key_readiness", return_value=(True, None)), \
         patch("api.check_default_input_video_readiness", return_value=(True, None)), \
         patch("api.check_outputs_writable_readiness", return_value=(True, None)):
        response = client.get("/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["checks"] == {
            "ffmpeg": "available",
            "gemini_api_key": "configured",
            "default_input_video": "available",
            "outputs_writable": "writable",
        }
        assert "optional" in data
        assert "groq" in data["optional"]
        assert "cloudinary" in data["optional"]
        assert "did" in data["optional"]


def test_health_ready_returns_503_when_ffmpeg_unavailable(client):
    with patch("api.check_ffmpeg_readiness", return_value=(False, "FFmpeg is not installed or not available in PATH")), \
         patch("api.check_gemini_key_readiness", return_value=(True, None)), \
         patch("api.check_default_input_video_readiness", return_value=(True, None)), \
         patch("api.check_outputs_writable_readiness", return_value=(True, None)):
        response = client.get("/health/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert data["checks"]["ffmpeg"] == "unavailable"
        assert "FFmpeg is not installed or not available in PATH" in data["reasons"]


def test_health_ready_returns_503_when_gemini_key_missing(client):
    with patch("api.check_ffmpeg_readiness", return_value=(True, None)), \
         patch("api.check_gemini_key_readiness", return_value=(False, "Gemini API key is missing")), \
         patch("api.check_default_input_video_readiness", return_value=(True, None)), \
         patch("api.check_outputs_writable_readiness", return_value=(True, None)):
        response = client.get("/health/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert data["checks"]["gemini_api_key"] == "missing"
        assert "Gemini API key is missing" in data["reasons"]


def test_health_ready_returns_503_when_default_input_video_absent(client):
    with patch("api.check_ffmpeg_readiness", return_value=(True, None)), \
         patch("api.check_gemini_key_readiness", return_value=(True, None)), \
         patch("api.check_default_input_video_readiness", return_value=(False, "Default input video (input/modi.mp4) is absent")), \
         patch("api.check_outputs_writable_readiness", return_value=(True, None)):
        response = client.get("/health/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert data["checks"]["default_input_video"] == "absent"
        assert "Default input video (input/modi.mp4) is absent" in data["reasons"]


def test_health_ready_returns_503_when_outputs_folder_not_writable(client):
    with patch("api.check_ffmpeg_readiness", return_value=(True, None)), \
         patch("api.check_gemini_key_readiness", return_value=(True, None)), \
         patch("api.check_default_input_video_readiness", return_value=(True, None)), \
         patch("api.check_outputs_writable_readiness", return_value=(False, "Outputs directory is not writable: Permission denied")):
        response = client.get("/health/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert data["checks"]["outputs_writable"] == "not_writable"
        assert "Outputs directory is not writable: Permission denied" in data["reasons"]


def test_health_ready_aggregates_multiple_failures(client):
    with patch("api.check_ffmpeg_readiness", return_value=(False, "FFmpeg unavailable")), \
         patch("api.check_gemini_key_readiness", return_value=(False, "Gemini key missing")), \
         patch("api.check_default_input_video_readiness", return_value=(True, None)), \
         patch("api.check_outputs_writable_readiness", return_value=(True, None)):
        response = client.get("/health/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert len(data["reasons"]) == 2
        assert "FFmpeg unavailable" in data["reasons"]
        assert "Gemini key missing" in data["reasons"]


def test_optional_integrations_do_not_fail_readiness(client):
    with patch("api.check_ffmpeg_readiness", return_value=(True, None)), \
         patch("api.check_gemini_key_readiness", return_value=(True, None)), \
         patch("api.check_default_input_video_readiness", return_value=(True, None)), \
         patch("api.check_outputs_writable_readiness", return_value=(True, None)), \
         patch("api.get_optional_integrations_status", return_value={"groq": "disabled", "cloudinary": "disabled", "did": "disabled"}):
        response = client.get("/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["optional"] == {
            "groq": "disabled",
            "cloudinary": "disabled",
            "did": "disabled",
        }


def test_check_ffmpeg_readiness_detects_missing_command(monkeypatch):
    import subprocess

    def mock_run(*args, **kwargs):
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "run", mock_run)
    ok, reason = check_ffmpeg_readiness()
    assert ok is False
    assert "not installed or not available in PATH" in reason


def test_check_gemini_key_readiness_detects_empty_key(monkeypatch):
    import config
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    ok, reason = check_gemini_key_readiness()
    assert ok is False
    assert "missing" in reason.lower()


def test_check_default_input_video_readiness_success_and_failure(monkeypatch):
    ok, reason = check_default_input_video_readiness()
    assert ok is True
    assert reason is None

    monkeypatch.setattr("os.path.isfile", lambda p: False)
    ok, reason = check_default_input_video_readiness()
    assert ok is False
    assert "absent" in reason


def test_check_outputs_writable_readiness_success_and_failure(monkeypatch):
    ok, reason = check_outputs_writable_readiness()
    assert ok is True
    assert reason is None

    def mock_open(*args, **kwargs):
        raise PermissionError("Access denied")

    monkeypatch.setattr("builtins.open", mock_open)
    ok, reason = check_outputs_writable_readiness()
    assert ok is False
    assert "not writable" in reason


def test_get_optional_integrations_status_reflects_config(monkeypatch):
    import config
    from api import get_optional_integrations_status

    monkeypatch.setattr(config, "GROQ_ENABLED", True)
    monkeypatch.setattr(config, "CLOUDINARY_ENABLED", False)
    monkeypatch.setattr(config, "DID_ENABLED", True)

    status = get_optional_integrations_status()
    assert status == {
        "groq": "enabled",
        "cloudinary": "disabled",
        "did": "enabled",
    }
