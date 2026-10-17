import asyncio
import io
import json
import logging
import os
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("GEMINI_API_KEY", "dummy_gemini_key")
os.environ.setdefault("GROQ_API_KEY", "dummy_groq_key")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "dummy_cloud")
os.environ.setdefault("CLOUDINARY_API_KEY", "dummy_key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "dummy_secret")

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import api
import logging_config
from fastapi import BackgroundTasks, FastAPI
from fastapi.testclient import TestClient
from logging_config import RequestIDMiddleware, bind_job_id, configure_logging

HEX_ID = re.compile(r"[0-9a-f]{32}")


@pytest.fixture
def log_stream():
    """Route the service's logging to an in-memory buffer; restore defaults after."""

    def configure(log_format="json"):
        stream = io.StringIO()
        configure_logging(log_format=log_format, level="INFO", stream=stream)
        return stream

    yield configure
    configure_logging()


def json_lines(stream):
    return [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]


def make_request(topic="Structured Logging"):
    return api.LessonRequest(course="Python", topic=topic, celebrity="Modi")


def run_successful_job(job_id, topic="Structured Logging"):
    gemini_response = MagicMock()
    gemini_response.text = "A short test script about structured logging."
    process = AsyncMock()
    process.returncode = 0
    process.communicate.return_value = (b"", b"")

    with patch.object(api.gemini_client.models, "generate_content", return_value=gemini_response), \
         patch("api.generate_tts", new_callable=AsyncMock), \
         patch("api.create_avatar_video", side_effect=Exception("D-ID disabled")), \
         patch("os.path.exists", side_effect=lambda p: False if p.endswith(".mp3") else True), \
         patch("os.remove"), \
         patch("asyncio.create_subprocess_exec", return_value=process), \
         patch("cloudinary.uploader.upload", return_value={"secure_url": "http://cloudinary.com/x.mp4"}):
        asyncio.run(api.process_lesson(make_request(topic), job_id))


# ----------------------------------------------------------------------------
# job_id
# ----------------------------------------------------------------------------

def test_every_log_line_inside_a_job_includes_job_id(log_stream):
    stream = log_stream()
    job_id = "Structured_Logging_job_success"

    run_successful_job(job_id)

    records = json_lines(stream)
    assert len(records) > 5
    assert {record["job_id"] for record in records} == {job_id}
    assert any(r["msg"] == "Lesson generation completed" for r in records)


def test_failed_job_logs_carry_job_id(log_stream):
    stream = log_stream()
    job_id = "Structured_Logging_job_failure"

    with patch.object(api.gemini_client.models, "generate_content", side_effect=Exception("gemini down")), \
         patch.object(api.groq_client.chat.completions, "create", side_effect=Exception("groq down")):
        asyncio.run(api.process_lesson(make_request(), job_id))

    records = json_lines(stream)
    errors = [r for r in records if r["level"] == "ERROR"]
    assert errors
    assert all(r["job_id"] == job_id for r in records)


def test_job_id_is_released_after_the_job(log_stream):
    stream = log_stream()

    run_successful_job("Structured_Logging_job_release")
    logging.getLogger("after_job").info("outside any job")

    last = json_lines(stream)[-1]
    assert last["msg"] == "outside any job"
    assert last["job_id"] is None


def test_concurrent_jobs_do_not_mix_job_ids(log_stream):
    stream = log_stream()
    probe = logging.getLogger("concurrency_probe")

    async def worker(job_id):
        with bind_job_id(job_id):
            probe.info("start %s", job_id)
            await asyncio.sleep(0.01)
            probe.info("end %s", job_id)

    async def main():
        await asyncio.gather(*(worker(f"job-{n}") for n in range(5)))

    asyncio.run(main())

    records = json_lines(stream)
    assert len(records) == 10
    for record in records:
        assert record["msg"].split()[1] == record["job_id"]


# ----------------------------------------------------------------------------
# Formats
# ----------------------------------------------------------------------------

def test_json_format_produces_parseable_lines_with_fields(log_stream):
    stream = log_stream("json")

    run_successful_job("Structured_Logging_job_json", topic="React Hooks")

    records = json_lines(stream)
    for record in records:
        assert {"ts", "level", "logger", "request_id", "job_id", "msg"} <= record.keys()
        assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", record["ts"])
    started = next(r for r in records if r["msg"] == "Lesson generation started")
    assert started["topic"] == "React Hooks"
    assert started["level"] == "INFO"
    assert any(r["level"] == "WARNING" for r in records)


def test_text_format_is_default_and_shows_ids(log_stream):
    stream = log_stream("text")

    with bind_job_id("job-text"), patch.object(logging_config, "request_id_var") as request_id_var:
        request_id_var.get.return_value = "req-text"
        api.log_event("OK", "Something happened", topic="Line1\nLine2")

    output = stream.getvalue()
    assert output.count("\n") == 1, "a record must stay on one line"
    assert "[req=req-text job=job-text]" in output
    assert "Something happened | stage=OK | topic=Line1\\nLine2" in output


def test_json_format_records_exceptions(log_stream):
    stream = log_stream("json")

    try:
        raise ValueError("boom")
    except ValueError:
        logging.getLogger("exc_probe").error("failed", exc_info=True)

    record = json_lines(stream)[-1]
    assert "ValueError: boom" in record["exc"]


def test_config_defaults_to_text():
    import config

    assert config.LOG_FORMAT in {"text", "json"}
    assert logging_config.LOG_FORMAT == config.LOG_FORMAT


# ----------------------------------------------------------------------------
# Request ID middleware
# ----------------------------------------------------------------------------

def test_response_includes_generated_request_id():
    response = TestClient(api.app).get("/")

    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


def test_valid_inbound_request_id_is_echoed():
    response = TestClient(api.app).get("/", headers={"X-Request-ID": "abc-123_XYZ.9"})

    assert response.headers["X-Request-ID"] == "abc-123_XYZ.9"


@pytest.mark.parametrize("bad_id", ["has space", "semi;colon", "x" * 129, "new\tline"])
def test_unsafe_inbound_request_id_is_replaced(bad_id):
    response = TestClient(api.app).get("/", headers={"X-Request-ID": bad_id})

    assert HEX_ID.fullmatch(response.headers["X-Request-ID"])


def test_request_id_present_on_error_responses():
    client = TestClient(api.app)

    not_found = client.get("/definitely-not-a-route")
    invalid = client.post("/generate", json={})

    assert not_found.status_code == 404
    assert invalid.status_code == 422
    assert HEX_ID.fullmatch(not_found.headers["X-Request-ID"])
    assert HEX_ID.fullmatch(invalid.headers["X-Request-ID"])


def test_request_id_is_exposed_to_browsers_via_cors():
    response = TestClient(api.app).get("/", headers={"Origin": "http://localhost:3000"})

    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()


def test_unhandled_exception_returns_500_with_request_id_and_logs_it(log_stream):
    stream = log_stream()
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret internal detail")

    response = TestClient(app).get("/boom", headers={"X-Request-ID": "req-boom"})

    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "req-boom"
    assert "secret internal detail" not in response.text
    error = next(r for r in json_lines(stream) if r["level"] == "ERROR")
    assert error["request_id"] == "req-boom"
    assert "RuntimeError: secret internal detail" in error["exc"]


def test_request_id_reaches_sync_handlers_and_background_tasks(log_stream):
    stream = log_stream()
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)
    probe = logging.getLogger("request_probe")

    async def background_job():
        with bind_job_id("bg-job"):
            probe.info("in background")

    @app.post("/work")
    def work(tasks: BackgroundTasks):
        probe.info("in handler")
        tasks.add_task(background_job)
        return {"ok": True}

    response = TestClient(app).post("/work", headers={"X-Request-ID": "req-bg"})

    assert response.headers["X-Request-ID"] == "req-bg"
    by_msg = {r["msg"]: r for r in json_lines(stream)}
    assert by_msg["in handler"]["request_id"] == "req-bg"
    assert by_msg["in handler"]["job_id"] is None
    assert by_msg["in background"]["request_id"] == "req-bg"
    assert by_msg["in background"]["job_id"] == "bg-job"


def test_generate_job_logs_carry_request_id_and_job_id(log_stream):
    stream = log_stream()
    client = TestClient(api.app)

    with patch.object(api.gemini_client.models, "generate_content", side_effect=Exception("gemini down")), \
         patch.object(api.groq_client.chat.completions, "create", side_effect=Exception("groq down")):
        response = client.post(
            "/generate",
            json={"course": "Python", "topic": "Correlation IDs", "celebrity": "modi"},
            headers={"X-Request-ID": "req-e2e-1"},
            params={"force": "true"},
        )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req-e2e-1"
    job_id = response.json()["jobId"]

    job_records = [r for r in json_lines(stream) if r["job_id"]]
    assert job_records
    assert {r["job_id"] for r in job_records} == {job_id}
    assert {r["request_id"] for r in job_records} == {"req-e2e-1"}
