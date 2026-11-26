import math
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

# Internal authentication for backend requests
AI_SERVICE_KEY = os.getenv("AI_SERVICE_KEY")

# LLM call timeout in seconds
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "60") or "60")
# Grace period for active jobs during service shutdown
try:
    JOB_SHUTDOWN_GRACE_PERIOD_SECONDS = float(
        os.getenv("JOB_SHUTDOWN_GRACE_PERIOD_SECONDS", "30")
    )
except ValueError as exc:
    raise ValueError(
        "JOB_SHUTDOWN_GRACE_PERIOD_SECONDS must be a valid non-negative number."
    ) from exc

if (
    not math.isfinite(JOB_SHUTDOWN_GRACE_PERIOD_SECONDS)
    or JOB_SHUTDOWN_GRACE_PERIOD_SECONDS < 0
):
    raise ValueError(
        "JOB_SHUTDOWN_GRACE_PERIOD_SECONDS must be a valid non-negative number."
    )

# Maximum concurrent lesson-generation jobs
MAX_ACTIVE_LESSON_JOBS = int(os.getenv("MAX_ACTIVE_LESSON_JOBS", "2") or "2")

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

# Optional: RAG settings
# Feature flag to enable or disable RAG functionality
RAG_ENABLED = os.getenv("RAG_ENABLED", "false").strip().lower() in ("true", "1", "yes")

# Embedding model and vector dimensions
RAG_EMBEDDING_MODEL = os.getenv("RAG_EMBEDDING_MODEL") or "text-embedding-004"
RAG_EMBEDDING_DIMENSIONS = int(os.getenv("RAG_EMBEDDING_DIMENSIONS", "768") or "768")
RAG_EMBEDDING_BATCH_SIZE = int(os.getenv("RAG_EMBEDDING_BATCH_SIZE", "32") or "32")

# Retrieval search parameters
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4") or "4")
RAG_MAX_TOP_K = int(os.getenv("RAG_MAX_TOP_K", "10") or "10")
RAG_SIMILARITY_THRESHOLD = float(os.getenv("RAG_SIMILARITY_THRESHOLD", "0.7") or "0.7")

# Document chunking and upload limits
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1000") or "1000")
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "200") or "200")
RAG_MAX_CONTEXT_SIZE = int(os.getenv("RAG_MAX_CONTEXT_SIZE", "4000") or "4000")
RAG_MAX_UPLOAD_BYTES = int(os.getenv("RAG_MAX_UPLOAD_BYTES", "10485760") or "10485760")  # 10 MB default


def validate_config():
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is required for the AI service.")

    if MAX_ACTIVE_LESSON_JOBS < 1:
        raise ValueError("MAX_ACTIVE_LESSON_JOBS must be at least 1.")

    # Only validate RAG settings when RAG is enabled
    if RAG_ENABLED:
        # Embedding dimensions must be positive and within pgvector HNSW limit (max 2000)
        if RAG_EMBEDDING_DIMENSIONS <= 0:
            raise ValueError("RAG_EMBEDDING_DIMENSIONS must be greater than 0")
        if RAG_EMBEDDING_DIMENSIONS > 2000:
            raise ValueError("RAG_EMBEDDING_DIMENSIONS exceeds pgvector limit of 2000 for HNSW index")
        if RAG_EMBEDDING_BATCH_SIZE <= 0:
            raise ValueError("RAG_EMBEDDING_BATCH_SIZE must be greater than 0")

        # Retrieval limits: top_k cannot exceed max_top_k
        if RAG_TOP_K <= 0:
            raise ValueError("RAG_TOP_K must be greater than 0")
        if RAG_MAX_TOP_K <= 0:
            raise ValueError("RAG_MAX_TOP_K must be greater than 0")
        if RAG_TOP_K > RAG_MAX_TOP_K:
            raise ValueError("RAG_TOP_K cannot exceed RAG_MAX_TOP_K")

        # Chunking rules: overlap must be non-negative and smaller than chunk size
        if RAG_CHUNK_SIZE <= 0:
            raise ValueError("RAG_CHUNK_SIZE must be greater than 0")
        if RAG_CHUNK_OVERLAP < 0:
            raise ValueError("RAG_CHUNK_OVERLAP must be non-negative")
        if RAG_CHUNK_OVERLAP >= RAG_CHUNK_SIZE:
            raise ValueError("RAG_CHUNK_OVERLAP must be less than RAG_CHUNK_SIZE")

        # Similarity threshold must be between 0.0 and 1.0
        if not (0.0 <= RAG_SIMILARITY_THRESHOLD <= 1.0):
            raise ValueError("RAG_SIMILARITY_THRESHOLD must be between 0.0 and 1.0")

        # Context and upload size bounds
        if RAG_MAX_CONTEXT_SIZE <= 0:
            raise ValueError("RAG_MAX_CONTEXT_SIZE must be greater than 0")
        if RAG_MAX_UPLOAD_BYTES <= 0:
            raise ValueError("RAG_MAX_UPLOAD_BYTES must be greater than 0")
