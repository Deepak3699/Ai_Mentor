from types import SimpleNamespace
from unittest.mock import patch

from backend.schemas.assistant import AssistantRequest
from backend.services import assistant_service


def create_request():
    return AssistantRequest(
        message="Explain Python loops",
        context="Beginner student",
        history=[
            {"role": "user", "text": "What is Python?"},
            {"role": "model", "text": "Python is a programming language."},
        ],
    )


def test_assistant_sends_structured_history_and_context():
    response = SimpleNamespace(
        text="Python loops repeat instructions.",
        candidates=[],
    )

    with patch.object(
        assistant_service,
        "GEMINI_API_KEY",
        "test-key",
    ), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        return_value=response,
    ) as mock_gemini:

        result = assistant_service.generate_assistant_response(
            create_request()
        )

    assert result["reply"] == "Python loops repeat instructions."
    assert result["error"] is None

    kwargs = mock_gemini.call_args.kwargs

    assert kwargs["contents"][-1] == {
        "role": "user",
        "parts": [{"text": "Explain Python loops"}],
    }

    assert "Beginner student" in kwargs["system_instruction"]


def test_assistant_extracts_navigation_route():
    response = SimpleNamespace(
        text="Opening your dashboard. ROUTE:/dashboard",
        candidates=[],
    )

    with patch.object(
        assistant_service,
        "GEMINI_API_KEY",
        "test-key",
    ), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        return_value=response,
    ):

        result = assistant_service.generate_assistant_response(
            create_request()
        )

    assert result["reply"] == "Opening your dashboard."
    assert result["route"] == "/dashboard"


def test_assistant_handles_empty_gemini_response():
    response = SimpleNamespace(text="", candidates=[])

    with patch.object(
        assistant_service,
        "GEMINI_API_KEY",
        "test-key",
    ), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        return_value=response,
    ):

        result = assistant_service.generate_assistant_response(
            create_request()
        )

    assert result["error"] == "malformed_response"
    assert result["route"] is None


def test_assistant_handles_gemini_timeout():
    with patch.object(
        assistant_service,
        "GEMINI_API_KEY",
        "test-key",
    ), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        side_effect=TimeoutError(),
    ):

        result = assistant_service.generate_assistant_response(
            create_request()
        )

    assert result["error"] == "timeout"
    assert result["route"] is None


def test_assistant_handles_blocked_response():
    candidate = SimpleNamespace(finish_reason="SAFETY")
    response = SimpleNamespace(
        text=None,
        candidates=[candidate],
    )

    with patch.object(
        assistant_service,
        "GEMINI_API_KEY",
        "test-key",
    ), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        return_value=response,
    ):

        result = assistant_service.generate_assistant_response(
            create_request()
        )

    assert result["error"] is None
    assert result["route"] is None
    assert "safe" in result["reply"]