import asyncio
import logging
import re
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient


def make_request(api, topic="Structured Logging"):
    return api.LessonRequest(course="Python", topic=topic, celebrity="Modi")


def run_successful_job(api, job_id, topic="Structured Logging"):
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
        asyncio.run(api.process_lesson(make_request(api, topic), job_id))


# ----------------------------------------------------------------------------
# job_id
# ----------------------------------------------------------------------------

def test_every_log_line_inside_a_job_includes_job_id(api, log_stream):
    stream = log_stream()
    job_id = "Structured_Logging_job_success"

    run_successful_job(api, job_id)

    records = stream.records()
    assert len(records) > 5
    assert {record["job_id"] for record in records} == {job_id}
    assert any(r["msg"] == "Lesson generation completed" for r in records)


def test_failed_job_logs_carry_job_id(api, log_stream):
    stream = log_stream()
    job_id = "Structured_Logging_job_failure"

    with patch.object(api.gemini_client.models, "generate_content", side_effect=Exception("gemini down")), \
         patch.object(api.groq_client.chat.completions, "create", side_effect=Exception("groq down")):
        asyncio.run(api.process_lesson(make_request(api), job_id))

    records = stream.records()
    assert any(r["level"] == "ERROR" for r in records)
    assert all(r["job_id"] == job_id for r in records)


def test_job_id_is_released_after_the_job(api, log_stream):
    stream = log_stream()

    run_successful_job(api, "Structured_Logging_job_release")
    logging.getLogger("after_job").info("outside any job")

    last = stream.records()[-1]
    assert last["msg"] == "outside any job"
    assert last["job_id"] is None


def test_concurrent_jobs_do_not_mix_job_ids(logging_config, log_stream):
    stream = log_stream()
    probe = logging.getLogger("concurrency_probe")

    async def worker(job_id):
        with logging_config.bind_job_id(job_id):
            probe.info("start %s", job_id)
            await asyncio.sleep(0.01)
            probe.info("end %s", job_id)

    async def main():
        await asyncio.gather(*(worker(f"job-{n}") for n in range(5)))

    asyncio.run(main())

    records = stream.records()
    assert len(records) == 10
    for record in records:
        assert record["msg"].split()[1] == record["job_id"]


# ----------------------------------------------------------------------------
# Formats
# ----------------------------------------------------------------------------

def test_json_format_produces_parseable_lines_with_fields(api, log_stream):
    stream = log_stream("json")

    run_successful_job(api, "Structured_Logging_job_json", topic="React Hooks")

    records = stream.records()
    for record in records:
        assert {"ts", "level", "logger", "request_id", "job_id", "msg"} <= record.keys()
        assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", record["ts"])
    started = next(r for r in records if r["msg"] == "Lesson generation started")
    assert started["topic"] == "React Hooks"
    assert started["level"] == "INFO"
    assert any(r["level"] == "WARNING" for r in records)


def test_text_format_shows_ids_and_keeps_one_line_per_record(api, logging_config, log_stream):
    stream = log_stream("text")

    with logging_config.bind_job_id("job-text"), \
         patch.object(logging_config, "request_id_var") as request_id_var:
        request_id_var.get.return_value = "req-text"
        api.log_event("OK", "Something happened", topic="Line1\nLine2")

    output = stream.getvalue()
    assert output.count("\n") == 1
    assert "[req=req-text job=job-text]" in output
    assert "Something happened | stage=OK | topic=Line1\\nLine2" in output


def test_json_format_records_exceptions(log_stream):
    stream = log_stream("json")

    try:
        raise ValueError("boom")
    except ValueError:
        logging.getLogger("exc_probe").error("failed", exc_info=True)

    assert "ValueError: boom" in stream.records()[-1]["exc"]


# ----------------------------------------------------------------------------
# End to end
# ----------------------------------------------------------------------------

def test_generate_job_logs_carry_request_id_and_job_id(api, log_stream):
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

    job_records = [r for r in stream.records() if r["job_id"]]
    assert job_records
    assert {r["job_id"] for r in job_records} == {job_id}
    assert {r["request_id"] for r in job_records} == {"req-e2e-1"}
