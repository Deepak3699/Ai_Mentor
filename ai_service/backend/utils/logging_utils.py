from __future__ import annotations

import logging
import re

from backend.config import GEMINI_MODEL

logger = logging.getLogger(__name__)


SAFE_LOG_FIELDS = {
    "job", "correlation_id", "provider", "model", "stage", "status",
    "configured", "words", "duration", "audio", "delivery",
    "attempt", "code", "error", "failure",
}
SAFE_LOG_VALUES = {
    "provider": {"gemini", "groq"},
    "stage": {"started", "completed", "failed"},
    "status": {"queued", "processing", "completed", "failed"},
    "configured": {"true", "false"},
    "delivery": {"cloud", "local"},
    "error": {"provider_failed", "timeout", "missing_file",
              "permission_denied", "subprocess_failed",
              "invalid_data", "processing_error"},
    "failure": {"provider_failed", "timeout", "missing_file",
                "permission_denied", "subprocess_failed",
                "invalid_data", "processing_error"},
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
    "Lesson generation failed",
    "Narration generation failed",
    "D-ID unavailable; using FFmpeg fallback",
    "Starting FFmpeg fallback renderer",
    "Rendering lesson video with FFmpeg",
    "FFmpeg video render completed",
    "Subtitle generation failed; video remains available",
    "Video upload failed; using local proxy",
    "Subtitle files uploaded",
    "Video metadata probe failed",
    "Could not read audio duration",
    "Avatar source cleanup failed",
    "Fallback source video not found",
    "FFmpeg render failed",
    "FFmpeg completed without an output video",
    "Subtitle upload failed; using local files",
    "Temporary file removed",
    "Temporary file cleanup failed",
    "Uploading lesson video",
    "Lesson video uploaded",
    "Trying Gemini for lesson script",
    "Gemini lesson script generated",
    "Generating syllabus with Gemini",
    "Trying Groq fallback for lesson script",
    "Groq fallback lesson script generated",
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
        elif key in {"job", "correlation_id"}:
            if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
                safe_details[key] = value
        elif key in {"audio", "duration"}:
            if isinstance(value, str) and re.fullmatch(r"\\d+(?:\\.\\d+)?s", value):
                safe_details[key] = value
            elif key == "duration" and isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 86400:
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
    """Return a safe error category without exposing exception text."""
    if isinstance(error, TimeoutError) or "timeout" in type(error).__name__.lower():
        return "timeout"
    if isinstance(error, FileNotFoundError):
        return "missing_file"
    if isinstance(error, PermissionError):
        return "permission_denied"
    if isinstance(error, ValueError):
        return "invalid_data"
    if isinstance(error, OSError):
        return "processing_error"
    if isinstance(error, Exception):
        return "provider_failed" if "provider" in type(error).__name__.lower() else "processing_error"
    return "processing_error"
