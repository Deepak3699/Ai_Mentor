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


def test_validate_config_reports_missing_gemini_key_first(monkeypatch):
    config = import_config(monkeypatch)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        config.validate_config()


def test_validate_config_reports_missing_groq_key(monkeypatch):
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    with pytest.raises(ValueError, match="GROQ_API_KEY"):
        config.validate_config()


def test_validate_config_reports_missing_cloudinary_credentials(monkeypatch):
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    config.GROQ_API_KEY = "groq-test"
    with pytest.raises(ValueError, match="Cloudinary credentials missing"):
        config.validate_config()


def test_validate_config_accepts_complete_configuration(monkeypatch):
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "gemini-test"
    config.GROQ_API_KEY = "groq-test"
    config.CLOUDINARY_CLOUD_NAME = "cloud"
    config.CLOUDINARY_API_KEY = "key"
    config.CLOUDINARY_API_SECRET = "secret"
    assert config.validate_config() is None
