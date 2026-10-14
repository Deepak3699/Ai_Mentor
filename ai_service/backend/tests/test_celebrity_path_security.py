import os
from pathlib import Path

import pytest


API_FILE = Path("ai_service/backend/api.py").resolve()


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
        "print": print,
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
    celebrity_video_module, capsys
):
    module, input_dir = celebrity_video_module

    module["get_celebrity_video"]("srk")
    output = capsys.readouterr().out

    assert "srk" in output.lower()
    assert str(input_dir) not in output
    assert str(Path(module["get_celebrity_video"]("modi")).parent) not in output


def test_missing_allowed_video_falls_back_to_modi(
    celebrity_video_module,
):
    module, input_dir = celebrity_video_module
    (input_dir / "srk.mp4").unlink()

    result = module["get_celebrity_video"]("srk")

    assert Path(result) == input_dir / "modi.mp4"

