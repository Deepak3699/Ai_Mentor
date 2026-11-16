from __future__ import annotations

import cloudinary
import cloudinary.uploader

from backend.config import (
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_ENABLED,
)
from backend.utils.logging_utils import log_event, short_error


def configure_cloudinary() -> None:
    """Initialize Cloudinary configuration if enabled in environment."""
    if CLOUDINARY_ENABLED:
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD_NAME,
            api_key=CLOUDINARY_API_KEY,
            api_secret=CLOUDINARY_API_SECRET,
            secure=True,
        )


# Configure upon module load
configure_cloudinary()


def upload_video(
    video_path: str,
    public_id: str,
    folder: str = "ai_mentor/videos",
) -> str | None:
    """Upload final lesson video to Cloudinary."""
    try:
        log_event("RUN", "Uploading lesson video")
        upload_result = cloudinary.uploader.upload(
            video_path,
            resource_type="video",
            folder=folder,
            public_id=public_id,
            overwrite=True,
            chunk_size=6000000,
        )
        url = upload_result.get("secure_url")
        log_event("OK", "Lesson video uploaded")
        return url
    except Exception as error:
        log_event("WARN", "Video upload failed; using local proxy", error=short_error(error))
        return None


def upload_subtitle(
    file_path: str,
    public_id: str,
    folder: str = "ai_mentor/subtitles",
) -> str | None:
    """Upload subtitle file (.vtt or .srt) to Cloudinary."""
    try:
        upload_result = cloudinary.uploader.upload(
            file_path,
            resource_type="raw",
            folder=folder,
            public_id=public_id,
            overwrite=True,
        )
        return upload_result.get("secure_url")
    except Exception as error:
        log_event("WARN", "Subtitle upload failed; using local files", error=short_error(error))
        return None


def upload_subtitles(
    vtt_path: str | None,
    srt_path: str | None,
    base_filename: str,
) -> tuple[str | None, str | None]:
    """Upload both VTT and SRT subtitle files if available."""
    vtt_url, srt_url = None, None
    if vtt_path and srt_path:
        try:
            vtt_url = cloudinary.uploader.upload(
                vtt_path,
                resource_type="raw",
                folder="ai_mentor/subtitles",
                public_id=f"{base_filename}.vtt",
                overwrite=True,
            ).get("secure_url")
            srt_url = cloudinary.uploader.upload(
                srt_path,
                resource_type="raw",
                folder="ai_mentor/subtitles",
                public_id=f"{base_filename}.srt",
                overwrite=True,
            ).get("secure_url")
            log_event("OK", "Subtitle files uploaded")
        except Exception as sub_up_err:
            log_event("WARN", "Subtitle upload failed; using local files", error=short_error(sub_up_err))

    return vtt_url, srt_url
