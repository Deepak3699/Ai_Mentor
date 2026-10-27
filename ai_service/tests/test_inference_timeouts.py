import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
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


def _valid_response():
    return SimpleNamespace(
        text=(
            '{"summary":"A loop","explanation":[],"issues":[], '
            '"suggested_code":"","time_complexity":"O(n)",'
            '"space_complexity":"O(1)"}'
        )
    )


def _request():
    return api.ExplainCodeRequest(
        code="for item in items: pass",
        language="python",
        mode="explain",
    )


def _post_explain_code(client):
    return client.post(
        "/explain-code",
        json={"code": "for item in items: pass", "language": "python", "mode": "explain"},
    )


def test_explain_code_success_configures_provider_timeouts():
    with patch.object(
        api.gemini_client.models,
        "generate_content",
        return_value=_valid_response(),
    ) as gemini:
        result = api.explain_code(_request())

    assert result["summary"] == "A loop"
    options = gemini.call_args.kwargs["config"].http_options
    assert options.timeout == LLM_TIMEOUT_SECONDS * 1000


def test_explain_code_slow_inference_completes_within_provider_timeout():
    def slow_success(**_kwargs):
        time.sleep(0.02)
        return _valid_response()

    with patch.object(api.gemini_client.models, "generate_content", side_effect=slow_success):
        result = api.explain_code(_request())

    assert result["summary"] == "A loop"


def test_explain_code_groq_fallback_returns_successful_analysis():
    expected_analysis = {
        "summary": "Groq fallback analysis",
        "explanation": [{"line": 1, "code": "print('hi')", "explanation": "Prints a greeting."}],
        "issues": [],
        "suggested_code": "",
        "time_complexity": "O(1)",
        "space_complexity": "O(1)",
    }
    groq_response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content=(
                        '{"summary":"Groq fallback analysis",'
                        '"explanation":[{"line":1,"code":"print(\'hi\')",'
                        '"explanation":"Prints a greeting."}],"issues":[],'
                        '"suggested_code":"","time_complexity":"O(1)",'
                        '"space_complexity":"O(1)"}'
                    )
                )
            )
        ]
    )

    with patch.object(
        api.gemini_client.models,
        "generate_content",
        side_effect=httpx.ReadTimeout("Gemini read timed out"),
    ), patch.object(
        api.groq_client.chat.completions,
        "create",
        return_value=groq_response,
    ) as groq:
        with patch.object(api, "check_ffmpeg", return_value=None):
            with TestClient(api.app) as client:
                response = _post_explain_code(client)

    assert response.status_code == 200
    assert response.json() == expected_analysis
    groq.assert_called_once()
    assert groq.call_args.kwargs["timeout"] == LLM_TIMEOUT_SECONDS


def test_explain_code_provider_timeouts_return_controlled_504():
    groq_timeout = APITimeoutError(request=httpx.Request("POST", "https://api.groq.com"))

    with patch.object(
        api.gemini_client.models,
        "generate_content",
        side_effect=TimeoutError("provider timeout"),
    ), patch.object(
        api.groq_client.chat.completions,
        "create",
        side_effect=groq_timeout,
    ) as groq:
        with patch.object(api, "check_ffmpeg", return_value=None):
            with TestClient(api.app) as client:
                response = _post_explain_code(client)

    assert response.status_code == 504
    assert response.json() == {
        "detail": "AI inference timed out. Please retry the request."
    }
    assert groq.call_args.kwargs["timeout"] == LLM_TIMEOUT_SECONDS


def test_explain_code_non_timeout_provider_failures_remain_502():
    with patch.object(
        api.gemini_client.models,
        "generate_content",
        side_effect=RuntimeError("provider failure"),
    ), patch.object(
        api.groq_client.chat.completions,
        "create",
        side_effect=RuntimeError("provider failure"),
    ):
        with patch.object(api, "check_ffmpeg", return_value=None):
            with TestClient(api.app) as client:
                response = _post_explain_code(client)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Both AI providers failed to analyze the code."
    }
