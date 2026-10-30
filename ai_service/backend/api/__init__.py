from __future__ import annotations

import asyncio
import os
from typing import TYPE_CHECKING, Any

import cloudinary
import cloudinary.uploader
import requests
from mutagen.mp3 import MP3

from backend.api.v1.endpoints.lessons import generate_lesson
from backend.api.v1.endpoints.voices import get_voices
from backend.avatar_service import create_avatar_video
from backend.schemas.lessons import (
    ExplainCodeRequest,
    Flashcard,
    FlashcardRequest,
    LessonPreferences,
    LessonRequest,
    QuizQuestion,
    QuizRequest,
    QuizResponse,
    SyllabusRequest,
)
from backend.services.job_tracker import (
    active_jobs,
    compute_base_filename,
    compute_cache_key,
    generation_cache,
    get_job_status,
    get_transcript_content,
    init_job_processing,
    job_status,
    mark_job_failed,
    mark_job_ready,
    queue_job,
    remove_failed_generation_cache,
    shutdown_failed_jobs,
)
from backend.services.lesson_pipeline import process_lesson, run_tracked_lesson
from backend.services.media_processor import (
    VIDEO_HEIGHT,
    VIDEO_WIDTH,
    build_avatar_normalization_args,
    build_fallback_ffmpeg_args,
    build_landscape_video_filter,
    check_ffmpeg,
    generate_tts,
    get_celebrity_video,
    probe_video_metadata,
    run_ffmpeg_command,
)
from backend.services.providers import manager as provider_manager
from backend.services.providers.gemini_provider import gemini_client
from backend.services.providers.groq_provider import groq_client
from backend.utils.subtitles import write_subtitles

generate_flashcards = provider_manager.generate_flashcards
generate_lesson_script = provider_manager.generate_lesson_script
generate_quiz = provider_manager.generate_quiz
generate_syllabus = provider_manager.generate_syllabus

if TYPE_CHECKING:
    from backend.main import app as app


def __getattr__(name: str) -> Any:
    if name == "app":
        from backend.main import app

        return app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "ExplainCodeRequest",
    "Flashcard",
    "FlashcardRequest",
    "LessonPreferences",
    "LessonRequest",
    "MP3",
    "QuizQuestion",
    "QuizRequest",
    "QuizResponse",
    "SyllabusRequest",
    "active_jobs",
    "asyncio",
    "app",
    "build_avatar_normalization_args",
    "build_fallback_ffmpeg_args",
    "build_landscape_video_filter",
    "check_ffmpeg",
    "cloudinary",
    "compute_base_filename",
    "compute_cache_key",
    "create_avatar_video",
    "generate_flashcards",
    "generate_lesson",
    "generate_lesson_script",
    "generate_quiz",
    "generate_syllabus",
    "generate_tts",
    "generation_cache",
    "gemini_client",
    "get_job_status",
    "get_voices",
    "get_celebrity_video",
    "get_transcript_content",
    "groq_client",
    "init_job_processing",
    "job_status",
    "mark_job_failed",
    "mark_job_ready",
    "os",
    "process_lesson",
    "probe_video_metadata",
    "queue_job",
    "remove_failed_generation_cache",
    "requests",
    "run_ffmpeg_command",
    "run_tracked_lesson",
    "shutdown_failed_jobs",
    "VIDEO_HEIGHT",
    "VIDEO_WIDTH",
    "write_subtitles",
]
