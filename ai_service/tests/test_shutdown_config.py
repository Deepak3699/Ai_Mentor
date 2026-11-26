
import os
import subprocess
import sys
from pathlib import Path


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]


def run_config_import(value=None):
    env = os.environ.copy()

    if value is None:
        env.pop("JOB_SHUTDOWN_GRACE_PERIOD_SECONDS", None)
    else:
        env["JOB_SHUTDOWN_GRACE_PERIOD_SECONDS"] = value

    return subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from backend.config import "
                "JOB_SHUTDOWN_GRACE_PERIOD_SECONDS; "
                "print(JOB_SHUTDOWN_GRACE_PERIOD_SECONDS)"
            ),
        ],
        cwd=AI_SERVICE_DIR,
        env=env,
        capture_output=True,
        text=True,
    )


def test_shutdown_grace_period_defaults_to_30():
    result = run_config_import()

    assert result.returncode == 0
    assert result.stdout.strip() == "30.0"


def test_shutdown_grace_period_accepts_zero():
    result = run_config_import("0")

    assert result.returncode == 0
    assert result.stdout.strip() == "0.0"


def test_shutdown_grace_period_rejects_negative_value():
    result = run_config_import("-5")

    assert result.returncode != 0
    assert "JOB_SHUTDOWN_GRACE_PERIOD_SECONDS" in result.stderr


def test_shutdown_grace_period_rejects_non_numeric_value():
    result = run_config_import("invalid")

    assert result.returncode != 0
    assert "JOB_SHUTDOWN_GRACE_PERIOD_SECONDS" in result.stderr


def test_shutdown_grace_period_rejects_non_finite_values():
    for value in ("NaN", "inf", "-inf"):
        result = run_config_import(value)

        assert result.returncode != 0
        assert "JOB_SHUTDOWN_GRACE_PERIOD_SECONDS" in result.stderr
