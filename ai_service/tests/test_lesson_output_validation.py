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
import llm_service


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


class FakeProvider:
    """Minimal stand-in for the Gemini/Groq clients used by llm_service."""

    def __init__(self, text=None, error=None):
        self._text = text
        self._error = error
        self.calls = 0

    def _respond(self):
        self.calls += 1
        if self._error is not None:
            raise self._error
        if self._is_gemini:
            return SimpleNamespace(text=self._text)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self._text))]
        )

    _is_gemini = False


class FakeGemini(FakeProvider):
    _is_gemini = True

    def __init__(self, text=None, error=None):
        super().__init__(text=text, error=error)
        self.models = SimpleNamespace(generate_content=self._generate_content)

    def _generate_content(self, **_kwargs):
        return self._respond()


class FakeGroq(FakeProvider):
    def __init__(self, text=None, error=None):
        super().__init__(text=text, error=error)
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create)
        )

    def _create(self, **_kwargs):
        return self._respond()


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
    gemini = FakeGemini(text="  Gemini" + "\n" + " lesson  ")
    groq = FakeGroq(error=AssertionError("Groq must not be called"))

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        result = api.generate_lesson_script(request_data())

    assert result == ("Gemini lesson", "gemini", llm_service.GEMINI_MODEL)
    assert gemini.calls == 1
    assert groq.calls == 0


def test_invalid_gemini_output_falls_back_to_groq_once():
    gemini = FakeGemini(text="   ")
    groq = FakeGroq(text=" Groq" + "\n" + " lesson ")

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        result = api.generate_lesson_script(request_data())

    assert result == ("Groq lesson", "groq", llm_service.GROQ_MODEL)
    assert gemini.calls == 1
    assert groq.calls == 1


@pytest.mark.parametrize(
    "groq_error",
    [
        RuntimeError("malformed response"),
        ValueError("missing choices"),
    ],
)
def test_malformed_groq_response_fails_safely(groq_error):
    gemini = FakeGemini(text="")
    groq = FakeGroq(error=groq_error)

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        with pytest.raises(api.ProviderGenerationError):
            api.generate_lesson_script(request_data())

    assert gemini.calls == 1
    assert groq.calls == 1


def test_groq_empty_content_fails_safely():
    gemini = FakeGemini(text="")
    groq = FakeGroq(text="   ")

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        with pytest.raises(api.ProviderGenerationError):
            api.generate_lesson_script(request_data())

    assert gemini.calls == 1
    assert groq.calls == 1


def test_both_providers_failing_are_attempted_only_once():
    gemini = FakeGemini(text="")
    groq = FakeGroq(error=RuntimeError("private provider detail"))

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        with pytest.raises(api.ProviderGenerationError):
            api.generate_lesson_script(request_data())

    assert gemini.calls == 1
    assert groq.calls == 1


def test_provider_error_text_is_not_leaked():
    gemini = FakeGemini(text="")
    groq = FakeGroq(error=RuntimeError("PRIVATE_PROVIDER_DETAIL"))

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        with pytest.raises(api.ProviderGenerationError) as excinfo:
            api.generate_lesson_script(request_data())

    assert "PRIVATE_PROVIDER_DETAIL" not in str(excinfo.value)


@pytest.mark.asyncio
async def test_invalid_outputs_fail_job_without_creating_output_files(
    tmp_path, capsys, monkeypatch
):
    monkeypatch.setattr(api, "BASE_DIR", str(tmp_path))
    private_text = "PRIVATE_GENERATED_CONTENT_" * 500

    gemini = FakeGemini(text=private_text)
    groq = FakeGroq(text=private_text)

    with patch.object(api, "gemini_client", gemini), patch.object(
        api, "groq_client", groq
    ):
        await api.process_lesson(request_data(), "invalid-output-test")

    status = api.job_status["invalid-output-test"]
    assert status["status"] == "failed"
    assert status.get("failure_code") == "provider_failed"
    assert not (tmp_path / "outputs").exists()
    assert status["status"] != "ready"
    assert private_text not in capsys.readouterr().out
