"""Shared fixtures for the structured-logging tests.

Environment variables, ``sys.path`` and process-wide logging state are all
changed inside fixtures and restored afterwards, so nothing here depends on
collection order or leaks into other test modules.
"""

import importlib
import io
import json
import logging
import os
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"

DUMMY_ENV = {
    "GEMINI_API_KEY": "dummy_gemini_key",
    "GROQ_API_KEY": "dummy_groq_key",
    "CLOUDINARY_CLOUD_NAME": "dummy_cloud",
    "CLOUDINARY_API_KEY": "dummy_key",
    "CLOUDINARY_API_SECRET": "dummy_secret",
}

# Every logger whose configuration the service (or a host such as uvicorn) may touch.
TRACKED_LOGGERS = (
    "",
    "api",
    "logging_config",
    "httpx",
    "httpcore",
    "google_genai",
    "uvicorn",
    "uvicorn.error",
    "uvicorn.access",
)


def snapshot_logging():
    """Capture the exact configuration of every tracked logger."""
    state = {}
    for name in TRACKED_LOGGERS:
        target = logging.getLogger(name)
        state[name] = (
            target.level,
            list(target.handlers),
            list(target.filters),
            target.propagate,
            target.disabled,
        )
    return state


def restore_logging(state):
    for name, (level, handlers, filters, propagate, disabled) in state.items():
        target = logging.getLogger(name)
        target.setLevel(level)
        target.handlers[:] = handlers
        target.filters[:] = filters
        target.propagate = propagate
        target.disabled = disabled


class LogCapture(io.StringIO):
    """In-memory log stream that can parse JSON lines."""

    def records(self):
        return [json.loads(line) for line in self.getvalue().splitlines() if line.strip()]


@pytest.fixture(scope="module")
def service_env():
    """Dummy API keys plus the backend directory on sys.path, restored on teardown."""
    with pytest.MonkeyPatch.context() as patch:
        for name, value in DUMMY_ENV.items():
            if name not in os.environ:
                patch.setenv(name, value)
        patch.syspath_prepend(str(BACKEND_DIR))
        yield


@pytest.fixture(scope="module")
def logging_config(service_env):
    return importlib.import_module("logging_config")


@pytest.fixture(scope="module")
def api(service_env):
    return importlib.import_module("api")


@pytest.fixture
def isolated_logging(logging_config):
    """Restore the exact previous logging state, and prove it, after the test."""
    before = snapshot_logging()
    yield before
    logging_config.reset_logging()
    restore_logging(before)
    assert snapshot_logging() == before


@pytest.fixture
def log_stream(logging_config, isolated_logging):
    """Configure service logging into an in-memory stream (JSON by default)."""

    def configure(log_format="json", level="INFO"):
        stream = LogCapture()
        logging_config.configure_logging(log_format=log_format, level=level, stream=stream)
        return stream

    return configure


@pytest.fixture
def log_capture():
    """The in-memory stream class, for tests that call configure_logging directly."""
    return LogCapture


@pytest.fixture
def backend_subprocess_env(service_env):
    """Environment and working directory for running the backend in a child process."""
    env = {**os.environ, "PYTHONPATH": str(BACKEND_DIR)}
    for name, value in DUMMY_ENV.items():
        env.setdefault(name, value)
    return env, BACKEND_DIR
