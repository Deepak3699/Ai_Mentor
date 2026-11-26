import logging
from unittest.mock import MagicMock, patch

import backend.graceful_server as graceful_server
from backend.utils.logging_utils import configure_logging


def test_configure_logging_respects_env_level(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_LOG_LEVEL", "DEBUG")

    with patch("backend.utils.logging_utils.logging.basicConfig") as mock_basic_config:
        configure_logging()

    mock_basic_config.assert_called_once_with(
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def test_graceful_server_main_configures_logging_and_starts_server():
    mock_server_instance = MagicMock()

    with (
        patch("backend.graceful_server.configure_logging") as mock_configure_logging,
        patch("backend.graceful_server.Config") as mock_config,
        patch(
            "backend.graceful_server.GracefulServer",
            return_value=mock_server_instance,
        ) as mock_server_cls,
    ):
        graceful_server.main()

    mock_configure_logging.assert_called_once()
    mock_config.assert_called_once_with(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        timeout_graceful_shutdown=30,
    )
    mock_server_cls.assert_called_once_with(mock_config.return_value)
    mock_server_instance.run.assert_called_once()