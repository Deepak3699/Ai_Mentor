import logging
import logging.config
import subprocess
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


class ListHandler(logging.Handler):
    """Collects records so a test can see what a logger's own handlers received."""

    def __init__(self):
        super().__init__()
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage())


def service_handlers(logging_config):
    return [
        handler
        for handler in logging.getLogger().handlers
        if any(isinstance(f, logging_config.CorrelationFilter) for f in handler.filters)
    ]


# ----------------------------------------------------------------------------
# Isolation
# ----------------------------------------------------------------------------

def test_repeated_configuration_does_not_duplicate_records(logging_config, isolated_logging, log_capture):
    stream = log_capture()

    for _ in range(3):
        logging_config.configure_logging(log_format="json", stream=stream)
    logging.getLogger("duplicates_probe").info("only once")

    assert len(service_handlers(logging_config)) == 1
    assert [r["msg"] for r in stream.records()] == ["only once"]


def test_unrelated_root_handlers_are_preserved(logging_config, isolated_logging, log_capture):
    root = logging.getLogger()
    before_config, after_config = ListHandler(), ListHandler()
    root.addHandler(before_config)
    logging_config.configure_logging(log_format="json", stream=log_capture())
    root.addHandler(after_config)

    logging.getLogger("host_probe").warning("shared")
    assert before_config.messages == ["shared"]
    assert after_config.messages == ["shared"]

    logging_config.reset_logging()
    assert before_config in root.handlers and after_config in root.handlers
    assert service_handlers(logging_config) == []


def test_reset_restores_root_level_and_noisy_loggers(logging_config, isolated_logging, log_capture):
    root = logging.getLogger()
    root.setLevel(logging.ERROR)
    logging.getLogger("httpx").setLevel(logging.NOTSET)

    logging_config.configure_logging(level="DEBUG", stream=log_capture())
    assert root.level == logging.DEBUG
    assert logging.getLogger("httpx").level == logging.WARNING

    logging_config.reset_logging()
    assert root.level == logging.ERROR
    assert logging.getLogger("httpx").level == logging.NOTSET


def test_noisy_logger_level_chosen_by_the_host_is_respected(logging_config, isolated_logging, log_capture):
    logging.getLogger("httpx").setLevel(logging.DEBUG)

    logging_config.configure_logging(stream=log_capture())
    assert logging.getLogger("httpx").level == logging.DEBUG

    logging_config.reset_logging()
    assert logging.getLogger("httpx").level == logging.DEBUG


def test_reset_without_configuration_is_a_noop(logging_config, isolated_logging):
    logging_config.reset_logging()
    logging_config.reset_logging()


def test_uvicorn_logging_does_not_duplicate_service_records(logging_config, isolated_logging, log_capture):
    from uvicorn.config import LOGGING_CONFIG

    logging.config.dictConfig(LOGGING_CONFIG)  # what uvicorn does when it starts
    uvicorn_side = ListHandler()
    logging.getLogger("uvicorn").addHandler(uvicorn_side)
    stream = log_capture()
    logging_config.configure_logging(log_format="json", stream=stream)

    logging.getLogger("api").info("service record")
    logging.getLogger("uvicorn.error").info("host record")

    assert [r["msg"] for r in stream.records()] == ["service record"]
    assert uvicorn_side.messages == ["host record"]


# ----------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------

def test_settings_are_read_from_the_environment_when_configuring(
    logging_config, isolated_logging, monkeypatch, log_capture):
    monkeypatch.setenv("LOG_FORMAT", "JSON")
    monkeypatch.setenv("AI_SERVICE_LOG_LEVEL", "debug")
    stream = log_capture()

    logging_config.configure_logging(stream=stream)
    logging.getLogger("env_probe").debug("verbose detail")

    record = stream.records()[-1]
    assert record["msg"] == "verbose detail"
    assert record["level"] == "DEBUG"


def test_defaults_are_text_format_and_info_level(logging_config, isolated_logging, monkeypatch, log_capture):
    monkeypatch.delenv("LOG_FORMAT", raising=False)
    monkeypatch.delenv("AI_SERVICE_LOG_LEVEL", raising=False)
    stream = log_capture()

    logging_config.configure_logging(stream=stream)
    logging.getLogger("default_probe").debug("hidden")
    logging.getLogger("default_probe").info("shown")

    assert "hidden" not in stream.getvalue()
    assert "INFO" in stream.getvalue() and "[req=- job=-] shown" in stream.getvalue()
    assert stream.getvalue().count("\n") == 1


@pytest.mark.parametrize("bad_format", ["yaml", "xml", "json\nx", "j" * 500])
def test_unsupported_log_format_falls_back_to_text_with_one_warning(
    logging_config, isolated_logging, monkeypatch, bad_format, log_capture):
    monkeypatch.setenv("LOG_FORMAT", bad_format)
    stream = log_capture()

    logging_config.configure_logging(stream=stream)

    output = stream.getvalue()
    lines = output.splitlines()
    assert len(lines) == 1, "exactly one warning, on exactly one line"
    assert "WARNING" in lines[0] and "Unsupported LOG_FORMAT" in lines[0]
    assert "using 'text'" in lines[0]
    assert len(lines[0]) < 300, "the rejected value is truncated"
    assert not lines[0].startswith("{"), "fell back to the text formatter"


@pytest.mark.parametrize("bad_level", ["VERBOSE", "10", "basicConfig", "info please", "x" * 500])
def test_unsupported_log_level_falls_back_to_info_with_one_warning(
    logging_config, isolated_logging, monkeypatch, bad_level, log_capture):
    monkeypatch.setenv("AI_SERVICE_LOG_LEVEL", bad_level)
    stream = log_capture()

    logging_config.configure_logging(log_format="json", stream=stream)

    records = stream.records()
    assert len(records) == 1
    assert records[0]["level"] == "WARNING"
    assert "Unsupported AI_SERVICE_LOG_LEVEL" in records[0]["msg"]
    assert "using 'INFO'" in records[0]["msg"]
    assert logging.getLogger().level == logging.INFO


@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_settings_use_defaults_without_warning(
    logging_config, isolated_logging, monkeypatch, blank, log_capture):
    monkeypatch.setenv("LOG_FORMAT", blank)
    monkeypatch.setenv("AI_SERVICE_LOG_LEVEL", blank)
    stream = log_capture()

    logging_config.configure_logging(stream=stream)

    assert stream.getvalue() == ""
    assert logging.getLogger().level == logging.INFO


def test_explicit_arguments_override_the_environment(logging_config, isolated_logging, monkeypatch, log_capture):
    monkeypatch.setenv("LOG_FORMAT", "text")
    monkeypatch.setenv("AI_SERVICE_LOG_LEVEL", "ERROR")
    stream = log_capture()

    logging_config.configure_logging(log_format="json", level="INFO", stream=stream)
    logging.getLogger("override_probe").info("from argument")

    assert stream.records()[-1]["msg"] == "from argument"


# ----------------------------------------------------------------------------
# Startup path (no import-time side effects)
# ----------------------------------------------------------------------------

def test_importing_the_service_does_not_configure_logging(backend_subprocess_env):
    env, backend_dir = backend_subprocess_env
    code = (
        "import logging\n"
        "import api\n"
        "from logging_config import CorrelationFilter\n"
        "root = logging.getLogger()\n"
        "ours = any(isinstance(f, CorrelationFilter) for h in root.handlers for f in h.filters)\n"
        "print(ours, root.level)\n"
    )

    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=backend_dir, env=env, capture_output=True, text=True, check=True, timeout=120,
    )

    assert result.stdout.split() == ["False", str(logging.WARNING)]


def test_lifespan_configures_logging_on_startup_and_resets_on_shutdown(
    api, logging_config, isolated_logging, monkeypatch
):
    monkeypatch.setattr(api, "shutting_down", False)  # the lifespan flips this on shutdown
    assert service_handlers(logging_config) == []

    with patch.object(api, "check_ffmpeg"), TestClient(api.app):
        assert len(service_handlers(logging_config)) == 1

    assert service_handlers(logging_config) == []
    assert logging.getLogger().handlers == isolated_logging[""][1]
