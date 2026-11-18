import pytest
from pydantic import ValidationError

from backend.schemas.assistant import (
    AssistantHistoryTurn,
    AssistantRequest,
    AssistantResponse,
)


def test_assistant_request_accepts_valid_data():
    request = AssistantRequest(
        message="Explain Python loops",
        context="Beginner student",
        history=[
            {"role": "user", "text": "What is Python?"},
            {"role": "model", "text": "Python is a programming language."},
        ],
    )

    assert request.message == "Explain Python loops"
    assert len(request.history) == 2


def test_assistant_request_defaults_to_empty_history():
    request = AssistantRequest(
        message="Hello",
        context="Beginner student",
    )

    assert request.history == []


@pytest.mark.parametrize(
    "payload",
    [
        {"role": "invalid", "text": "Hello"},
        {"role": "user", "text": ""},
        {"role": "model", "text": ""},
    ],
)
def test_assistant_history_rejects_invalid_data(payload):
    with pytest.raises(ValidationError):
        AssistantHistoryTurn.model_validate(payload)


def test_assistant_request_rejects_blank_message():
    with pytest.raises(ValidationError):
        AssistantRequest(
            message="",
            context="Beginner student",
        )


def test_assistant_response_contract():
    response = AssistantResponse(
        reply="Hello! How can I help?",
        route="/dashboard",
        error=None,
    )

    assert response.reply == "Hello! How can I help?"
    assert response.route == "/dashboard"
    assert response.error is None