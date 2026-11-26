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
    # Verifies avatar video download size defaults to 100 MB when not overridden
    assert config.MAX_AVATAR_DOWNLOAD_BYTES == 100 * 1024 * 1024


# Verify that a custom MAX_AVATAR_DOWNLOAD_BYTES env variable is properly parsed
def test_config_custom_avatar_download_limit(monkeypatch):
    monkeypatch.setenv("MAX_AVATAR_DOWNLOAD_BYTES", "52428800")
    config = import_config(monkeypatch)
    assert config.MAX_AVATAR_DOWNLOAD_BYTES == 52428800


# Verify that validate_config() raises a ValueError if MAX_AVATAR_DOWNLOAD_BYTES is <= 0
def test_validate_config_rejects_non_positive_avatar_download_limit(monkeypatch):
    monkeypatch.setenv("MAX_AVATAR_DOWNLOAD_BYTES", "0")
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "test"
    with pytest.raises(ValueError, match="MAX_AVATAR_DOWNLOAD_BYTES"):
        config.validate_config()


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


# Verify RAG is disabled by default and parsed default values match expectations
def test_rag_disabled_by_default(monkeypatch):
    config = import_config(monkeypatch)
    assert config.RAG_ENABLED is False
    assert config.RAG_EMBEDDING_MODEL == "text-embedding-004"
    assert config.RAG_EMBEDDING_DIMENSIONS == 768
    assert config.RAG_EMBEDDING_BATCH_SIZE == 32
    assert config.RAG_TOP_K == 4
    assert config.RAG_MAX_TOP_K == 10
    assert config.RAG_SIMILARITY_THRESHOLD == 0.7
    assert config.RAG_CHUNK_SIZE == 1000
    assert config.RAG_CHUNK_OVERLAP == 200
    assert config.RAG_MAX_CONTEXT_SIZE == 4000
    assert config.RAG_MAX_UPLOAD_BYTES == 10485760


# Verify that invalid RAG values are ignored when RAG_ENABLED is false
def test_rag_disabled_ignores_invalid_values(monkeypatch):
    monkeypatch.setenv("RAG_ENABLED", "false")
    monkeypatch.setenv("RAG_EMBEDDING_DIMENSIONS", "9999")
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "test"
    assert config.validate_config() is None


# Verify that default RAG settings pass validation when RAG_ENABLED is true
def test_rag_valid_when_enabled(monkeypatch):
    monkeypatch.setenv("RAG_ENABLED", "true")
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "test"
    assert config.validate_config() is None


# Parametrized test checking that each invalid value raises ValueError naming the variable
@pytest.mark.parametrize(
    "env_vars,expected_match",
    [
        ({"RAG_EMBEDDING_DIMENSIONS": "0"}, "RAG_EMBEDDING_DIMENSIONS"),
        ({"RAG_EMBEDDING_DIMENSIONS": "2001"}, "RAG_EMBEDDING_DIMENSIONS"),
        ({"RAG_EMBEDDING_BATCH_SIZE": "0"}, "RAG_EMBEDDING_BATCH_SIZE"),
        ({"RAG_EMBEDDING_BATCH_SIZE": "-1"}, "RAG_EMBEDDING_BATCH_SIZE"),
        ({"RAG_TOP_K": "0"}, "RAG_TOP_K"),
        ({"RAG_MAX_TOP_K": "0"}, "RAG_MAX_TOP_K"),
        ({"RAG_TOP_K": "15", "RAG_MAX_TOP_K": "10"}, "RAG_TOP_K"),
        ({"RAG_CHUNK_SIZE": "0"}, "RAG_CHUNK_SIZE"),
        ({"RAG_CHUNK_OVERLAP": "-1"}, "RAG_CHUNK_OVERLAP"),
        ({"RAG_CHUNK_SIZE": "500", "RAG_CHUNK_OVERLAP": "500"}, "RAG_CHUNK_OVERLAP"),
        ({"RAG_CHUNK_SIZE": "500", "RAG_CHUNK_OVERLAP": "600"}, "RAG_CHUNK_OVERLAP"),
        ({"RAG_SIMILARITY_THRESHOLD": "1.1"}, "RAG_SIMILARITY_THRESHOLD"),
        ({"RAG_SIMILARITY_THRESHOLD": "-0.1"}, "RAG_SIMILARITY_THRESHOLD"),
        ({"RAG_MAX_CONTEXT_SIZE": "0"}, "RAG_MAX_CONTEXT_SIZE"),
        ({"RAG_MAX_UPLOAD_BYTES": "0"}, "RAG_MAX_UPLOAD_BYTES"),
    ],
)
def test_rag_validation_rules(monkeypatch, env_vars, expected_match):
    monkeypatch.setenv("RAG_ENABLED", "true")
    for key, val in env_vars.items():
        monkeypatch.setenv(key, val)
    config = import_config(monkeypatch)
    config.GEMINI_API_KEY = "test"
    with pytest.raises(ValueError, match=expected_match):
        config.validate_config()
