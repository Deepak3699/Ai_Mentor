import logging
import os
from pathlib import Path

import pytest


API_FILE = Path(__file__).resolve().parents[1] / "api.py"


@pytest.fixture
def celebrity_video_module(tmp_path):
    """Load the helper without importing the AI service or its external clients."""
    source = API_FILE.read_text(encoding="utf-8")
    start = source.index("ALLOWED_CELEBRITIES =")
    end = source.index("# --------------------------\n# Serve Files", start)
    helper_source = source[start:end]

    module_globals = {
        "os": os,
        "BASE_DIR": str(tmp_path),
        "logger": logging.getLogger("test_renderer"),
    }
    exec(compile(helper_source, str(API_FILE), "exec"), module_globals)

    input_dir = tmp_path / "backend" / "input"
    input_dir.mkdir(parents=True)

    for name in ("modi", "owl", "salman", "srk"):
        (input_dir / f"{name}.mp4").write_bytes(b"test video")

    return module_globals, input_dir


@pytest.mark.parametrize("name", ["modi", "owl", "salman", "srk", "SRK"])
def test_allowed_celebrity_selects_expected_video(celebrity_video_module, name):
    module, input_dir = celebrity_video_module

    result = module["get_celebrity_video"](name)

    assert Path(result) == input_dir / f"{name.lower()}.mp4"


@pytest.mark.parametrize(
    "name",
    [
        "../../outside",
        "../../../../tmp/evil",
        "/tmp/evil",
        r"..\\..\\outside",
        "%2e%2e%2f%2e%2e%2foutside",
        "unknown",
    ],
)
def test_invalid_celebrity_falls_back_to_modi(celebrity_video_module, name):
    module, input_dir = celebrity_video_module

    result = module["get_celebrity_video"](name)

    assert Path(result) == input_dir / "modi.mp4"


def test_logs_do_not_contain_absolute_video_path(
    celebrity_video_module, caplog
):
    module, input_dir = celebrity_video_module

    with caplog.at_level(logging.INFO, logger="test_renderer"):
        module["get_celebrity_video"]("srk")
        module["get_celebrity_video"]("modi")

    assert "srk" in caplog.text.lower()
    assert str(input_dir) not in caplog.text
    assert str(input_dir.parent) not in caplog.text


def test_missing_allowed_video_falls_back_to_modi(
    celebrity_video_module,
):
    module, input_dir = celebrity_video_module
    (input_dir / "srk.mp4").unlink()

    result = module["get_celebrity_video"]("srk")

    assert Path(result) == input_dir / "modi.mp4"
