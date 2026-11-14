import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from oauth_auth import OAuth2Middleware

os.environ.pop("OAUTH_ISSUER", None)
os.environ.pop("OAUTH_AUDIENCE", None)
os.environ.pop("OAUTH_JWKS_URL", None)

app = FastAPI()
app.add_middleware(OAuth2Middleware)

@app.get("/")
def health():
    return {"status": "ok"}

@app.get("/protected")
def protected():
    return {"status": "authorized"}

client = TestClient(app)

def test_root_is_public():
    response = client.get("/")
    assert response.status_code == 200

def test_protected_route_fails_closed_without_configuration():
    response = client.get("/protected")
    assert response.status_code == 503

def test_protected_route_rejects_missing_token_when_configured(monkeypatch):
    monkeypatch.setenv("OAUTH_ISSUER", "https://issuer.example")
    monkeypatch.setenv("OAUTH_AUDIENCE", "ai-service")
    monkeypatch.setenv("OAUTH_JWKS_URL", "https://issuer.example/jwks")
    app2 = FastAPI()
    app2.add_middleware(OAuth2Middleware)
    @app2.get("/protected")
    def protected2():
        return {"status": "authorized"}
    response = TestClient(app2).get("/protected")
    assert response.status_code == 401
import time
from types import SimpleNamespace

import jwt
import oauth_auth
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization


def build_jwt_test_app(monkeypatch, scope="ai:access"):
    monkeypatch.setenv("OAUTH_ISSUER", "https://issuer.example")
    monkeypatch.setenv("OAUTH_AUDIENCE", "ai-service")
    monkeypatch.setenv("OAUTH_JWKS_URL", "https://issuer.example/jwks")
    monkeypatch.setenv("OAUTH_REQUIRED_SCOPE", "ai:access")

    trusted_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    public_pem = trusted_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_pem = trusted_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )

    other_private_pem = other_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )

    class FakeJWKS:
        def __init__(self, *args, **kwargs):
            pass

        def get_signing_key_from_jwt(self, token):
            return SimpleNamespace(key=public_pem)

    monkeypatch.setattr(oauth_auth, "PyJWKClient", FakeJWKS)

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.add_middleware(oauth_auth.OAuth2Middleware)

    @app.get("/protected")
    def protected():
        return {"status": "authorized"}

    claims = {
        "iss": "https://issuer.example",
        "aud": "ai-service",
        "exp": int(time.time()) + 300,
        "scope": scope,
    }

    valid_token = jwt.encode(claims, private_pem, algorithm="RS256")
    invalid_signature_token = jwt.encode(
        claims, other_private_pem, algorithm="RS256"
    )

    return TestClient(app), valid_token, invalid_signature_token


def test_valid_jwt_is_accepted(monkeypatch):
    client, token, _ = build_jwt_test_app(monkeypatch)
    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_invalid_jwt_signature_is_rejected(monkeypatch):
    client, _, token = build_jwt_test_app(monkeypatch)
    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401


def test_missing_required_scope_returns_403(monkeypatch):
    client, token, _ = build_jwt_test_app(monkeypatch, scope="profile:read")
    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

def test_static_files_require_authentication(monkeypatch, tmp_path):
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles
    from fastapi.testclient import TestClient

    monkeypatch.setenv("OAUTH_ISSUER", "https://issuer.example")
    monkeypatch.setenv("OAUTH_AUDIENCE", "ai-service")
    monkeypatch.setenv("OAUTH_JWKS_URL", "https://issuer.example/jwks")

    (tmp_path / "sample.mp4").write_bytes(b"test-video")

    app = FastAPI()
    app.add_middleware(oauth_auth.OAuth2Middleware)
    app.mount("/video-stream", StaticFiles(directory=str(tmp_path)))

    response = TestClient(app).get("/video-stream/sample.mp4")

    assert response.status_code == 401
