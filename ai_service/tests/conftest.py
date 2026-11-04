"""Provide dummy provider credentials so tests do not depend on local .env files.

The environment is patched before test collection (``config`` and ``api`` are
imported while pytest imports test modules) and restored afterwards so the
test run does not leak credentials into the surrounding process.
"""

import pytest

DUMMY_ENV = {
    "GEMINI_API_KEY": "dummy_gemini_key",
    "GROQ_API_KEY": "dummy_groq_key",
    "CLOUDINARY_CLOUD_NAME": "dummy_cloud",
    "CLOUDINARY_API_KEY": "dummy_key",
    "CLOUDINARY_API_SECRET": "dummy_secret",
}


def pytest_configure(config):
    patch = pytest.MonkeyPatch()
    for key, value in DUMMY_ENV.items():
        patch.setenv(key, value)
    config._ai_service_env_patch = patch


def pytest_unconfigure(config):
    patch = getattr(config, "_ai_service_env_patch", None)
    if patch is not None:
        patch.undo()
        config._ai_service_env_patch = None
