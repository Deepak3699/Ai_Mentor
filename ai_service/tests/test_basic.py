import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from api import check_ffmpeg


def test_check_ffmpeg_succeeds(monkeypatch):
    def mock_run(*args, **kwargs):
        return subprocess.CompletedProcess(
            args=["ffmpeg", "-version"],
            returncode=0,
        )

    monkeypatch.setattr(subprocess, "run", mock_run)

    check_ffmpeg()


def test_check_ffmpeg_fails_when_missing(monkeypatch):
    def mock_run(*args, **kwargs):
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "run", mock_run)

    with pytest.raises(RuntimeError, match="FFmpeg is required"):
        check_ffmpeg()
