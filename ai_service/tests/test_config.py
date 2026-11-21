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
        "GROQ_API_KEY",
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


def test_config_llm_timeout_missing_uses_default(monkeypatch):
    monkeypatch.delenv("LLM_TIMEOUT_SECONDS", raising=False)
    config = import_config(monkeypatch)
    assert config.LLM_TIMEOUT_SECONDS == 60

    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "")
    config = import_config(monkeypatch)
    assert config.LLM_TIMEOUT_SECONDS == 60

    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "   ")
    config = import_config(monkeypatch)
    assert config.LLM_TIMEOUT_SECONDS == 60


@pytest.mark.parametrize("valid_timeout,expected", [("1", 1), ("45", 45), ("60", 60), ("300", 300)])
def test_config_llm_timeout_valid_values(monkeypatch, valid_timeout, expected):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", valid_timeout)
    config = import_config(monkeypatch)
    assert config.LLM_TIMEOUT_SECONDS == expected


@pytest.mark.parametrize("invalid_value", ["not_a_number", "12.5", "true", "60s", "abc"])
def test_config_llm_timeout_non_numeric_fails(monkeypatch, invalid_value):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", invalid_value)
    with pytest.raises(ValueError) as exc_info:
        import_config(monkeypatch)
    assert "LLM_TIMEOUT_SECONDS" in str(exc_info.value)


def test_config_llm_timeout_zero_fails(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "0")
    with pytest.raises(ValueError) as exc_info:
        import_config(monkeypatch)
    assert "LLM_TIMEOUT_SECONDS" in str(exc_info.value)


@pytest.mark.parametrize("negative_value", ["-1", "-60", "-300"])
def test_config_llm_timeout_negative_fails(monkeypatch, negative_value):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", negative_value)
    with pytest.raises(ValueError) as exc_info:
        import_config(monkeypatch)
    assert "LLM_TIMEOUT_SECONDS" in str(exc_info.value)


@pytest.mark.parametrize("over_limit_value", ["301", "600", "1000", "60000"])
def test_config_llm_timeout_over_limit_fails(monkeypatch, over_limit_value):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", over_limit_value)
    with pytest.raises(ValueError) as exc_info:
        import_config(monkeypatch)
    assert "LLM_TIMEOUT_SECONDS" in str(exc_info.value)


def test_config_llm_timeout_error_never_prints_secrets(monkeypatch):
    secret_key = "AIzaSyDUMMY_SECRET_KEY_123456789"
    secret_in_timeout = "SECRET_TOKEN_IN_TIMEOUT_XYZ"
    monkeypatch.setenv("GEMINI_API_KEY", secret_key)
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", secret_in_timeout)

    with pytest.raises(ValueError) as exc_info:
        import_config(monkeypatch)

    err_msg = str(exc_info.value)
    assert "LLM_TIMEOUT_SECONDS" in err_msg
    assert secret_key not in err_msg
    assert secret_in_timeout not in err_msg


def test_validate_config_rejects_invalid_timeout(monkeypatch):
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "60")
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    assert config.validate_config() is None

    config.LLM_TIMEOUT_SECONDS = 0
    with pytest.raises(ValueError, match="LLM_TIMEOUT_SECONDS"):
        config.validate_config()

    config.LLM_TIMEOUT_SECONDS = -10
    with pytest.raises(ValueError, match="LLM_TIMEOUT_SECONDS"):
        config.validate_config()

    config.LLM_TIMEOUT_SECONDS = 500
    with pytest.raises(ValueError, match="LLM_TIMEOUT_SECONDS"):
        config.validate_config()



