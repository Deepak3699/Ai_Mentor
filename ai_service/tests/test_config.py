import importlib
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def import_config(monkeypatch):
    for key in (
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "GEMINI_EXPLAIN_MODEL",
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "GROQ_EXPLAIN_MODEL",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ):
        # Keep an explicit empty value so load_dotenv(override=False) cannot
        # repopulate real local secrets while this test imports config.
        monkeypatch.setenv(key, "")
    sys.modules.pop("config", None)
    return importlib.import_module("config")


def test_config_imports_without_external_credentials(monkeypatch):
    config = import_config(monkeypatch)
    assert not config.GEMINI_API_KEY
    assert not config.GROQ_API_KEY
    assert config.GEMINI_MODEL == "gemini-2.5-flash"
    assert config.LLM_TIMEOUT_SECONDS == 60


def test_config_custom_llm_timeout(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "45")
    config = import_config(monkeypatch)
    assert config.LLM_TIMEOUT_SECONDS == 45


def test_config_uses_default_provider_models(monkeypatch):
    config = import_config(monkeypatch)

    assert config.GEMINI_MODEL == "gemini-2.5-flash"
    assert config.GEMINI_EXPLAIN_MODEL == "gemini-3.8-flash"
    assert config.GROQ_MODEL == "llama-3.3-70b-versatile"
    assert config.GROQ_EXPLAIN_MODEL == "openai/gpt-oss-120b"


def test_config_uses_custom_provider_models(monkeypatch):
    config = import_config(monkeypatch)

    monkeypatch.setenv("GEMINI_MODEL", "custom-gemini")
    monkeypatch.setenv("GEMINI_EXPLAIN_MODEL", "custom-gemini-explain")
    monkeypatch.setenv("GROQ_MODEL", "custom-groq")
    monkeypatch.setenv("GROQ_EXPLAIN_MODEL", "custom-groq-explain")

    config = importlib.reload(config)

    assert config.GEMINI_MODEL == "custom-gemini"
    assert config.GEMINI_EXPLAIN_MODEL == "custom-gemini-explain"
    assert config.GROQ_MODEL == "custom-groq"
    assert config.GROQ_EXPLAIN_MODEL == "custom-groq-explain"


def test_config_uses_defaults_for_whitespace_model_values(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "   ")
    monkeypatch.setenv("GEMINI_EXPLAIN_MODEL", " ")
    monkeypatch.setenv("GROQ_MODEL", "  ")
    monkeypatch.setenv("GROQ_EXPLAIN_MODEL", "\t")

    config = import_config(monkeypatch)

    assert config.GEMINI_MODEL == "gemini-2.5-flash"
    assert config.GEMINI_EXPLAIN_MODEL == "gemini-3.8-flash"
    assert config.GROQ_MODEL == "llama-3.3-70b-versatile"
    assert config.GROQ_EXPLAIN_MODEL == "openai/gpt-oss-120b"


def test_validate_config_reports_missing_gemini_key_first(monkeypatch):
    config = import_config(monkeypatch)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        config.validate_config()


def test_validate_config_allows_missing_groq_key(monkeypatch):
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    assert config.validate_config() is None


def test_validate_config_allows_missing_cloudinary_credentials(monkeypatch):
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    assert config.validate_config() is None


def test_validate_config_accepts_complete_configuration(monkeypatch):
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    config.GROQ_API_KEY = "groq-test"
    config.CLOUDINARY_CLOUD_NAME = "cloud"
    config.CLOUDINARY_API_KEY = "key"
    config.CLOUDINARY_API_SECRET = "secret"
    assert config.validate_config() is None


