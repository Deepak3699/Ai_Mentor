import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from backend.schemas.jobs import (
    GenerateLessonResponse,
    JobStatusResponse,
    TranscriptResponse,
)
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
from backend.schemas.provider import (
    CodeExplanationResponse,
    ProviderScriptResult,
    SyllabusResponse,
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
from backend.services.media_processor import (
    ALLOWED_CELEBRITIES,
    VIDEO_HEIGHT,
    VIDEO_WIDTH,
    build_avatar_normalization_args,
    build_fallback_ffmpeg_args,
    build_landscape_video_filter,
    get_celebrity_video,
)
from backend.services.providers.base import (
    UNTRUSTED_INPUT_INSTRUCTION,
    serialize_user_data,
)
from backend.services.providers.gemini_provider import GeminiProvider
from backend.services.providers.groq_provider import GroqProvider
from backend.services.providers.manager import (
    explain_code,
    generate_flashcards,
    generate_lesson_script,
    generate_quiz,
    generate_syllabus,
)
from backend.utils.cloud_storage import (
    configure_cloudinary,
    upload_subtitle,
    upload_subtitles,
    upload_video,
)
from backend.utils.logging_utils import log_event, short_error
from backend.utils.subtitles import build_cues, chunk_script, get_audio_duration, write_subtitles
from backend.main import app as main_app


@pytest.fixture(autouse=True)
def clean_job_cache():
    job_status.clear()
    generation_cache.clear()
    active_jobs.clear()
    shutdown_failed_jobs.clear()
    yield
    job_status.clear()
    generation_cache.clear()
    active_jobs.clear()
    shutdown_failed_jobs.clear()


# -------------------------------------------------------------
# 1. Schemas Validation Tests
# -------------------------------------------------------------

def test_lesson_preferences_forbids_extra_fields():
    with pytest.raises(ValidationError):
        LessonPreferences(explanation_type="concise", illegal_extra_field="malicious")


def test_lesson_request_defaults():
    req = LessonRequest(course="Python", topic="FastAPI")
    assert req.celebrity == "modi"
    assert req.language == "English"
    assert req.speech_rate == "+0%"
    assert req.speech_pitch == "+0Hz"


def test_code_explanation_response_defaults():
    resp = CodeExplanationResponse(summary="Quick overview")
    assert resp.summary == "Quick overview"
    assert resp.explanation == []
    assert resp.issues == []
    assert resp.time_complexity == "not applicable"


# -------------------------------------------------------------
# 2. Job Tracker Tests
# -------------------------------------------------------------

def test_compute_cache_key_deterministic():
    req1 = LessonRequest(course="Math", topic="Calculus", celebrity="modi")
    req2 = LessonRequest(course="Math", topic="Calculus", celebrity="modi")
    req3 = LessonRequest(course="Math", topic="Algebra", celebrity="modi")

    assert compute_cache_key(req1) == compute_cache_key(req2)
    assert compute_cache_key(req1) != compute_cache_key(req3)


def test_compute_base_filename_sanitizes():
    filename = compute_base_filename("Intro: Advanced C++ & Pointers?")
    assert ":" not in filename
    assert "?" not in filename
    assert "&" not in filename
    assert filename.startswith("Intro_Advanced_C__Pointers_")


def test_job_tracker_lifecycle():
    job_id = "lifecycle_job_1"
    cache_key = "dummy_hash"

    queue_job(job_id, cache_key=cache_key)
    assert job_id in active_jobs
    assert job_status[job_id]["status"] == "queued"
    assert generation_cache[cache_key] == job_id

    init_job_processing(job_id)
    assert job_status[job_id]["status"] == "processing"
    assert "started_at" in job_status[job_id]["meta"]["timestamps"]

    mark_job_ready(
        job_id,
        cloudinary_url="https://cloud.com/video.mp4",
        local_video_url="/video-stream/video.mp4",
        subtitle_vtt_url="https://cloud.com/sub.vtt",
        subtitle_srt_url=None,
        meta_info={"provider": "gemini"},
    )
    assert job_status[job_id]["status"] == "ready"
    assert job_status[job_id]["cloudinary_url"] == "https://cloud.com/video.mp4"
    assert job_status[job_id]["meta"]["provider"] == "gemini"


def test_job_tracker_failure_clears_cache():
    job_id = "failed_job_1"
    cache_key = "fail_hash"
    queue_job(job_id, cache_key=cache_key)

    mark_job_failed(job_id, error="Render crashed")
    assert job_status[job_id]["status"] == "failed"
    assert job_status[job_id]["error"] == "Render crashed"
    assert cache_key not in generation_cache


def test_get_job_status_not_found():
    res = get_job_status("nonexistent_id")
    assert res == {"status": "not_found"}


# -------------------------------------------------------------
# 3. Media Processor Tests
# -------------------------------------------------------------

def test_media_processor_constants_and_filters():
    assert ALLOWED_CELEBRITIES == {"modi", "owl", "salman", "srk"}
    assert VIDEO_WIDTH == 1280
    assert VIDEO_HEIGHT == 720

    vf = build_landscape_video_filter()
    assert "1280:720" in vf
    assert "gblur=sigma=28" in vf


def test_build_fallback_ffmpeg_args_structure():
    args = build_fallback_ffmpeg_args("input.mp4", "audio.mp3", "output.mp4")
    assert "ffmpeg" in args
    assert "-filter_complex" in args
    assert "output.mp4" in args


# -------------------------------------------------------------
# 4. Providers & Orchestration Tests
# -------------------------------------------------------------

def test_serialize_user_data_preserves_unicode():
    payload = {"greeting": "नमस्ते", "topic": "AI"}
    serialized = serialize_user_data(payload)
    assert "नमस्ते" in serialized


def test_gemini_provider_instance():
    provider = GeminiProvider()
    assert provider.provider_name == "gemini"


def test_groq_provider_instance():
    provider = GroqProvider()
    assert provider.provider_name == "groq"


def test_manager_generate_lesson_script_fallback():
    req = LessonRequest(course="CS", topic="Sorting")
    mock_groq_choice = MagicMock(message=MagicMock(content="Groq sorting lesson."))
    mock_groq_resp = MagicMock(choices=[mock_groq_choice])

    with patch("backend.services.providers.gemini_provider.generate_gemini_content", side_effect=RuntimeError("Gemini down")), \
         patch("backend.services.providers.groq_provider.generate_groq_content", return_value=mock_groq_resp):
        script, prov, model = generate_lesson_script(req)
        assert script == "Groq sorting lesson."
        assert prov == "groq"


# -------------------------------------------------------------
# 5. Utils Tests
# -------------------------------------------------------------

def test_logging_utils():
    err_str = short_error(ValueError("A very long error message that should be summarized cleanly."))
    assert "summarized cleanly" in err_str


def test_cloud_storage_handles_disabled_without_exception():
    with patch("cloudinary.uploader.upload", side_effect=Exception("Network error")):
        url = upload_video("local.mp4", "test_id")
        assert url is None


# -------------------------------------------------------------
# 6. Main App Endpoints Integration Tests
# -------------------------------------------------------------

def test_main_app_home_endpoint():
    client = TestClient(main_app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "AI Lesson Generator Backend Running"}


def test_main_app_voices_endpoint():
    client = TestClient(main_app)
    response = client.get("/voices")
    assert response.status_code == 200
    assert "voices" in response.json()
    assert len(response.json()["voices"]) > 0


def test_main_app_status_not_found():
    client = TestClient(main_app)
    response = client.get("/status/unknown_job_xyz")
    assert response.status_code == 200
    assert response.json() == {"status": "not_found"}


def test_main_app_generate_lesson_endpoint():
    client = TestClient(main_app)
    payload = {
        "course": "Python",
        "topic": "Decorators",
        "celebrity": "modi",
        "language": "English",
    }
    with patch("backend.services.lesson_pipeline.run_tracked_lesson", new_callable=AsyncMock):
        response = client.post("/generate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Processing"
        assert "jobId" in data
        assert data["cached"] is False
