from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class JobStatusResponse(BaseModel):
    status: str
    filename: str | None = None
    text_file: str | None = None
    audio_file: str | None = None
    jobId: str | None = None
    cached: bool | None = None
    error: str | None = None
    reason: str | None = None
    cloudinary_url: str | None = None
    local_video_url: str | None = None
    subtitle_url: str | None = None
    subtitle_vtt_url: str | None = None
    subtitle_srt_url: str | None = None
    meta: dict[str, Any] | None = None


class GenerateLessonResponse(BaseModel):
    status: str
    filename: str
    text_file: str
    audio_file: str
    jobId: str
    cached: bool


class TranscriptResponse(BaseModel):
    content: str | None = None
    error: str | None = None


class JobTimestamps(BaseModel):
    queued_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    failed_at: str | None = None


class JobMetadata(BaseModel):
    timestamps: JobTimestamps = Field(default_factory=JobTimestamps)
    provider: str | None = None
    model: str | None = None
    duration_ms: int | None = None
    audio_seconds: float | None = None
    word_count: int | None = None
    renderer: str | None = None
    media: dict[str, Any] | None = None
