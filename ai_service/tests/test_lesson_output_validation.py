import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api


@pytest.fixture(autouse=True)
def clear_job_state():
    api.job_status.clear()
    api.generation_cache.clear()
    api.shutdown_failed_jobs.clear()
    api.shutting_down = False
    yield
    api.job_status.clear()
    api.generation_cache.clear()
    api.shutdown_failed_jobs.clear()
    api.shutting_down = False


def request_data():
    return api.LessonRequest(course="Python", topic="Loops", celebrity="Teacher")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
            ("  A lesson" + "\n" + " with   spacing  ", "A lesson with spacing"),
        ("A valid narration.", "A valid narration."),
    ],
)
def test_valid_lesson_output_is_normalized(value, expected):
    assert api.validate_lesson_script(value) == expected


@pytest.mark.parametrize("value", [None, 123, "", "   ", " " + "\n" + "  "])
def test_invalid_lesson_output_is_rejected(value):
    with pytest.raises(ValueError):
        api.validate_lesson_script(value)


def test_overlong_lesson_output_is_rejected():
    with pytest.raises(ValueError, match="maximum length"):
        api.validate_lesson_script("x" * 10001)


def test_valid_gemini_output_returns_normalized_script():
    with patch.object(
        api, "_generate_gemini_content",
            return_value=SimpleNamespace(text="  Gemini" + "\n" + " lesson  "),
    ) as gemini, patch.object(api, "_generate_groq_content") as groq:
        result = api.generate_lesson_script(request_data())

    assert result == ("Gemini lesson", "gemini", api.GEMINI_MODEL)
    gemini.assert_called_once()
    groq.assert_not_called()


def test_invalid_gemini_output_falls_back_to_groq_once():
    groq_response = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=" Groq" + "\n" + " lesson "))]
    )
    with patch.object(
        api, "_generate_gemini_content",
        return_value=SimpleNamespace(text="   "),
    ) as gemini, patch.object(
        api, "_generate_groq_content", return_value=groq_response
    ) as groq:
        result = api.generate_lesson_script(request_data())

    assert result == ("Groq lesson", "groq", "llama-3.3-70b-versatile")
    gemini.assert_called_once()
    groq.assert_called_once()


@pytest.mark.parametrize(
    "groq_response",
    [
        None,
        SimpleNamespace(),
        SimpleNamespace(choices=[]),
        SimpleNamespace(choices=[SimpleNamespace()]),
        SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=None))]),
        SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="  "))]),
    ],
)
def test_malformed_groq_response_fails_safely(groq_response):
    with patch.object(
        api, "_generate_gemini_content",
        return_value=SimpleNamespace(text=""),
    ), patch.object(
        api, "_generate_groq_content", return_value=groq_response
    ) as groq:
        with pytest.raises(api.ProviderGenerationError):
            api.generate_lesson_script(request_data())

    groq.assert_called_once()


def test_both_providers_failing_are_attempted_only_once():
    with patch.object(
        api, "_generate_gemini_content",
        return_value=SimpleNamespace(text=""),
    ) as gemini, patch.object(
        api, "_generate_groq_content",
        side_effect=RuntimeError("private provider detail"),
    ) as groq:
        with pytest.raises(api.ProviderGenerationError):
            api.generate_lesson_script(request_data())

    gemini.assert_called_once()
    groq.assert_called_once()


@pytest.mark.asyncio
async def test_invalid_outputs_fail_job_without_creating_output_files(
    tmp_path, capsys, monkeypatch
):
    monkeypatch.setattr(api, "BASE_DIR", str(tmp_path))
    private_text = "PRIVATE_GENERATED_CONTENT_" * 500

    with patch.object(
        api, "_generate_gemini_content",
        return_value=SimpleNamespace(text=private_text),
    ), patch.object(
        api, "_generate_groq_content",
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(
                message=SimpleNamespace(content=private_text)
            )]
        ),
    ):
        await api.process_lesson(request_data(), "invalid-output-test")

    status = api.job_status["invalid-output-test"]
    assert status["status"] == "failed"
    assert status.get("failure_code") == "provider_failed"
    assert not (tmp_path / "outputs").exists()
    assert status["status"] != "ready"
    assert private_text not in capsys.readouterr().out
