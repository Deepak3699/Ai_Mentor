import os
from dotenv import load_dotenv

# Load .env
load_dotenv()

# ================================
# Gemini API Key
# ================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

def validate_config():
    if not GEMINI_API_KEY:
        raise ValueError("❌ GEMINI_API_KEY not found in .env")

    if not GROQ_API_KEY:
        raise ValueError("❌ GROQ_API_KEY not found in .env")

    if not all([
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET
    ]):
        raise ValueError("❌ Cloudinary credentials missing.")
# D-ID AI Avatar
DID_API_KEY = os.getenv("DID_API_KEY")
DID_API_URL = os.getenv("DID_API_URL", "https://api.d-id.com")
DID_SOURCE_URL = os.getenv("DID_SOURCE_URL")
