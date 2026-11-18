import ast
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from backend.api.v1.router import api_v1_router
from backend.services.providers import manager as provider_manager

BACKEND_PATH = Path(__file__).resolve().parents[1] / "backend"
SCHEMA_PATH = BACKEND_PATH / "schemas" / "lessons.py"
ENDPOINTS_PATH = BACKEND_PATH / "api" / "v1" / "endpoints"
GEMINI_PATH = BACKEND_PATH / "services" / "providers" / "gemini_provider.py"
SCHEMA_TREE = ast.parse(SCHEMA_PATH.read_text(encoding="utf-8"))
GEMINI_SOURCE = GEMINI_PATH.read_text(encoding="utf-8")
SOURCE = "\n".join(
    path.read_text(encoding="utf-8")
    for path in [*ENDPOINTS_PATH.glob("*.py"), GEMINI_PATH]
)

EXPLANATION_RESPONSE = {
    "summary": "Returns a greeting.",
    "explanation": [
        {"line": 1, "code": 'print("hello")', "explanation": "Prints a greeting."}
    ],
    "issues": [],
    "suggested_code": "",
    "time_complexity": "O(1)",
    "space_complexity": "O(1)",
}

FLASHCARD_RESPONSE = [
    {
        "id": index,
        "front": f"Question {index}",
        "back": f"Answer {index}",
        "hint": f"Hint {index}",
    }
    for index in range(1, 6)
]


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(api_v1_router)
    with TestClient(app) as test_client:
        yield test_client


def class_fields(name):
    node = next(
        n
        for n in SCHEMA_TREE.body
        if isinstance(n, ast.ClassDef) and n.name == name
    )
    return {n.target.id for n in node.body if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)}


def route_map():
    routes = {}
    for path in ENDPOINTS_PATH.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if (
                    isinstance(decorator, ast.Call)
                    and isinstance(decorator.func, ast.Attribute)
                    and isinstance(decorator.func.value, ast.Name)
                    and decorator.func.value.id == "router"
                    and decorator.args
                ):
                    value = decorator.args[0]
                    if isinstance(value, ast.Constant) and isinstance(value.value, str):
                        routes[(decorator.func.attr, value.value)] = node.name
    return routes


def test_request_models_expose_required_contract_fields():
    assert {"course", "topic", "celebrity"} <= class_fields("LessonRequest")
    assert {"preferences", "voice_id", "gender", "language", "speech_rate", "speech_pitch"} <= class_fields("LessonRequest")
    assert class_fields("SyllabusRequest") == {"course_title", "category"}
    assert class_fields("QuizRequest") == {"lesson"}


def test_quiz_response_contract_is_defined():
    assert class_fields("QuizQuestion") == {"question", "options", "correct_index", "explanation"}
    assert class_fields("QuizResponse") == {"questions"}


def test_public_routes_are_mapped_to_expected_handlers():
    routes = route_map()
    assert routes[("get", "/")] == "home"
    assert routes[("get", "/voices")] == "get_voices"
    assert routes[("post", "/generate-syllabus")] == "generate_syllabus"
    assert routes[("post", "/generate-quiz")] == "generate_quiz"
    assert routes[("post", "/explain-code")] == "explain_code"
    assert routes[("post", "/generate-flashcards")] == "generate_flashcards"
    assert routes[("post", "/generate")] == "generate_lesson"


def test_job_and_transcript_routes_remain_available():
    routes = route_map()
    assert routes[("get", "/status/{job_id}")] == "get_status"
    assert routes[("get", "/transcript/{filename}")] == "get_transcript"


def test_api_uses_declared_config_model_for_primary_gemini_calls():
    assert "model: str = GEMINI_MODEL" in GEMINI_SOURCE
    assert "model=model" in GEMINI_SOURCE


def test_api_does_not_embed_secret_values():
    forbidden = ("AIza", "gsk_", "api_key='", 'api_key="')
    assert not any(marker in SOURCE for marker in forbidden)


@pytest.mark.parametrize("mode", ["explain", "debug", "optimize"])
def test_explain_code_returns_expected_response(client, monkeypatch, mode):
    monkeypatch.setattr(
        provider_manager,
        "explain_code",
        lambda _data: EXPLANATION_RESPONSE,
    )

    response = client.post(
        "/explain-code",
        json={"code": 'print("hello")', "language": "python", "mode": mode},
    )

    assert response.status_code == 200
    assert response.json() == EXPLANATION_RESPONSE
    assert set(response.json()) == {
        "summary",
        "explanation",
        "issues",
        "suggested_code",
        "time_complexity",
        "space_complexity",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"code": "print(1)", "language": "python", "mode": "invalid"},
        {"code": "x" * 20001, "language": "python", "mode": "explain"},
        {"code": "", "language": "python", "mode": "explain"},
        {"code": "x", "language": "l" * 51, "mode": "explain"},
    ],
)
def test_explain_code_rejects_invalid_payloads(client, payload):
    response = client.post("/explain-code", json=payload)

    assert response.status_code == 422


def test_explain_code_provider_failure_returns_safe_error(client, monkeypatch):
    api_key_sentinel = "gsk_fake_api_key_sentinel"

    def fail(_data):
        raise RuntimeError(api_key_sentinel)

    monkeypatch.setattr(provider_manager.gemini_provider, "explain_code", fail)
    monkeypatch.setattr(provider_manager.groq_provider, "explain_code", fail)

    response = client.post(
        "/explain-code",
        json={"code": "print(1)", "language": "python", "mode": "explain"},
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "Both AI providers failed to analyze the code."
    }
    assert api_key_sentinel not in response.text


@pytest.mark.parametrize("count", [4, 11])
def test_generate_flashcards_rejects_out_of_range_count(client, count):
    response = client.post(
        "/generate-flashcards",
        json={"transcript": "A lesson transcript.", "count": count},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "transcript",
    ["x" * 30001, None, {"text": "A lesson transcript."}],
)
def test_generate_flashcards_rejects_oversized_or_malformed_transcript(
    client, transcript
):
    response = client.post(
        "/generate-flashcards",
        json={"transcript": transcript, "count": 5},
    )

    assert response.status_code == 422


def test_generate_flashcards_calls_provider_and_returns_cards(client, monkeypatch):
    generate_mock = Mock(return_value=FLASHCARD_RESPONSE)
    monkeypatch.setattr(
        provider_manager,
        "generate_flashcards",
        generate_mock,
    )

    response = client.post(
        "/generate-flashcards",
        json={"transcript": "A lesson transcript.", "count": 5},
    )

    assert response.status_code == 200
    assert response.json() == FLASHCARD_RESPONSE
    generate_mock.assert_called_once()
    request = generate_mock.call_args.args[0]
    assert request.transcript == "A lesson transcript."
    assert request.count == 5
