import os
import asyncio
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

import pytest

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

backend_dir = Path(__file__).resolve().parents[1] / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import api
from api import validate_lesson_script, LessonRequest, process_lesson, job_status


def test_valid_script_is_normalized():
    assert validate_lesson_script("  Learn   Python \n today.  ") == (
        "Learn Python today."
    )


@pytest.mark.parametrize("value", ["", "   ", None, 123, [], {}])
def test_rejects_empty_or_non_text_output(value):
    with pytest.raises(ValueError):
        validate_lesson_script(value)


def test_rejects_excessively_long_output():
    with pytest.raises(ValueError):
        validate_lesson_script("a" * 10001)


def test_accepts_existing_short_script_format():
    script = "Test script for FFmpeg execution."
    assert validate_lesson_script(script) == script



def test_invalid_output_from_both_providers_fails_without_saving(tmp_path):
    request = LessonRequest(
        course="Python",
        topic="Variables",
        celebrity="Modi",
    )
    job_id = "invalid_lesson_validation_test"

    gemini_response = MagicMock()
    gemini_response.text = "   "

    groq_response = MagicMock()
    groq_response.choices[0].message.content = ""

    with (
        patch.object(
            api.gemini_client.models,
            "generate_content",
            return_value=gemini_response,
        ),
        patch.object(
            api.groq_client.chat.completions,
            "create",
            return_value=groq_response,
        ) as groq_create,
        patch("builtins.open") as mock_open,
    ):
        asyncio.run(process_lesson(request, job_id))

    groq_create.assert_called_once()
    mock_open.assert_not_called()
    assert job_status[job_id]["status"] == "failed"
