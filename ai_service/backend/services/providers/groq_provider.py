from __future__ import annotations

import logging
import sys
from typing import Any

from groq import Groq

from backend.config import GROQ_API_KEY, GROQ_ENABLED, LLM_TIMEOUT_SECONDS
from backend.services.providers.base import BaseAIProvider, serialize_user_data

logger = logging.getLogger(__name__)

GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile"
GROQ_CODE_MODEL = "openai/gpt-oss-120b"
GROQ_DEFAULT_TEMPERATURE = 0.7
GROQ_DEFAULT_MAX_TOKENS = 2000

groq_client = (
    Groq(
        api_key=GROQ_API_KEY,
        timeout=LLM_TIMEOUT_SECONDS,
    )
    if GROQ_ENABLED
    else None
)


def get_groq_client():
    """Retrieve groq_client, respecting test monkeypatching/patching on api module."""
    api_mod = sys.modules.get("api") or sys.modules.get("backend.api")
    if api_mod is not None and hasattr(api_mod, "groq_client"):
        return getattr(api_mod, "groq_client")
    return groq_client


def generate_groq_content(
    system_instruction: str,
    user_data: dict[str, Any],
    **kwargs: Any,
) -> Any:
    """Generate content with Groq and return the SDK response."""
    client = get_groq_client()
    if client is None:
        raise RuntimeError("Groq client is not configured.")

    temperature = kwargs.get("temperature")
    return client.chat.completions.create(
        model=kwargs.get("model") or GROQ_DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": serialize_user_data(user_data)},
        ],
        temperature=(
            GROQ_DEFAULT_TEMPERATURE if temperature is None else temperature
        ),
        max_tokens=kwargs.get("max_tokens") or GROQ_DEFAULT_MAX_TOKENS,
        timeout=kwargs.get("timeout") or LLM_TIMEOUT_SECONDS,
    )


class GroqProvider(BaseAIProvider):
    """Fallback AI provider implementation utilizing Groq."""

    @property
    def provider_name(self) -> str:
        return "groq"

    @property
    def model_name(self) -> str:
        return GROQ_DEFAULT_MODEL

    @property
    def code_model_name(self) -> str:
        return GROQ_CODE_MODEL

    def _generate_raw_completion(
        self,
        system_instruction: str,
        user_data: dict[str, Any],
        **kwargs: Any,
    ) -> str:
        """Call Groq chat completions and return the raw message content.

        Honored kwargs: ``model``, ``temperature``, ``max_tokens``, ``timeout``.
        """
        response = generate_groq_content(
            system_instruction,
            user_data,
            **kwargs,
        )
        return response.choices[0].message.content or ""
