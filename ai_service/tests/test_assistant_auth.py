from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.main import create_app


def test_assistant_rejects_request_without_service_key():
    with patch(
        "backend.utils.service_auth.AI_SERVICE_KEY",
        "test-secret",
    ):
        client = TestClient(create_app())

        response = client.post(
            "/assistant/chat",
            json={
                "message": "Hello",
                "context": "Beginner student",
            },
        )

    assert response.status_code == 401


def test_assistant_accepts_valid_service_key():
    with patch(
        "backend.utils.service_auth.AI_SERVICE_KEY",
        "test-secret",
    ), patch(
        "backend.api.v1.endpoints.assistant.generate_assistant_response",
        return_value={
            "reply": "Hello! How can I help?",
            "route": None,
            "error": None,
        },
    ):
        client = TestClient(create_app())

        response = client.post(
            "/assistant/chat",
            headers={"x-service-key": "test-secret"},
            json={
                "message": "Hello",
                "context": "Beginner student",
            },
        )

    assert response.status_code == 200
    assert response.json()["reply"] == "Hello! How can I help?"