import os

from dotenv import load_dotenv
if not os.getenv("PYTEST_CURRENT_TEST"):
    load_dotenv(override=False)

# Required: Primary AI provider
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# LLM call timeout in seconds
DEFAULT_LLM_TIMEOUT_SECONDS = 60
MIN_LLM_TIMEOUT_SECONDS = 1
MAX_LLM_TIMEOUT_SECONDS = 300

_UNSET = object()


def validate_llm_timeout(value: object) -> int:
    """Validate that the timeout is an integer within the allowed bounds."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(
            f"LLM_TIMEOUT_SECONDS must be an integer between {MIN_LLM_TIMEOUT_SECONDS} and {MAX_LLM_TIMEOUT_SECONDS}."
        )
    if value < MIN_LLM_TIMEOUT_SECONDS or value > MAX_LLM_TIMEOUT_SECONDS:
        raise ValueError(
            f"LLM_TIMEOUT_SECONDS must be between {MIN_LLM_TIMEOUT_SECONDS} and {MAX_LLM_TIMEOUT_SECONDS} seconds."
        )
    return value


def parse_llm_timeout(raw_value: object = _UNSET) -> int:
    """Parse and validate LLM_TIMEOUT_SECONDS from an environment string or value.

    Omitted or blank values fall back to DEFAULT_LLM_TIMEOUT_SECONDS.
    Non-numeric, zero, negative, or excessive values raise ValueError without echoing input values.
    """
    if raw_value is _UNSET:
        raw_value = os.getenv("LLM_TIMEOUT_SECONDS")

    if raw_value is None:
        return DEFAULT_LLM_TIMEOUT_SECONDS

    if isinstance(raw_value, str):
        trimmed = raw_value.strip()
        if not trimmed:
            return DEFAULT_LLM_TIMEOUT_SECONDS
        try:
            val = int(trimmed)
        except (ValueError, TypeError):
            raise ValueError(
                f"LLM_TIMEOUT_SECONDS must be an integer between {MIN_LLM_TIMEOUT_SECONDS} and {MAX_LLM_TIMEOUT_SECONDS}."
            )
    elif isinstance(raw_value, bool) or isinstance(raw_value, float):
        raise ValueError(
            f"LLM_TIMEOUT_SECONDS must be an integer between {MIN_LLM_TIMEOUT_SECONDS} and {MAX_LLM_TIMEOUT_SECONDS}."
        )
    elif isinstance(raw_value, int):
        val = raw_value
    else:
        try:
            val = int(raw_value)
        except (ValueError, TypeError):
            raise ValueError(
                f"LLM_TIMEOUT_SECONDS must be an integer between {MIN_LLM_TIMEOUT_SECONDS} and {MAX_LLM_TIMEOUT_SECONDS}."
            )

    return validate_llm_timeout(val)


LLM_TIMEOUT_SECONDS = parse_llm_timeout()

# Optional: Fallback AI provider
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Optional: Cloudinary storage
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# D-ID AI Avatar
DID_API_KEY = os.getenv("DID_API_KEY")
DID_API_URL = os.getenv("DID_API_URL", "https://api.d-id.com")
DID_SOURCE_URL = os.getenv("DID_SOURCE_URL")

GROQ_ENABLED = bool(GROQ_API_KEY)

CLOUDINARY_ENABLED = all([
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
])


def validate_config():
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is required for the AI service.")
    if isinstance(LLM_TIMEOUT_SECONDS, str):
        parse_llm_timeout(LLM_TIMEOUT_SECONDS)
    else:
        validate_llm_timeout(LLM_TIMEOUT_SECONDS)


