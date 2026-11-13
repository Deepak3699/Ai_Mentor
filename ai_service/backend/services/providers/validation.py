from __future__ import annotations


class ProviderGenerationError(RuntimeError):
    """Raised when neither lesson-script provider returns usable narration."""


def validate_lesson_script(value: object) -> str:
    """Normalize and validate generated lesson narration before it is saved."""
    if not isinstance(value, str):
        raise ValueError("Generated lesson must be text.")

    script = " ".join(value.split())
    if not script:
        raise ValueError("Generated lesson is empty.")
    if len(script) > 10000:
        raise ValueError("Generated lesson exceeds the maximum length.")

    return script
