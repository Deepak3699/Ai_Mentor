import hmac

from fastapi import Header, HTTPException, status

from backend.config import AI_SERVICE_KEY


def verify_service_key(
    x_service_key: str | None = Header(default=None),
):
    if not AI_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service authentication is not configured.",
        )

    if not x_service_key or not hmac.compare_digest(
        x_service_key,
        AI_SERVICE_KEY,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service authentication.",
        )