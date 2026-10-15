"""Structured logging with request and job correlation IDs.

Every log record emitted through the root logger carries two correlation IDs:

* ``request_id`` - bound by :class:`RequestIDMiddleware` for each inbound HTTP
  request (taken from a valid ``X-Request-ID`` header or freshly generated).
* ``job_id`` - bound by :func:`bind_job_id` while a lesson job is processed.

Both live in ``contextvars`` so concurrent jobs never see each other's IDs.
Output is plain text by default and JSON lines when ``LOG_FORMAT=json``.
"""

import contextlib
import json
import logging
import re
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse

from config import LOG_FORMAT, LOG_LEVEL

REQUEST_ID_HEADER = "X-Request-ID"
UNSET = "-"

request_id_var: ContextVar[str] = ContextVar("request_id", default=UNSET)
job_id_var: ContextVar[str] = ContextVar("job_id", default=UNSET)

# Inbound IDs are echoed back and written to logs, so only accept a safe subset.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")

_HANDLER_NAME = "ai_service_console"
_NOISY_LOGGERS = ("httpx", "httpcore", "google_genai")

logger = logging.getLogger(__name__)


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


def configure_logging(log_format: str | None = None, level: str | None = None, stream=None) -> None:
    """Install the service's console handler on the root logger (idempotent)."""
    log_format = (log_format or LOG_FORMAT).lower()
    level_name = (level or LOG_LEVEL).upper()

    handler = logging.StreamHandler(stream or sys.stdout)
    handler.set_name(_HANDLER_NAME)
    handler.addFilter(CorrelationFilter())
    handler.setFormatter(JsonFormatter() if log_format == "json" else TextFormatter())

    root = logging.getLogger()
    for existing in list(root.handlers):
        if existing.get_name() == _HANDLER_NAME:
            root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(getattr(logging, level_name, logging.INFO))

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


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

    Being pure ASGI (not ``BaseHTTPMiddleware``) keeps the context variable set
    while background tasks run, so job logs also carry the originating request ID.
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
        response_started = False

        async def send_with_request_id(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            # Log while the IDs are still bound, and make sure even a 500
            # response carries X-Request-ID.
            logger.exception("Unhandled error while processing request")
            if response_started:
                raise
            response = JSONResponse({"detail": "Internal Server Error"}, status_code=500)
            await response(scope, receive, send_with_request_id)
        finally:
            request_id_var.reset(token)
