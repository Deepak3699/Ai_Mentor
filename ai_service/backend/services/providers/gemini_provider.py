from __future__ import annotations

import logging
import sys
from typing import Any

from google import genai
from google.genai import types

from backend.config import GEMINI_API_KEY, GEMINI_MODEL, LLM_TIMEOUT_SECONDS
from backend.services.providers.base import BaseAIProvider, serialize_user_data

logger = logging.getLogger(__name__)

GEMINI_CODE_MODEL = "gemini-3.8-flash"

gemini_client = (
    genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000),
    )
    if GEMINI_API_KEY
    else None
)


def get_gemini_client():
    """Retrieve gemini_client, respecting test monkeypatching/patching on api module."""
    api_mod = sys.modules.get("api") or sys.modules.get("backend.api")
    if api_mod is not None and hasattr(api_mod, "gemini_client"):
        return getattr(api_mod, "gemini_client")
    return gemini_client


def generate_gemini_content(
    system_instruction: str,
    user_data: dict[str, Any],
    model: str = GEMINI_MODEL,
    **kwargs: Any,
) -> Any:
    """Generate content with Gemini and return the SDK response."""
    client = get_gemini_client()
    if client is None:
        raise RuntimeError("Gemini client is not configured.")

    timeout_seconds = kwargs.get("timeout") or LLM_TIMEOUT_SECONDS
    config_options: dict[str, Any] = {
        "system_instruction": system_instruction,
        "http_options": types.HttpOptions(timeout=int(timeout_seconds * 1000)),
    }
    temperature = kwargs.get("temperature")
    if temperature is not None:
        config_options["temperature"] = temperature

    return client.models.generate_content(
        model=model,
        contents=serialize_user_data(user_data),
        config=types.GenerateContentConfig(**config_options),
    )


class GeminiProvider(BaseAIProvider):
    """Primary AI provider implementation utilizing Google Gemini."""

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return GEMINI_MODEL

    @property
    def code_model_name(self) -> str:
        return GEMINI_CODE_MODEL

    def _generate_raw_completion(
        self,
        system_instruction: str,
        user_data: dict[str, Any],
        **kwargs: Any,
    ) -> str:
        """Call Gemini and return the raw response text.

        Honored kwargs: ``model``, ``temperature``, ``timeout`` (seconds).
        ``max_tokens`` is intentionally ignored: output-token caps can truncate
        Gemini thinking models, so the model's own limits apply.
        """
        response = generate_gemini_content(
            system_instruction,
            user_data,
            **kwargs,
        )
        return response.text or ""
