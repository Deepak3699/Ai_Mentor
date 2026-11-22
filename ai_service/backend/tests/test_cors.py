from fastapi.testclient import TestClient
import pytest

from backend.main import create_app


def test_allowed_origin_is_accepted():
    client = TestClient(create_app())

    response = client.get(
        "/",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )


def test_unknown_origin_is_rejected():
    client = TestClient(create_app())

    response = client.get(
        "/",
        headers={"Origin": "https://malicious.example"},
    )

    assert "access-control-allow-origin" not in response.headers


def test_preflight_request_allows_configured_method_and_headers():
    client = TestClient(create_app())

    response = client.options(
        "/",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
    assert "content-type" in response.headers["access-control-allow-headers"].lower()

def test_wildcard_origin_is_rejected(monkeypatch):
    import importlib
    import sys

    monkeypatch.setenv("PYTEST_CURRENT_TEST", "1")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")

    sys.modules.pop("backend.config", None)

    with pytest.raises(ValueError, match="must not contain wildcard"):
        importlib.import_module("backend.config")