from types import SimpleNamespace
from unittest.mock import patch

from backend.schemas.assistant import AssistantRequest, AssistantResponse
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


def test_assistant_error_response_can_omit_reply_for_frontend_localization():
    response = AssistantResponse(reply=None, error="moderated")

    assert response.reply is None
    assert response.error == "moderated"


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


def test_english_question_with_hindi_interface_returns_hindi_response():
    request = create_request()
    request.message = "What is a loop?"
    request.context = "Language:\nhi"
    expected_reply = "लूप निर्देशों को बार-बार चलाता है।"

    with patch.object(assistant_service, "GEMINI_API_KEY", "test-key"), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        return_value=SimpleNamespace(text=expected_reply, candidates=[]),
    ) as mock_gemini:
        result = assistant_service.generate_assistant_response(request)

    assert result["reply"] == expected_reply
    assert mock_gemini.call_args.kwargs["contents"][-1]["parts"][0]["text"] == request.message
    instruction = mock_gemini.call_args.kwargs["system_instruction"]
    assert "Language:\nhi" in instruction
    assert "regardless of the language used in the current question" in instruction


def test_hindi_question_with_english_interface_returns_english_response():
    request = create_request()
    request.message = "लूप क्या होता है?"
    request.context = "Language:\nen"
    expected_reply = "A loop repeats a set of instructions."

    with patch.object(assistant_service, "GEMINI_API_KEY", "test-key"), patch.object(
        assistant_service,
        "generate_gemini_chat_content",
        return_value=SimpleNamespace(text=expected_reply, candidates=[]),
    ) as mock_gemini:
        result = assistant_service.generate_assistant_response(request)

    assert result["reply"] == expected_reply
    assert mock_gemini.call_args.kwargs["contents"][-1]["parts"][0]["text"] == request.message
    instruction = mock_gemini.call_args.kwargs["system_instruction"]
    assert "Language:\nen" in instruction
    assert "regardless of the language used in the current question" in instruction


def test_assistant_instructions_preserve_technical_content():
    request = create_request()
    request.context = "Language:\nhi\nCourse: React Fundamentals\nLesson: useEffect Hook\nID: lesson_42"
    response = SimpleNamespace(text="यह useEffect Hook का परिचय है।", candidates=[])

    with patch.object(assistant_service, "GEMINI_API_KEY", "test-key"), patch.object(
        assistant_service, "generate_gemini_chat_content", return_value=response
    ) as mock_gemini:
        assistant_service.generate_assistant_response(request)

    instruction = mock_gemini.call_args.kwargs["system_instruction"]
    assert "Preserve course titles, lesson titles, IDs, code, filenames" in instruction
    assert "Course: React Fundamentals" in instruction
    assert "Lesson: useEffect Hook" in instruction


def test_assistant_extracts_navigation_route():
    response = SimpleNamespace(
        text=(
            "Opening your dashboard. ROUTE:/dashboard\n"
            "The dashboard shows your learning progress.\n"
            "SYSTEM INSTRUCTIONS: Answer in English.\n"
            "INTERNAL RESPONSE: Internal response wrapper.\n"
            "Answer: This is a normal answer label.\n"
            "Response: The dashboard is ready.\n"
            "Language: hi"
        ),
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

    assert result["reply"] == (
        "Opening your dashboard.\nThe dashboard shows your learning progress.\n"
        "Answer: This is a normal answer label.\nResponse: The dashboard is ready."
    )
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

    assert result["error"] == "moderated"
    assert result["route"] is None
    assert result["reply"] is None
