import os

from dotenv import load_dotenv
if not os.getenv("PYTEST_CURRENT_TEST"):
    load_dotenv(override=False)



def get_model_config(name: str, default: str) -> str:
    """Return a configured model name or its documented default."""
    return os.getenv(name, "").strip() or default



# Required: Primary AI provider
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = get_model_config("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_EXPLAIN_MODEL = get_model_config(
    "GEMINI_EXPLAIN_MODEL", "gemini-3.8-flash"
)

# LLM call timeout in seconds
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "60") or "60")

# Optional: Fallback AI provider
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = get_model_config("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_EXPLAIN_MODEL = get_model_config(
    "GROQ_EXPLAIN_MODEL", "openai/gpt-oss-120b"
)

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


