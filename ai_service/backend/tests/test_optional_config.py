import importlib
import sys

import pytest


def load_config(monkeypatch, **env):
    for key in [
        "GEMINI_API_KEY",
        "GROQ_API_KEY",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "DID_API_KEY",
        "DID_SOURCE_URL",
    ]:
        monkeypatch.delenv(key, raising=False)

    for key, value in env.items():
        monkeypatch.setenv(key, value)

    sys.path.insert(0, "ai_service/backend")
    sys.modules.pop("config", None)
    return importlib.import_module("config")


def test_gemini_is_required(monkeypatch):
    config = load_config(monkeypatch)
    with pytest.raises(ValueError):
        config.validate_config()


def test_groq_and_cloudinary_are_optional(monkeypatch):
    config = load_config(monkeypatch, GEMINI_API_KEY="test-gemini")

    assert config.GROQ_ENABLED is False
    assert config.CLOUDINARY_ENABLED is False
    assert config.DID_ENABLED is False


def test_groq_and_cloudinary_enable_when_configured(monkeypatch):
    config = load_config(
        monkeypatch,
        GEMINI_API_KEY="test-gemini",
        GROQ_API_KEY="test-groq",
        CLOUDINARY_CLOUD_NAME="test-cloud",
        CLOUDINARY_API_KEY="test-key",
        CLOUDINARY_API_SECRET="test-secret",
        DID_API_KEY="test-did-key",
        DID_SOURCE_URL="https://example.com/avatar.png",
    )

    assert config.GROQ_ENABLED is True
    assert config.CLOUDINARY_ENABLED is True
    assert config.DID_ENABLED is True
