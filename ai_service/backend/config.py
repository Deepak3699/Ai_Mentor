import os
from dotenv import load_dotenv

load_dotenv()

# Required: Primary AI provider
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Optional: Fallback AI provider
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Optional: Cloudinary storage
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

GROQ_ENABLED = bool(GROQ_API_KEY)

CLOUDINARY_ENABLED = all([
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
])

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is required for the AI service.")

print(f"Gemini: enabled")
print(f"Groq fallback: {'enabled' if GROQ_ENABLED else 'disabled'}")
print(f"Cloudinary: {'enabled' if CLOUDINARY_ENABLED else 'disabled'}")
