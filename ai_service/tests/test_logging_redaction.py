
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BACKEND_PATH = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_PATH))

import api


def test_log_event_does_not_emit_unapproved_sensitive_fields(caplog):
    secret_topic = "FAKE_TOPIC_SENTINEL"
    secret_preferences = "PRIVATE_PREFERENCES_456"
    secret_error = "PRIVATE_PROVIDER_ERROR_789"

    with caplog.at_level("INFO", logger=api.logger.name):
        api.log_event(
            "INFO",
            "Lesson generation started",
            job="safe-job-123",
            topic=secret_topic,
            preferences=secret_preferences,
            error=secret_error,
        )

    assert "safe-job-123" in caplog.text
    assert secret_topic not in caplog.text
    assert secret_preferences not in caplog.text
    assert secret_error not in caplog.text


def test_log_event_preserves_safe_provider_metadata(caplog):
    with caplog.at_level("INFO", logger=api.logger.name):
        api.log_event(
            "INFO",
            "Lesson script generated",
            provider="gemini",
            words=50,
        )

    assert "provider=gemini" in caplog.text
    assert "words=50" in caplog.text


@pytest.mark.asyncio
async def test_provider_failures_do_not_leak_exception_messages(caplog):
    job_id = "safe-job-456"
    private_gemini_error = "PRIVATE_GEMINI_RESPONSE_123"
    private_groq_error = "PRIVATE_GROQ_RESPONSE_456"
    request = api.LessonRequest(
        course="Computer Science",
        topic="Private topic",
        celebrity="modi",
    )

    with (
        patch(
            "api.gemini_client.models.generate_content",
            side_effect=Exception(private_gemini_error),
        ),
        patch(
            "api.groq_client.chat.completions.create",
            side_effect=Exception(private_groq_error),
        ),
        caplog.at_level("INFO", logger=api.logger.name),
    ):
        await api.process_lesson(request, job_id)

    assert private_gemini_error not in caplog.text
    assert private_groq_error not in caplog.text

    status = api.job_status[job_id]
    assert status["status"] == "failed"
    assert status["error"] == status["reason"]
    assert private_gemini_error not in status["error"]
    assert private_groq_error not in status["error"]
    assert "Private topic" not in caplog.text
    assert "modi" not in caplog.text


def test_log_event_rejects_non_ascii_message(caplog):
    private_message = "PRIVATE_TOPIC_秘密"

    with caplog.at_level("INFO", logger=api.logger.name):
        api.log_event("INFO", private_message)

    assert private_message not in caplog.text
    assert "Log event omitted: invalid message" in caplog.text
