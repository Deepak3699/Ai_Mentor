"""Structured logging with request and job correlation IDs.

Every log record written by the service's handler carries two correlation IDs:

* ``request_id`` - bound by :class:`RequestIDMiddleware` for each inbound HTTP
  request (taken from a valid ``X-Request-ID`` header or freshly generated).
* ``job_id`` - bound by :func:`bind_job_id` while a lesson job is processed.

Both live in ``contextvars`` so concurrent jobs never see each other's IDs.

Nothing here runs at import time. The service calls :func:`configure_logging`
from its application lifespan, and :func:`reset_logging` undoes exactly what
that call changed. Settings are read from the environment when
``configure_logging`` runs:

* ``LOG_FORMAT``: ``text`` (default) or ``json``.
* ``AI_SERVICE_LOG_LEVEL``: ``DEBUG``, ``INFO`` (default), ``WARNING``,
  ``ERROR`` or ``CRITICAL``.

Unsupported values never stop the service from starting: they fall back to the
default and a single warning is logged naming the setting.
"""

import contextlib
import json
import logging
import os
import re
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from types import SimpleNamespace

from starlette.datastructures import MutableHeaders
from starlette.requests import ClientDisconnect

REQUEST_ID_HEADER = "X-Request-ID"
LOG_FORMAT_ENV = "LOG_FORMAT"
LOG_LEVEL_ENV = "AI_SERVICE_LOG_LEVEL"
DEFAULT_LOG_FORMAT = "text"
DEFAULT_LOG_LEVEL = "INFO"
UNSET = "-"

request_id_var: ContextVar[str] = ContextVar("request_id", default=UNSET)
job_id_var: ContextVar[str] = ContextVar("job_id", default=UNSET)

_LOG_FORMATS = ("text", "json")
_LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARN": logging.WARNING,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}

# Inbound IDs are echoed back and written to logs, so only accept a safe subset.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")

# Chatty client libraries that are quietened unless the host already set a level.
_NOISY_LOGGERS = ("httpx", "httpcore", "google_genai")

logger = logging.getLogger(__name__)

# What configure_logging() changed, so reset_logging() can undo exactly that.
_applied = None


class CorrelationFilter(logging.Filter):
    """Copy the current request and job IDs onto every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.job_id = job_id_var.get()
        return True


def _field_items(record: logging.LogRecord):
    fields = getattr(record, "fields", None) or {}
    return [(key, value) for key, value in fields.items() if value not in (None, "")]


class TextFormatter(logging.Formatter):
    """Human-readable lines: ``time LEVEL [logger] [req=.. job=..] msg | k=v``."""

    def __init__(self):
        super().__init__(
            "%(asctime)s %(levelname)-7s [%(name)s] "
            "[req=%(request_id)s job=%(job_id)s] %(message)s"
        )

    def formatMessage(self, record: logging.LogRecord) -> str:
        line = super().formatMessage(record)
        for key, value in _field_items(record):
            # Keep one record on one line, even for user-supplied values.
            safe = str(value).replace("\r", "\\r").replace("\n", "\\n")
            line += f" | {key}={safe}"
        return line


class JsonFormatter(logging.Formatter):
    """One JSON object per line."""

    _RESERVED = {"ts", "level", "logger", "request_id", "job_id", "msg", "exc"}

    def format(self, record: logging.LogRecord) -> str:
        created = datetime.fromtimestamp(record.created, timezone.utc)
        request_id = getattr(record, "request_id", UNSET)
        job_id = getattr(record, "job_id", UNSET)
        payload = {
            "ts": created.strftime("%Y-%m-%dT%H:%M:%S.") + f"{created.microsecond // 1000:03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "request_id": None if request_id == UNSET else request_id,
            "job_id": None if job_id == UNSET else job_id,
            "msg": record.getMessage(),
        }
        for key, value in _field_items(record):
            payload[f"field_{key}" if key in self._RESERVED else key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def _clip(value) -> str:
    """Quote a rejected setting for a log message without letting it grow or break lines."""
    return repr(str(value)[:40])


def _resolve_format(requested, problems: list) -> str:
    raw = requested if requested is not None else os.environ.get(LOG_FORMAT_ENV)
    value = (raw or "").strip().lower() or DEFAULT_LOG_FORMAT
    if value not in _LOG_FORMATS:
        problems.append(
            f"Unsupported {LOG_FORMAT_ENV} {_clip(raw)}; using {DEFAULT_LOG_FORMAT!r} "
            f"(supported: {', '.join(_LOG_FORMATS)})"
        )
        return DEFAULT_LOG_FORMAT
    return value


def _resolve_level(requested, problems: list) -> int:
    raw = requested if requested is not None else os.environ.get(LOG_LEVEL_ENV)
    name = (raw or "").strip().upper() or DEFAULT_LOG_LEVEL
    if name not in _LOG_LEVELS:
        problems.append(
            f"Unsupported {LOG_LEVEL_ENV} {_clip(raw)}; using {DEFAULT_LOG_LEVEL!r} "
            "(supported: DEBUG, INFO, WARNING, ERROR, CRITICAL)"
        )
        return _LOG_LEVELS[DEFAULT_LOG_LEVEL]
    return _LOG_LEVELS[name]


def configure_logging(log_format: str | None = None, level: str | None = None, stream=None) -> None:
    """Attach the service's console handler to the root logger.

    Safe to call repeatedly: a previous call is undone first, so there is never
    more than one service handler and unrelated handlers are left untouched.
    """
    global _applied
    reset_logging()

    problems: list = []
    fmt = _resolve_format(log_format, problems)
    root_level = _resolve_level(level, problems)

    handler = logging.StreamHandler(stream or sys.stdout)
    handler.addFilter(CorrelationFilter())
    handler.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())

    root = logging.getLogger()
    _applied = SimpleNamespace(handler=handler, root_level=root.level, quieted=[])
    root.addHandler(handler)
    root.setLevel(root_level)

    for name in _NOISY_LOGGERS:
        noisy = logging.getLogger(name)
        if noisy.level == logging.NOTSET:
            noisy.setLevel(logging.WARNING)
            _applied.quieted.append(name)

    for problem in problems:
        logger.warning(problem)


def reset_logging() -> None:
    """Undo the last :func:`configure_logging` call (no-op if there was none)."""
    global _applied
    if _applied is None:
        return
    root = logging.getLogger()
    root.removeHandler(_applied.handler)
    root.setLevel(_applied.root_level)
    for name in _applied.quieted:
        logging.getLogger(name).setLevel(logging.NOTSET)
    _applied = None


@contextlib.contextmanager
def bind_job_id(job_id: str):
    """Attach ``job_id`` to every log record emitted inside the block."""
    token = job_id_var.set(job_id)
    try:
        yield
    finally:
        job_id_var.reset(token)


class RequestIDMiddleware:
    """Pure ASGI middleware that binds a request ID and returns it on every response.

    It is meant to be the outermost layer (see :func:`install_request_id_middleware`)
    so the header is also added to responses created by CORS preflight handling
    and by the framework's own error handling. It does not handle errors itself:
    exceptions are logged with the request ID still bound and then re-raised, so
    registered exception handlers and the host server behave exactly as before.

    Being pure ASGI (not ``BaseHTTPMiddleware``) keeps the context variable set
    while background tasks run, so job logs also carry the originating request ID.
    Non-HTTP scopes (lifespan, websocket) pass through untouched.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = None
        for name, value in scope.get("headers", []):
            if name == b"x-request-id":
                candidate = value.decode("latin-1").strip()
                if _VALID_REQUEST_ID.fullmatch(candidate):
                    request_id = candidate
                break
        request_id = request_id or uuid.uuid4().hex

        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except ClientDisconnect:
            raise
        except Exception:
            # Logged while the IDs are bound; re-raised so the framework and
            # host server keep their normal behaviour. Cancellation is a
            # BaseException and passes through without being logged.
            logger.exception("Unhandled error while processing request")
            raise
        finally:
            request_id_var.reset(token)


def install_request_id_middleware(app) -> None:
    """Make :class:`RequestIDMiddleware` the outermost layer of a Starlette/FastAPI app.

    ``app.add_middleware`` only places middleware inside the framework's error
    and CORS layers, so it would miss preflight responses and framework-generated
    500s. Wrapping the built stack avoids that without changing the app type.
    """
    build = app.build_middleware_stack

    def build_with_request_id():
        return RequestIDMiddleware(build())

    app.build_middleware_stack = build_with_request_id
