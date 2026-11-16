from __future__ import annotations

import logging
import re

from backend.config import GEMINI_MODEL

logger = logging.getLogger(__name__)


SAFE_LOG_FIELDS = {
    "job",
    "provider",
    "model",
    "stage",
    "status",
    "configured",
    "words",
    "duration",
    "audio",
    "delivery",
    "attempt",
    "code",
}
SAFE_LOG_VALUES = {
    "provider": {"gemini", "groq"},
    "stage": {"started", "completed", "failed"},
    "status": {"queued", "processing", "completed", "failed"},
    "configured": {"true", "false"},
    "audio": {"true", "false"},
    "delivery": {"success", "failed"},
}
SAFE_MESSAGES = {
    "Log event omitted: invalid message",
    "Generation event",
    "Preferences loaded",
    "Script prepared",
    "Lesson generation started",
    "Lesson request accepted",
    "Lesson script generated",
    "Gemini lesson generation failed",
    "Gemini quiz generation failed",
    "Gemini syllabus generation failed; trying Groq",
    "Gemini returned invalid syllabus JSON",
    "Groq returned invalid syllabus JSON",
    "Groq syllabus generation failed",
    "Renderer source selected",
    "Default renderer source selected",
    "Switching to Groq fallback",
    "Trying Gemini",
    "Trying Groq fallback",
    "Generating quiz",
    "Quiz generated and validated",
    "Quiz generation attempt failed",
    "Gemini code analysis failed",
    "Groq code analysis failed",
    "Invalid AI response",
}


def log_event(level: str, message: str, **details) -> None:
    """Log approved operational metadata only."""
    if not isinstance(message, str) or not message.isascii():
        safe_message = "Log event omitted: invalid message"
    elif message in SAFE_MESSAGES:
        safe_message = message
    else:
        safe_message = "Generation event"

    safe_details = {}
    for key, value in details.items():
        if key not in SAFE_LOG_FIELDS or value is None:
            continue

        if key in SAFE_LOG_VALUES:
            if isinstance(value, bool):
                normalized = str(value).lower()
            elif isinstance(value, str):
                normalized = value.lower()
            else:
                continue
            if normalized in SAFE_LOG_VALUES[key]:
                safe_details[key] = normalized
        elif key in {"words", "attempt"}:
            if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                safe_details[key] = value
        elif key == "duration":
            if (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and 0 <= value <= 86400
            ):
                safe_details[key] = value
        elif key == "job":
            if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
                safe_details[key] = value
        elif key == "model":
            if isinstance(value, str) and value in {
                GEMINI_MODEL,
                "llama-3.3-70b-versatile",
            }:
                safe_details[key] = value
        elif key == "code":
            if isinstance(value, int) and not isinstance(value, bool):
                safe_details[key] = value

    suffix = (
        " | " + " | ".join(f"{key}={value}" for key, value in safe_details.items())
        if safe_details
        else ""
    )
    log_method = getattr(
        logger,
        {"warn": "warning"}.get(level.lower(), level.lower()),
        logger.info,
    )
    log_method("%s%s", safe_message, suffix)


def short_error(error: Exception | str, limit: int = 180) -> str:
    message = " ".join(str(error).split())
    return message if len(message) <= limit else f"{message[: limit - 3]}..."
