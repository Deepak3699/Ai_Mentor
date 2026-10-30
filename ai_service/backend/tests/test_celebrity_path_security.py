import sys
from pathlib import Path

import pytest

SERVICE_ROOT = Path(__file__).resolve().parents[2]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from backend.services.media_processor import get_celebrity_video


@pytest.fixture
def celebrity_video_module(tmp_path):
    input_dir = tmp_path / "backend" / "input"
    input_dir.mkdir(parents=True)

    for name in ("modi", "owl", "salman", "srk"):
        (input_dir / f"{name}.mp4").write_bytes(b"test video")

    return (
        lambda name: get_celebrity_video(name, base_dir=str(tmp_path)),
        input_dir,
    )


@pytest.mark.parametrize("name", ["modi", "owl", "salman", "srk", "SRK"])
def test_allowed_celebrity_selects_expected_video(celebrity_video_module, name):
    select_video, input_dir = celebrity_video_module

    result = select_video(name)

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
    select_video, input_dir = celebrity_video_module

    result = select_video(name)

    assert Path(result) == input_dir / "modi.mp4"


def test_logs_do_not_contain_absolute_video_path(
    celebrity_video_module, capsys
):
    select_video, input_dir = celebrity_video_module

    select_video("srk")
    output = capsys.readouterr().out

    assert "srk" in output.lower()
    assert str(input_dir) not in output
    assert str(Path(select_video("modi")).parent) not in output


def test_missing_allowed_video_falls_back_to_modi(
    celebrity_video_module,
):
    select_video, input_dir = celebrity_video_module
    (input_dir / "srk.mp4").unlink()

    result = select_video("srk")

    assert Path(result) == input_dir / "modi.mp4"
