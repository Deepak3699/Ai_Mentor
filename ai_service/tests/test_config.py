import importlib
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def import_config(monkeypatch, log_level="INFO"):
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
    monkeypatch.setenv("LOG_LEVEL", log_level)
    sys.modules.pop("config", None)
    return importlib.import_module("config")


def test_config_imports_without_external_credentials(monkeypatch):
    config = import_config(monkeypatch)
    assert not config.GEMINI_API_KEY
    assert not config.GROQ_API_KEY
    assert config.GEMINI_MODEL == "gemini-2.5-flash"
    assert config.LOG_LEVEL == "INFO"


def test_config_reads_log_level_case_insensitively(monkeypatch):
    config = import_config(monkeypatch, log_level="debug")
    assert config.LOG_LEVEL == "DEBUG"


@pytest.mark.parametrize(
    "log_level",
    ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
)
def test_config_accepts_supported_log_levels(monkeypatch, log_level):
    config = import_config(monkeypatch, log_level=log_level)
    assert config.LOG_LEVEL == log_level


def test_config_rejects_unsupported_log_level(monkeypatch):
    with pytest.raises(ValueError, match="Invalid LOG_LEVEL.*Choose one of"):
        import_config(monkeypatch, log_level="verbose")


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
