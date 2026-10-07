import os

from dotenv import load_dotenv

load_dotenv()

# Required: Primary AI provider
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

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


