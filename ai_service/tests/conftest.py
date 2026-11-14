import sys
from pathlib import Path

service_dir = Path(__file__).resolve().parent.parent
backend_dir = service_dir / "backend"
for import_root in (backend_dir, service_dir):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))


import importlib

import pytest


@pytest.fixture(autouse=True)
def bypass_oauth_middleware(monkeypatch):
    """Let existing endpoint tests run without OAuth config.

    OAuth behaviour is covered separately in backend/tests/test_oauth_auth.py.
    """
    module = importlib.import_module("backend.oauth_auth")

    async def passthrough(self, scope, receive, send):
        await self.app(scope, receive, send)

    monkeypatch.setattr(module.OAuth2Middleware, "__call__", passthrough)
