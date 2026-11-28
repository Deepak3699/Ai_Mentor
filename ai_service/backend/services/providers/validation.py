
from __future__ import annotations

import html
import re


class ProviderGenerationError(RuntimeError):
    """Raised when neither lesson-script provider returns usable narration."""


def sanitize_lesson_script(value: str) -> str:
    """Remove Markdown and formatting artifacts while preserving lesson text."""

    script = html.unescape(value)

    # Remove HTML comments and fenced code block markers.
    script = re.sub(r"<!--.*?-->", " ", script, flags=re.DOTALL)
    script = re.sub(r"```[^\n]*", " ", script)

    # Preserve image alt text and link labels, not their URLs.
    script = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", script)
    script = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", script)
    script = re.sub(r"<https?://[^>]+>", " ", script)

    # Remove HTML tags and inline code markers.
    script = re.sub(r"<[^>]+>", " ", script)
    script = re.sub(r"`([^`]*)`", r"\1", script)

    # Remove headings, blockquotes, list markers and horizontal rules.
    script = re.sub(r"(?m)^\s{0,3}#{1,6}\s*", "", script)
    script = re.sub(r"(?m)^\s*>\s?", "", script)
    script = re.sub(r"(?m)^\s*[-+*]\s+", "", script)
    script = re.sub(r"(?m)^\s*\d+[.)]\s+", "", script)
    script = re.sub(r"(?m)^\s*(?:[-*_]\s*){3,}$", " ", script)

    # Remove emphasis and strikethrough markers.
    script = re.sub(r"(\*\*|__|\*|_|~~)(?=\S)|(?<=\S)(\*\*|__|\*|_|~~)", "", script)

    # Restore escaped Markdown punctuation.
    script = re.sub(r"\\([\\`*_{}\[\]()#+.!|>-])", r"\1", script)

    # Remove common emoji characters without removing normal punctuation.
    script = re.sub(
        "["
        "\U0001F000-\U0001FAFF"
        "\U00002600-\U000027BF"
        "\U0000FE0F"
        "\U0000200D"
        "]",
        "",
        script,
    )

    # Normalize whitespace for narration and subtitle generation.
    return " ".join(script.split())


def validate_lesson_script(value: object) -> str:
    """Sanitize and validate generated lesson narration before it is saved."""
    if not isinstance(value, str):
        raise ValueError("Generated lesson must be text.")

    script = sanitize_lesson_script(value)

    if not script:
        raise ValueError("Generated lesson is empty.")
    if len(script) > 10000:
        raise ValueError("Generated lesson exceeds the maximum length.")

    return script
