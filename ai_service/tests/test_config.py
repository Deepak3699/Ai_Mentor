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
    assert config.LLM_TIMEOUT_SECONDS == 60


def test_config_custom_llm_timeout(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "45")
    config = import_config(monkeypatch)
    assert config.LLM_TIMEOUT_SECONDS == 45


def test_get_model_config_uses_default_when_environment_value_is_unset(monkeypatch):
    config = import_config(monkeypatch)
    monkeypatch.delenv("TEST_MODEL", raising=False)

    assert config.get_model_config("TEST_MODEL", "fallback-model") == "fallback-model"


def test_get_model_config_accepts_custom_environment_value(monkeypatch):
    config = import_config(monkeypatch)
    monkeypatch.setenv("TEST_MODEL", "custom-model")

    assert config.get_model_config("TEST_MODEL", "fallback-model") == "custom-model"


@pytest.mark.parametrize("value", ["", "   ", "\t"])
def test_get_model_config_uses_default_for_empty_or_whitespace_values(
    monkeypatch, value
):
    config = import_config(monkeypatch)
    monkeypatch.setenv("TEST_MODEL", value)

    assert config.get_model_config("TEST_MODEL", "fallback-model") == "fallback-model"

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
