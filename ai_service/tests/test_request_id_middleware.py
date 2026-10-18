import asyncio
import re
from contextlib import asynccontextmanager

import pytest
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import ClientDisconnect
from starlette.responses import PlainTextResponse
from starlette.routing import Mount, Route

HEX_ID = re.compile(r"[0-9a-f]{32}")


class DomainError(Exception):
    pass


class ExplodingMiddleware:
    """Inner middleware that fails before the request ever reaches the router."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] == "/early":
            raise RuntimeError("early failure")
        await self.app(scope, receive, send)


@pytest.fixture
def build_app(logging_config):
    """Factory for a small app wired the same way as the service."""

    def build(*, lifespan=None, catch_all=False):
        app = FastAPI(lifespan=lifespan)

        @app.get("/ok")
        def ok(request: Request):
            return {
                "state_id": request.state.request_id,
                "context_id": logging_config.request_id_var.get(),
            }

        @app.get("/domain")
        def domain():
            raise DomainError("handled by a registered handler")

        @app.exception_handler(DomainError)
        async def handle_domain(request, exc):
            return JSONResponse({"handled": True}, status_code=418)

        @app.get("/http-error")
        def http_error():
            raise HTTPException(status_code=409, detail="conflict")

        @app.get("/boom")
        def boom():
            raise RuntimeError("kaboom")

        @app.get("/stream")
        def stream():
            def chunks():
                yield b"first"
                raise RuntimeError("mid-stream failure")

            return StreamingResponse(chunks())

        @app.post("/background")
        def background(tasks: BackgroundTasks):
            def fail():
                raise RuntimeError("background failure")

            tasks.add_task(fail)
            return {"queued": True}

        if catch_all:

            @app.exception_handler(Exception)
            async def handle_everything(request, exc):
                return JSONResponse({"detail": "custom 500"}, status_code=500)

        app.mount("/mounted", Starlette(routes=[Route("/hello", lambda r: PlainTextResponse("hi"))]))
        app.add_middleware(ExplodingMiddleware)
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["X-Request-ID"],
        )
        logging_config.install_request_id_middleware(app)
        return app

    return build


def errors(stream):
    return [r for r in stream.records() if r["level"] == "ERROR"]


# ----------------------------------------------------------------------------
# Request ID basics
# ----------------------------------------------------------------------------

def test_response_includes_generated_request_id(api):
    response = TestClient(api.app).get("/")

    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


def test_valid_inbound_request_id_is_echoed(api):
    response = TestClient(api.app).get("/", headers={"X-Request-ID": "abc-123_XYZ.9"})

    assert response.headers["X-Request-ID"] == "abc-123_XYZ.9"


@pytest.mark.parametrize("bad_id", ["has space", "semi;colon", "x" * 129, "new\tline"])
def test_unsafe_inbound_request_id_is_replaced(api, bad_id):
    response = TestClient(api.app).get("/", headers={"X-Request-ID": bad_id})

    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


def test_handlers_can_read_the_request_id(build_app):
    response = TestClient(build_app()).get("/ok", headers={"X-Request-ID": "req-visible"})

    assert response.json() == {"state_id": "req-visible", "context_id": "req-visible"}
    assert response.headers["X-Request-ID"] == "req-visible"


# ----------------------------------------------------------------------------
# CORS preflight (real service app)
# ----------------------------------------------------------------------------

PREFLIGHT = {
    "Origin": "http://localhost:3000",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type,x-request-id",
}


def test_cors_preflight_response_carries_request_id(api):
    response = TestClient(api.app).options("/generate", headers=PREFLIGHT)

    assert response.status_code == 200
    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "x-request-id" in allowed, "browsers may send X-Request-ID on the real request"


def test_cors_preflight_echoes_a_valid_inbound_request_id(api):
    response = TestClient(api.app).options(
        "/generate", headers={**PREFLIGHT, "X-Request-ID": "preflight-1"}
    )

    assert response.headers["X-Request-ID"] == "preflight-1"


def test_cross_origin_response_exposes_request_id_to_browsers(api):
    response = TestClient(api.app).get("/", headers={"Origin": "http://localhost:3000"})

    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()
    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


# ----------------------------------------------------------------------------
# Ordering: the header is present however the response is produced
# ----------------------------------------------------------------------------

@pytest.mark.parametrize(
    "method, path, status",
    [
        ("get", "/ok", 200),                  # normal route response
        ("get", "/no-such-route", 404),       # router 404, no handler involved
        ("post", "/ok", 405),                 # router 405
        ("get", "/mounted/hello", 200),       # served by a mounted sub-application
        ("get", "/mounted/missing", 404),     # sub-application 404
        ("get", "/early", 500),               # inner middleware fails before routing
        ("get", "/boom", 500),                # framework-generated 500
    ],
)
def test_request_id_is_present_whichever_layer_builds_the_response(
    build_app, log_stream, method, path, status
):
    log_stream()
    client = TestClient(build_app(), raise_server_exceptions=False)

    response = getattr(client, method)(path)

    assert response.status_code == status
    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


def test_cors_preflight_in_a_composed_app_also_gets_the_header(build_app):
    response = TestClient(build_app()).options("/ok", headers=PREFLIGHT)

    assert response.status_code == 200
    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


# ----------------------------------------------------------------------------
# Registered exception handlers keep working
# ----------------------------------------------------------------------------

def test_handled_domain_exception_keeps_its_response_and_is_not_logged_as_an_error(
    build_app, log_stream
):
    stream = log_stream()

    response = TestClient(build_app()).get("/domain", headers={"X-Request-ID": "req-domain"})

    assert response.status_code == 418
    assert response.json() == {"handled": True}
    assert response.headers["X-Request-ID"] == "req-domain"
    assert errors(stream) == []


def test_http_exception_keeps_its_response_and_is_not_logged_as_an_error(build_app, log_stream):
    stream = log_stream()

    response = TestClient(build_app()).get("/http-error")

    assert response.status_code == 409
    assert response.json() == {"detail": "conflict"}
    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])
    assert errors(stream) == []


def test_application_catch_all_handler_still_builds_the_500(build_app, log_stream):
    stream = log_stream()
    client = TestClient(build_app(catch_all=True), raise_server_exceptions=False)

    response = client.get("/boom", headers={"X-Request-ID": "req-catch-all"})

    assert response.status_code == 500
    assert response.json() == {"detail": "custom 500"}, "the app's own handler must run"
    assert response.headers["X-Request-ID"] == "req-catch-all"
    [error] = errors(stream)
    assert error["request_id"] == "req-catch-all"
    assert "RuntimeError: kaboom" in error["exc"]


def test_unhandled_exception_still_reaches_the_host_server(build_app, log_stream):
    stream = log_stream()

    with pytest.raises(RuntimeError, match="kaboom"):
        TestClient(build_app()).get("/boom")

    assert len(errors(stream)) == 1


def test_default_500_body_is_the_frameworks_and_leaks_nothing(build_app, log_stream):
    log_stream()
    client = TestClient(build_app(), raise_server_exceptions=False)

    response = client.get("/boom")

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


# ----------------------------------------------------------------------------
# Failures after the response has started
# ----------------------------------------------------------------------------

def test_streaming_failure_after_headers_is_logged_without_replacing_the_response(
    build_app, log_stream
):
    stream = log_stream()
    client = TestClient(build_app(), raise_server_exceptions=False)

    response = client.get("/stream", headers={"X-Request-ID": "req-stream"})

    assert response.status_code == 200, "headers were already sent; they cannot be replaced"
    assert response.headers["X-Request-ID"] == "req-stream"
    [error] = errors(stream)
    assert error["request_id"] == "req-stream"
    assert "mid-stream failure" in error["exc"]


def test_streaming_failure_still_propagates_to_the_host(build_app, log_stream):
    log_stream()

    with pytest.raises(RuntimeError, match="mid-stream failure"):
        TestClient(build_app()).get("/stream")


def test_background_task_failure_is_logged_with_the_request_id(build_app, log_stream):
    stream = log_stream()
    client = TestClient(build_app(), raise_server_exceptions=False)

    response = client.post("/background", headers={"X-Request-ID": "req-background"})

    assert response.status_code == 200
    assert response.json() == {"queued": True}
    assert response.headers["X-Request-ID"] == "req-background"
    [error] = errors(stream)
    assert error["request_id"] == "req-background"
    assert "background failure" in error["exc"]


def test_background_task_failure_still_propagates_to_the_host(build_app, log_stream):
    log_stream()

    with pytest.raises(RuntimeError, match="background failure"):
        TestClient(build_app()).post("/background")


def test_request_id_reaches_background_tasks(logging_config, log_stream):
    import logging

    stream = log_stream()
    app = FastAPI()
    probe = logging.getLogger("request_probe")

    async def background_job():
        with logging_config.bind_job_id("bg-job"):
            probe.info("in background")

    @app.post("/work")
    def work(tasks: BackgroundTasks):
        probe.info("in handler")
        tasks.add_task(background_job)
        return {"ok": True}

    logging_config.install_request_id_middleware(app)
    response = TestClient(app).post("/work", headers={"X-Request-ID": "req-bg"})

    assert response.headers["X-Request-ID"] == "req-bg"
    by_msg = {r["msg"]: r for r in stream.records()}
    assert by_msg["in handler"]["request_id"] == "req-bg"
    assert by_msg["in handler"]["job_id"] is None
    assert by_msg["in background"]["request_id"] == "req-bg"
    assert by_msg["in background"]["job_id"] == "bg-job"


# ----------------------------------------------------------------------------
# Cancellation, disconnects, lifespan and other scopes
# ----------------------------------------------------------------------------

HTTP_SCOPE = {"type": "http", "path": "/", "headers": []}


def test_cancellation_passes_through_unlogged_and_releases_the_request_id(
    logging_config, log_stream
):
    stream = log_stream()
    seen = []

    async def inner(scope, receive, send):
        seen.append(logging_config.request_id_var.get())
        raise asyncio.CancelledError()

    async def scenario():
        middleware = logging_config.RequestIDMiddleware(inner)
        with pytest.raises(asyncio.CancelledError):
            await middleware(dict(HTTP_SCOPE), None, None)
        return logging_config.request_id_var.get()

    assert asyncio.run(scenario()) == "-"
    assert HEX_ID.fullmatch(seen[0])
    assert errors(stream) == []


def test_client_disconnect_is_not_logged_as_a_server_error(logging_config, log_stream):
    stream = log_stream()

    async def inner(scope, receive, send):
        raise ClientDisconnect()

    async def scenario():
        middleware = logging_config.RequestIDMiddleware(inner)
        with pytest.raises(ClientDisconnect):
            await middleware(dict(HTTP_SCOPE), None, None)

    asyncio.run(scenario())

    assert errors(stream) == []


def test_lifespan_startup_and_shutdown_run_untouched(build_app, logging_config):
    events = []

    @asynccontextmanager
    async def lifespan(app):
        events.append(("startup", logging_config.request_id_var.get()))
        yield
        events.append(("shutdown", logging_config.request_id_var.get()))

    with TestClient(build_app(lifespan=lifespan)) as client:
        assert events == [("startup", "-")]
        assert HEX_ID.fullmatch(client.get("/ok").headers["X-Request-ID"])

    assert events == [("startup", "-"), ("shutdown", "-")]


def test_lifespan_startup_failure_propagates_unchanged(build_app):
    @asynccontextmanager
    async def lifespan(app):
        raise RuntimeError("startup failed")
        yield

    with pytest.raises(RuntimeError, match="startup failed"):
        with TestClient(build_app(lifespan=lifespan)):
            pass


def test_non_http_scopes_are_passed_through_unmodified(logging_config):
    received = []

    async def inner(scope, receive, send):
        received.append(dict(scope))

    scope = {"type": "lifespan"}
    asyncio.run(logging_config.RequestIDMiddleware(inner)(scope, None, None))

    assert received == [{"type": "lifespan"}]
    assert "state" not in scope


def test_websocket_connections_work_through_the_middleware(logging_config):
    app = FastAPI()

    @app.websocket("/ws")
    async def ws(socket: WebSocket):
        await socket.accept()
        await socket.send_text("pong")
        await socket.close()

    logging_config.install_request_id_middleware(app)

    with TestClient(app).websocket_connect("/ws") as socket:
        assert socket.receive_text() == "pong"
