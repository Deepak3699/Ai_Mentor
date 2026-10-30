from __future__ import annotations


def log_event(level: str, message: str, **details):
    """Write compact, scan-friendly service logs without exposing payloads or URLs."""
    suffix = ""
    visible = [f"{key}={value}" for key, value in details.items() if value not in (None, "")]
    if visible:
        suffix = " | " + " | ".join(visible)
    print(f"[{level}] {message}{suffix}", flush=True)


def short_error(error: Exception | str, limit: int = 180) -> str:
    message = " ".join(str(error).split())
    return message if len(message) <= limit else f"{message[: limit - 3]}..."
