"""Unified LLM text generation.

Provides one entry point (`generate_text`) used by every LLM call site in
`api.py`, replacing the duplicated Gemini-then-Groq fallback chains.

Behaviour:
- Gemini is primary, Groq is fallback; model names come from `config.py`
  (GEMINI_MODEL / GROQ_MODEL), never hard-coded.
- Messages follow the same untrusted-input contract as the service prompts:
  caller instructions in the system message, caller data serialized as a
  JSON user message.
- Authentication errors fail loudly and are never masked by a silent fallback.
  Auth/retry decisions use structured provider fields (HTTP status, error
  code/type/reason, response body), never provider message text.
- Transient errors (408/425/429/5xx) are retried with backoff before the
  fallback runs. Other errors fall back immediately.
- Provider exception text is never logged or embedded in raised errors. Only
  a safe category, HTTP status, and exception class are reported.
- Empty or blocked Gemini responses (`response.text` is None/empty) are
  handled explicitly so they look like a provider failure, not an
  AttributeError.
- Retry settings are clamped so invalid or hostile environment values cannot
  cause unbounded waits.
- All logging goes through the standard `logging` module.
"""

import json
import logging
import re
import time

from google import genai
from google.genai import types
from groq import Groq

from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GROQ_API_KEY,
    GROQ_ENABLED,
    GROQ_MODEL,
    LLM_MAX_ATTEMPTS,
    LLM_RETRY_BASE_DELAY_SECONDS,
    LLM_TIMEOUT_SECONDS,
)

logger = logging.getLogger(__name__)

AUTH_STATUS_CODES = frozenset({401, 403})
RETRYABLE_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})

AUTH_ERROR_CODES = frozenset(
    {
        "401",
        "403",
        "unauthenticated",
        "permission_denied",
        "permissiondenied",
        "invalid_api_key",
        "api_key_invalid",
        "api_key_expired",
        "authentication_error",
        "authenticationerror",
        "unauthorized",
        "access_denied",
        "forbidden",
    }
)

RETRYABLE_ERROR_CODES = frozenset(
    {
        "408",
        "425",
        "429",
        "500",
        "502",
        "503",
        "504",
        "rate_limit_exceeded",
        "rate_limit_error",
        "ratelimiterror",
        "resource_exhausted",
        "deadline_exceeded",
        "overloaded",
        "server_error",
        "internal_server_error",
        "internalservererror",
        "service_unavailable",
        "serviceunavailable",
        "bad_gateway",
        "badgateway",
        "gateway_timeout",
        "gatewaytimeout",
    }
)

MAX_RETRY_ATTEMPTS = 5
MAX_RETRY_DELAY_SECONDS = 10.0
DEFAULT_RETRY_BASE_DELAY_SECONDS = 0.5

_UNSET = object()


class LLMError(Exception):
    """Raised when text generation fails on all configured providers."""


class LLMAuthError(LLMError):
    """Raised when a provider rejects credentials; callers must not fall back."""


class LLMEmptyResponseError(LLMError):
    """Raised when a provider returns an empty or blocked response."""


gemini_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000),
) if GEMINI_API_KEY else None

groq_client = Groq(
    api_key=GROQ_API_KEY,
    timeout=LLM_TIMEOUT_SECONDS,
) if GROQ_ENABLED else None


def _retry_settings() -> tuple[int, float]:
    """Return validated retry settings, clamped to safe bounds."""
    attempts = LLM_MAX_ATTEMPTS
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts < 1:
        attempts = 1
    attempts = min(attempts, MAX_RETRY_ATTEMPTS)

    base_delay = LLM_RETRY_BASE_DELAY_SECONDS
    if (
        isinstance(base_delay, bool)
        or not isinstance(base_delay, (int, float))
        or base_delay < 0
    ):
        base_delay = DEFAULT_RETRY_BASE_DELAY_SECONDS
    base_delay = min(float(base_delay), MAX_RETRY_DELAY_SECONDS)

    return attempts, base_delay


def _as_int(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None


def _normalize_token(value) -> str | None:
    """Normalize a structured provider value into a short classification token."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return str(value)
    if not isinstance(value, str):
        return None
    token = value.strip().lower()
    if not token:
        return None
    return re.sub(r"[\s\-]+", "_", token)[:64]


def _collect_body_signals(body, statuses: set[int], tokens: set[str]) -> None:
    """Collect status/code signals from a parsed provider error body."""
    if isinstance(body, list):
        for item in body:
            _collect_body_signals(item, statuses, tokens)
        return
    if not isinstance(body, dict):
        return
    for key in ("status_code", "http_status", "status", "code"):
        status = _as_int(body.get(key))
        if status is not None:
            statuses.add(status)
    for key in ("code", "type", "reason", "status", "error"):
        value = body.get(key)
        if isinstance(value, (dict, list)):
            _collect_body_signals(value, statuses, tokens)
            continue
        token = _normalize_token(value)
        if token:
            tokens.add(token)
    for key in ("errors", "details"):
        value = body.get(key)
        if isinstance(value, (dict, list)):
            _collect_body_signals(value, statuses, tokens)


def _error_signals(error: Exception) -> tuple[set[int], set[str]]:
    """Extract structured status codes and error tokens from provider errors."""
    statuses: set[int] = set()
    tokens: set[str] = set()

    sources = [error]
    response = getattr(error, "response", None)
    if response is not None:
        sources.append(response)

    for source in sources:
        for attribute in ("status_code", "http_status", "status", "code"):
            value = getattr(source, attribute, None)
            if callable(value):
                continue
            status = _as_int(value)
            if status is not None:
                statuses.add(status)
            token = _normalize_token(value)
            if token:
                tokens.add(token)

        for attribute in ("type", "reason", "error_code"):
            value = getattr(source, attribute, None)
            if callable(value):
                continue
            token = _normalize_token(value)
            if token:
                tokens.add(token)

        body = getattr(source, "body", None)
        if not isinstance(body, (dict, list)) and isinstance(body, str):
            try:
                body = json.loads(body)
            except (TypeError, ValueError):
                body = None
        _collect_body_signals(body, statuses, tokens)

        json_getter = getattr(source, "json", None)
        if callable(json_getter):
            try:
                _collect_body_signals(json_getter(), statuses, tokens)
            except Exception:
                pass

        details = getattr(source, "details", None)
        _collect_body_signals(details, statuses, tokens)

    return statuses, tokens


def _classify(error: Exception) -> tuple[str, int | None]:
    """Return a safe failure category and, when available, an HTTP status."""
    statuses, tokens = _error_signals(error)
    status = min(statuses) if statuses else None

    if statuses & AUTH_STATUS_CODES or tokens & AUTH_ERROR_CODES:
        return "auth", status
    if statuses & RETRYABLE_STATUS_CODES or tokens & RETRYABLE_ERROR_CODES:
        return "retryable", status
    if isinstance(error, TimeoutError) or "timeout" in type(error).__name__.lower():
        return "timeout", status
    if isinstance(error, LLMEmptyResponseError):
        return "empty_response", status
    if isinstance(error, ValueError):
        return "invalid_response", status
    return "provider_error", status


def _safe_details(error: Exception) -> str:
    """Build sanitized error metadata without provider message text."""
    code, status = _classify(error)
    details = [f"code={code}"]
    if status is not None:
        details.append(f"status={status}")
    details.append(f"error_type={type(error).__name__}")
    return ", ".join(details)


def _serialize_user_data(user_data: dict) -> str:
    return json.dumps(user_data, ensure_ascii=False)


def _call_gemini(client, system_instruction: str, user_data: dict) -> str:
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=_serialize_user_data(user_data),
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000),
        ),
    )
    try:
        text = response.text
    except (AttributeError, ValueError):
        text = None
    if not text or not text.strip():
        raise LLMEmptyResponseError("Gemini returned an empty or blocked response")
    return text


def _call_groq(
    client,
    system_instruction: str,
    user_data: dict,
    max_tokens: int,
    temperature: float,
) -> str:
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": _serialize_user_data(user_data)},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=LLM_TIMEOUT_SECONDS,
    )
    text = response.choices[0].message.content
    if not text or not text.strip():
        raise LLMEmptyResponseError("Groq returned an empty response")
    return text


def _invoke_provider(call, provider: str) -> str:
    """Run one provider call, retrying only transient 4xx/5xx errors.

    Blocking backoff is intentional: synchronous endpoints run in FastAPI's
    worker pool and the async lesson path invokes this through
    ``asyncio.to_thread`` so the event loop is never blocked.
    """
    attempts, base_delay = _retry_settings()

    for attempt in range(1, attempts + 1):
        try:
            return call()
        except LLMAuthError:
            raise
        except Exception as error:
            failure_code, _ = _classify(error)
            if failure_code == "auth":
                logger.error(
                    "%s rejected credentials; failing loudly instead of falling back (%s)",
                    provider,
                    _safe_details(error),
                )
                raise LLMAuthError(
                    f"{provider} authentication failed ({_safe_details(error)})"
                ) from error
            if attempt < attempts and failure_code == "retryable":
                delay = min(base_delay * attempt, MAX_RETRY_DELAY_SECONDS)
                logger.warning(
                    "%s returned a retryable error (attempt %s/%s); retrying in %.2fs (%s)",
                    provider,
                    attempt,
                    attempts,
                    delay,
                    _safe_details(error),
                )
                time.sleep(delay)
                continue
            logger.warning(
                "%s request failed (attempt %s/%s): %s",
                provider,
                attempt,
                attempts,
                _safe_details(error),
            )
            raise


def strip_code_fences(text: str) -> str:
    """Remove a surrounding ```json / ``` code fence from model output."""
    value = text.strip()
    if value.startswith("```json"):
        value = value[7:]
    elif value.startswith("```"):
        value = value[3:]
    if value.endswith("```"):
        value = value[:-3]
    return value.strip()


def generate_text(
    system_instruction: str,
    user_data: dict,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    parser=None,
    *,
    gemini_provider=_UNSET,
    groq_provider=_UNSET,
):
    """Generate content with Gemini primary and Groq fallback.

    Args:
        system_instruction: Task and rules for the model (system message).
        user_data: Caller-supplied data, serialized and sent as the user
            message. Values in this object must be treated as untrusted data.
        max_tokens: Max tokens for the Groq fallback call.
        temperature: Sampling temperature for the Groq fallback call.
        parser: Optional callable applied to the raw text. If it raises, the
            output is treated as a provider failure and the next provider is
            tried.
        gemini_provider: Optional client override used by the caller (api.py)
            so patching `api.gemini_client` keeps working.
        groq_provider: Optional client override used by the caller (api.py)
            so patching `api.groq_client` keeps working.

    Returns:
        (result, provider, model) where result is the raw text, or the parser
        output when a parser is supplied.

    Raises:
        LLMAuthError: A provider rejected credentials (no fallback).
        LLMError: Every configured provider failed.
    """
    active_gemini = gemini_client if gemini_provider is _UNSET else gemini_provider
    active_groq = groq_client if groq_provider is _UNSET else groq_provider

    providers = []
    if active_gemini is not None:
        providers.append(
            (
                "Gemini",
                "gemini",
                GEMINI_MODEL,
                lambda client=active_gemini: _call_gemini(
                    client, system_instruction, user_data
                ),
            )
        )
    if active_groq is not None:
        providers.append(
            (
                "Groq",
                "groq",
                GROQ_MODEL,
                lambda client=active_groq: _call_groq(
                    client, system_instruction, user_data, max_tokens, temperature
                ),
            )
        )
    if not providers:
        raise LLMError("No LLM provider is configured")

    failures = []
    for display, name, model, call in providers:
        try:
            text = _invoke_provider(call, display)
        except LLMAuthError:
            raise
        except Exception as error:
            failures.append(f"{display} failed ({_safe_details(error)})")
            continue

        try:
            result = parser(text) if parser else text
        except Exception as error:
            failures.append(
                f"{display} returned invalid output ({_safe_details(error)})"
            )
            logger.warning(
                "%s output failed parsing/validation (%s)",
                name,
                _safe_details(error),
            )
            continue

        logger.info("%s generation succeeded", name)
        return result, name, model

    raise LLMError(f"LLM generation failed: {'; '.join(failures)}")
