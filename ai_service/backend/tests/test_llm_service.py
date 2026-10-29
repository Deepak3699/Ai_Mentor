import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import llm_service
from config import GROQ_MODEL, LLM_MAX_ATTEMPTS, LLM_TIMEOUT_SECONDS
from llm_service import LLMAuthError, LLMError, generate_text, strip_code_fences

SYSTEM_INSTRUCTION = "You are a helpful study assistant."
USER_DATA = {"input": "Explain closures."}


class FakeProviderError(Exception):
    """Exception with optional structured fields, mimicking SDK errors."""

    def __init__(self, message, status_code=None, code=None, body=None):
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        if body is not None:
            self.body = body


def make_gemini_response(text):
    response = MagicMock()
    response.text = text
    return response


def make_groq_response(text):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=text))]
    return response


# =====================================================================
# 1. Configuration and call structure
# =====================================================================

def test_groq_model_comes_from_config_and_json_user_data_is_sent():
    groq = MagicMock()
    groq.chat.completions.create.return_value = make_groq_response("hello")

    with patch("llm_service.gemini_client", None), patch("llm_service.groq_client", groq):
        text, provider, model = generate_text(
            SYSTEM_INSTRUCTION, USER_DATA, max_tokens=50
        )

    assert text == "hello"
    assert provider == "groq"
    assert model == GROQ_MODEL
    kwargs = groq.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == GROQ_MODEL
    assert kwargs["timeout"] == LLM_TIMEOUT_SECONDS
    assert kwargs["max_tokens"] == 50
    messages = kwargs["messages"]
    assert [message["role"] for message in messages] == ["system", "user"]
    assert messages[0]["content"] == SYSTEM_INSTRUCTION
    assert json.loads(messages[1]["content"]) == USER_DATA


def test_gemini_call_site_has_explicit_timeout_and_json_user_data():
    gemini = MagicMock()
    gemini.models.generate_content.return_value = make_gemini_response("hello")

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", MagicMock()):
        text, provider, _ = generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert text == "hello"
    assert provider == "gemini"
    kwargs = gemini.models.generate_content.call_args.kwargs
    assert kwargs["model"] == llm_service.GEMINI_MODEL
    assert json.loads(kwargs["contents"]) == USER_DATA
    assert kwargs["config"].system_instruction == SYSTEM_INSTRUCTION
    assert kwargs["config"].http_options.timeout == LLM_TIMEOUT_SECONDS * 1000


def test_explicit_client_overrides_take_precedence_over_module_defaults():
    gemini = MagicMock()
    gemini.models.generate_content.return_value = make_gemini_response("override")
    groq = MagicMock()

    with patch("llm_service.gemini_client", None), patch("llm_service.groq_client", None):
        text, provider, _ = generate_text(
            SYSTEM_INSTRUCTION,
            USER_DATA,
            gemini_provider=gemini,
            groq_provider=groq,
        )

    assert text == "override"
    assert provider == "gemini"
    groq.chat.completions.create.assert_not_called()


def test_retry_settings_are_validated_and_clamped(monkeypatch):
    cases = [
        (0, 0.5, 1),
        (-3, 0.5, 1),
        ("invalid", 0.5, 1),
        (99, 0.5, llm_service.MAX_RETRY_ATTEMPTS),
        (True, 0.5, 1),
    ]
    for attempts, base_delay, expected_attempts in cases:
        monkeypatch.setattr(llm_service, "LLM_MAX_ATTEMPTS", attempts)
        monkeypatch.setattr(llm_service, "LLM_RETRY_BASE_DELAY_SECONDS", base_delay)
        actual_attempts, actual_delay = llm_service._retry_settings()
        assert actual_attempts == expected_attempts
        assert 0 <= actual_delay <= llm_service.MAX_RETRY_DELAY_SECONDS

    monkeypatch.setattr(llm_service, "LLM_MAX_ATTEMPTS", 2)
    monkeypatch.setattr(llm_service, "LLM_RETRY_BASE_DELAY_SECONDS", 9999)
    _, capped_delay = llm_service._retry_settings()
    assert capped_delay == llm_service.MAX_RETRY_DELAY_SECONDS


# =====================================================================
# 2. Authentication errors fail loudly (no silent fallback)
# =====================================================================

def test_gemini_auth_error_raises_and_skips_groq():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "API key not valid. Please pass a valid API key.", status_code=401
    )
    groq = MagicMock()

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        with pytest.raises(LLMAuthError):
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    groq.chat.completions.create.assert_not_called()


def test_groq_auth_error_raises_instead_of_being_masked():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "Gemini unavailable"
    )
    groq = MagicMock()
    groq.chat.completions.create.side_effect = FakeProviderError(
        "invalid api key", status_code=401
    )

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        with pytest.raises(LLMAuthError):
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)


def test_structured_error_code_triggers_auth_without_message_hint():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "request rejected", code="invalid_api_key"
    )
    groq = MagicMock()

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        with pytest.raises(LLMAuthError):
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    groq.chat.completions.create.assert_not_called()


def test_structured_response_body_triggers_auth():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "request rejected",
        status_code=400,
        body={"error": {"code": "permission_denied", "reason": "PERMISSION_DENIED"}},
    )
    groq = MagicMock()

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        with pytest.raises(LLMAuthError):
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    groq.chat.completions.create.assert_not_called()


def test_auth_wording_alone_does_not_trigger_auth():
    """Message text is untrusted metadata; only structured fields drive decisions."""
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "invalid api key: please rotate your key"
    )
    groq = MagicMock()
    groq.chat.completions.create.return_value = make_groq_response("fell back safely")

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        text, provider, _ = generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert text == "fell back safely"
    assert provider == "groq"


# =====================================================================
# 3. Empty and blocked Gemini responses handled explicitly
# =====================================================================

@pytest.mark.parametrize("blocked", [None, "", "   "])
def test_empty_or_blocked_gemini_response_triggers_fallback(blocked):
    gemini = MagicMock()
    gemini.models.generate_content.return_value = make_gemini_response(blocked)
    groq = MagicMock()
    groq.chat.completions.create.return_value = make_groq_response("fallback text")

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        text, provider, _ = generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert text == "fallback text"
    assert provider == "groq"


# =====================================================================
# 4. Retries for transient 429/5xx errors
# =====================================================================

def test_retryable_error_is_retried_with_backoff():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = [
        FakeProviderError("rate limited", status_code=429),
        make_gemini_response("recovered"),
    ]
    groq = MagicMock()

    with patch("llm_service.gemini_client", gemini), \
         patch("llm_service.groq_client", groq), \
         patch("llm_service.time.sleep") as mock_sleep:
        text, provider, _ = generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert text == "recovered"
    assert provider == "gemini"
    assert gemini.models.generate_content.call_count == 2
    groq.chat.completions.create.assert_not_called()
    mock_sleep.assert_called_once()


def test_retryable_error_exhausts_retries_then_falls_back():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "server error", status_code=503
    )
    groq = MagicMock()
    groq.chat.completions.create.return_value = make_groq_response("groq result")

    with patch("llm_service.gemini_client", gemini), \
         patch("llm_service.groq_client", groq), \
         patch("llm_service.time.sleep") as mock_sleep:
        text, provider, _ = generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert text == "groq result"
    assert provider == "groq"
    assert gemini.models.generate_content.call_count == LLM_MAX_ATTEMPTS
    assert mock_sleep.call_count == LLM_MAX_ATTEMPTS - 1


# =====================================================================
# 5. Transient (non-retryable) errors fall back immediately
# =====================================================================

def test_transient_error_falls_back_without_retry_or_sleep():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "Gemini unavailable"
    )
    groq = MagicMock()
    groq.chat.completions.create.return_value = make_groq_response("ok")

    with patch("llm_service.gemini_client", gemini), \
         patch("llm_service.groq_client", groq), \
         patch("llm_service.time.sleep") as mock_sleep:
        text, provider, _ = generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert text == "ok"
    assert provider == "groq"
    assert gemini.models.generate_content.call_count == 1
    mock_sleep.assert_not_called()


# =====================================================================
# 6. Parser/validation failures behave like provider failures
# =====================================================================

def test_parser_failure_falls_back_to_next_provider():
    gemini = MagicMock()
    gemini.models.generate_content.return_value = make_gemini_response("not json")
    groq = MagicMock()
    groq.chat.completions.create.return_value = make_groq_response('{"valid": true}')

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        result, provider, _ = generate_text(
            SYSTEM_INSTRUCTION, USER_DATA, parser=json.loads
        )

    assert result == {"valid": True}
    assert provider == "groq"


def test_gemini_parser_success_does_not_call_groq():
    gemini = MagicMock()
    gemini.models.generate_content.return_value = make_gemini_response('{"valid": true}')
    groq = MagicMock()

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        result, provider, _ = generate_text(
            SYSTEM_INSTRUCTION, USER_DATA, parser=json.loads
        )

    assert result == {"valid": True}
    assert provider == "gemini"
    groq.chat.completions.create.assert_not_called()


# =====================================================================
# 7. Total failure surfaces one clear error mentioning both providers
# =====================================================================

def test_all_providers_fail_raises_error_naming_each_provider():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "Gemini connection timed out after 60s"
    )
    groq = MagicMock()
    groq.chat.completions.create.side_effect = FakeProviderError("Groq down")

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        with pytest.raises(LLMError) as exc_info:
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    message = str(exc_info.value)
    assert "Gemini" in message
    assert "Groq" in message
    assert "failed" in message.lower()


def test_failure_message_is_sanitized_but_names_each_provider():
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(
        "token=gemini-secret https://provider.invalid/resource"
    )
    groq = MagicMock()
    groq.chat.completions.create.side_effect = FakeProviderError(
        "api_key=groq-secret"
    )

    with patch("llm_service.gemini_client", gemini), patch("llm_service.groq_client", groq):
        with pytest.raises(LLMError) as exc_info:
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    message = str(exc_info.value)
    assert "Gemini" in message
    assert "Groq" in message
    assert "code=provider_error" in message
    assert "gemini-secret" not in message
    assert "groq-secret" not in message
    assert "provider.invalid" not in message


def test_provider_exception_text_is_not_logged(caplog):
    secret = "token=super-secret https://provider.invalid/signature"
    gemini = MagicMock()
    gemini.models.generate_content.side_effect = FakeProviderError(secret)
    groq = MagicMock()
    groq.chat.completions.create.side_effect = FakeProviderError(secret)

    with patch("llm_service.gemini_client", gemini), \
         patch("llm_service.groq_client", groq), \
         caplog.at_level("WARNING", logger="llm_service"):
        with pytest.raises(LLMError):
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert "super-secret" not in caplog.text
    assert "provider.invalid" not in caplog.text
    assert "code=provider_error" in caplog.text


# =====================================================================
# 8. No provider configured
# =====================================================================

def test_no_provider_configured_raises():
    with patch("llm_service.gemini_client", None), patch("llm_service.groq_client", None):
        with pytest.raises(LLMError) as exc_info:
            generate_text(SYSTEM_INSTRUCTION, USER_DATA)

    assert "No LLM provider is configured" in str(exc_info.value)


# =====================================================================
# 9. Code-fence stripping helper
# =====================================================================

def test_strip_code_fences():
    assert strip_code_fences('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert strip_code_fences('```json{"a": 1}```') == '{"a": 1}'
    assert strip_code_fences('```\nvalue\n```') == 'value'
    assert strip_code_fences('```{"a": 1}```') == '{"a": 1}'
    assert strip_code_fences("  plain text  ") == "plain text"
