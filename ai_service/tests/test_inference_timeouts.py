import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from groq import APITimeoutError
import httpx

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api
from config import LLM_TIMEOUT_SECONDS


def _quiz_json():
    return json.dumps(
        {
            "questions": [
                {
                    "question": f"Question {index}",
                    "options": ["A", "B", "C", "D"],
                    "correct_index": 0,
                    "explanation": "A is correct.",
                }
                for index in range(4)
            ]
        }
    )


def _post_generate_quiz(client):
    return client.post(
        "/generate-quiz",
        json={"lesson": "Loops repeat a block of instructions."},
    )


def test_generate_quiz_gemini_timeout_falls_back_to_groq():
    groq_response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=_quiz_json()))]
    )

    with patch.object(
        api.gemini_client.models,
        "generate_content",
        side_effect=TimeoutError("Gemini timed out"),
    ) as gemini, patch.object(
        api.groq_client.chat.completions,
        "create",
        return_value=groq_response,
    ) as groq, patch("backend.main.check_ffmpeg", return_value=None):
        with TestClient(api.app) as client:
            response = _post_generate_quiz(client)

    assert response.status_code == 200
    assert response.json() == json.loads(_quiz_json())
    gemini.assert_called_once()
    assert gemini.call_args.kwargs["config"].http_options.timeout == LLM_TIMEOUT_SECONDS * 1000
    groq.assert_called_once()
    assert groq.call_args.kwargs["timeout"] == LLM_TIMEOUT_SECONDS


def test_generate_quiz_both_provider_timeouts_return_empty_quiz():
    groq_timeout = APITimeoutError(request=httpx.Request("POST", "https://api.groq.com"))

    with patch.object(
        api.gemini_client.models,
        "generate_content",
        side_effect=TimeoutError("Gemini timed out"),
    ) as gemini, patch.object(
        api.groq_client.chat.completions,
        "create",
        side_effect=groq_timeout,
    ) as groq, patch("backend.main.check_ffmpeg", return_value=None):
        with TestClient(api.app) as client:
            response = _post_generate_quiz(client)

    assert response.status_code == 200
    assert response.json() == {"questions": []}
    gemini.assert_called_once()
    groq.assert_called_once()
    assert gemini.call_args.kwargs["config"].http_options.timeout == LLM_TIMEOUT_SECONDS * 1000
    assert groq.call_args.kwargs["timeout"] == LLM_TIMEOUT_SECONDS


def test_generate_quiz_successful_gemini_response_contract_is_unchanged():
    with patch.object(
        api.gemini_client.models,
        "generate_content",
        return_value=SimpleNamespace(text=_quiz_json()),
    ) as gemini, patch.object(
        api.groq_client.chat.completions,
        "create",
    ) as groq, patch("backend.main.check_ffmpeg", return_value=None):
        with TestClient(api.app) as client:
            response = _post_generate_quiz(client)

    assert response.status_code == 200
    assert response.json() == json.loads(_quiz_json())
    gemini.assert_called_once()
    groq.assert_not_called()
