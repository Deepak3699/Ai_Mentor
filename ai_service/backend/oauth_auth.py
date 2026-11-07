import os
import asyncio

import jwt
from jwt import PyJWKClient
from jwt.exceptions import (
    PyJWKClientError,
    PyJWKClientConnectionError,
    InvalidTokenError,
)
from starlette.responses import JSONResponse


class OAuth2Middleware:
    """Validate OAuth2 client-credentials access tokens."""

    def __init__(self, app):
        self.app = app

        self.issuer = os.getenv("OAUTH_ISSUER")
        self.audience = os.getenv("OAUTH_AUDIENCE")
        self.jwks_url = os.getenv("OAUTH_JWKS_URL")
        self.required_scope = os.getenv("OAUTH_REQUIRED_SCOPE", "ai:access")

        self.configured = all([
            self.issuer,
            self.audience,
            self.jwks_url,
            self.required_scope,
        ])

        self.jwks_client = (
            PyJWKClient(
                self.jwks_url,
                cache_jwk_set=True,
                lifespan=300,
                timeout=5,
            )
            if self.configured else None
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "")

        # Only the root health endpoint is public.
        if path == "/" and method == "GET":
            await self.app(scope, receive, send)
            return

        # Allow browser CORS preflight requests.
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        if not self.configured:
            response = JSONResponse(
                {"detail": "OAuth2 authentication is not configured"},
                status_code=503,
            )
            await response(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        authorization = headers.get(b"authorization", b"").decode(
            "latin-1"
        )

        if not authorization.startswith("Bearer "):
            response = JSONResponse(
                {"detail": "Missing Bearer token"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        token = authorization[7:].strip()

        if not token:
            response = JSONResponse(
                {"detail": "Missing Bearer token"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        try:
            signing_key = await asyncio.to_thread(
                self.jwks_client.get_signing_key_from_jwt,
                token,
            )
        except PyJWKClientConnectionError:
            response = JSONResponse(
                {"detail": "Authentication provider unavailable"},
                status_code=503,
            )
            await response(scope, receive, send)
            return
        except PyJWKClientError:
            response = JSONResponse(
                {"detail": "Invalid access token"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        try:
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=self.issuer,
                audience=self.audience,
                options={
                    "require": ["exp", "iss", "aud"],
                },
                leeway=30,
            )
        except InvalidTokenError:
            response = JSONResponse(
                {"detail": "Invalid or expired access token"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        token_scopes = claims.get("scope", "")
        if isinstance(token_scopes, str):
            token_scopes = token_scopes.split()
        elif isinstance(token_scopes, list):
            token_scopes = set(token_scopes)
        else:
            token_scopes = set()

        if self.required_scope not in token_scopes:
            response = JSONResponse(
                {"detail": "Insufficient permissions"},
                status_code=403,
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
