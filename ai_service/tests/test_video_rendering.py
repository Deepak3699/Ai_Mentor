import json
import subprocess
import pytest
from unittest.mock import AsyncMock, MagicMock
import api


def test_fallback_command_creates_landscape_canvas_without_stretching():
    args = api.build_fallback_ffmpeg_args("portrait.mp4", "lesson.mp3", "lesson.mp4")
    graph = args[args.index("-filter_complex") + 1]
    assert "scale=1280:720:force_original_aspect_ratio=increase" in graph
    assert "crop=1280:720" in graph
    assert "gblur=sigma=28" in graph
    assert "scale=1280:720:force_original_aspect_ratio=decrease" in graph
    assert "overlay=(W-w)/2:(H-h)/2" in graph
    assert args[args.index("-c:v") + 1] == "libx264"
    assert "copy" not in args
    assert args[args.index("-movflags") + 1] == "+faststart"


def test_probe_video_metadata_returns_safe_normalized_values(monkeypatch):
    payload = {"streams": [{"width": 1280, "height": 720, "codec_name": "h264", "avg_frame_rate": "30/1", "bit_rate": "1500000"}]}
    monkeypatch.setattr(subprocess, "run", MagicMock(return_value=subprocess.CompletedProcess([], 0, stdout=json.dumps(payload), stderr="")))
    assert api.probe_video_metadata("video.mp4") == {"width": 1280, "height": 720, "codec": "h264", "frame_rate": "30/1", "bit_rate": 1500000}

def test_avatar_normalization_preserves_audio_and_uses_landscape_filter():
    args = api.build_avatar_normalization_args("avatar-source.mp4", "lesson.mp4")
    graph = args[args.index("-filter_complex") + 1]
    assert "scale=1280:720:force_original_aspect_ratio=increase" in graph
    assert "scale=1280:720:force_original_aspect_ratio=decrease" in graph
    assert args[args.index("-map") + 1] == "[video]"
    assert "0:a?" in args
    assert "-stream_loop" not in args
    assert args[args.index("-c:v") + 1] == "libx264"
    assert args[args.index("-movflags") + 1] == "+faststart"

@pytest.mark.asyncio
async def test_run_ffmpeg_command_returns_success_with_empty_diagnostics(monkeypatch):
    process = MagicMock(returncode=0)
    process.communicate = AsyncMock(return_value=(b"", b""))
    create_process = AsyncMock(return_value=process)
    monkeypatch.setattr(api.asyncio, "create_subprocess_exec", create_process)

    returncode, error_message = await api.run_ffmpeg_command(["ffmpeg", "-version"])

    assert returncode == 0
    assert error_message == ""
    process.communicate.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_run_ffmpeg_command_captures_nonzero_stderr(monkeypatch):
    process = MagicMock(returncode=1)
    process.communicate = AsyncMock(return_value=(b"ignored", b"render failed"))
    monkeypatch.setattr(
        api.asyncio,
        "create_subprocess_exec",
        AsyncMock(return_value=process),
    )

    returncode, error_message = await api.run_ffmpeg_command(["ffmpeg", "bad-input"])

    assert returncode == 1
    assert error_message == "render failed"


@pytest.mark.asyncio
async def test_run_ffmpeg_command_tolerates_missing_stderr(monkeypatch):
    process = MagicMock(returncode=1)
    process.communicate = AsyncMock(return_value=(b"", None))
    monkeypatch.setattr(
        api.asyncio,
        "create_subprocess_exec",
        AsyncMock(return_value=process),
    )

    returncode, error_message = await api.run_ffmpeg_command(["ffmpeg"])

    assert returncode == 1
    assert error_message == ""


@pytest.mark.asyncio
async def test_ai_disclosure_watermark_renders_and_replaces_original(
    tmp_path, monkeypatch
):
    from pathlib import Path
    from PIL import Image
    from backend.services import media_processor

    video_path = tmp_path / "lesson.mp4"
    video_path.write_bytes(b"original-video")

    async def fake_ffmpeg(args):
        watermark_path = Path(f"{video_path}.disclosure.png")
        output_path = Path(args[-1])

        assert watermark_path.is_file()
        with Image.open(watermark_path) as watermark:
            assert watermark.size == (500, 70)
            assert watermark.getbbox() is not None

        assert "-filter_complex" in args
        assert "overlay=W-w-30:H-h-30:format=auto" in args
        assert "-map" in args
        assert "0:a?" in args

        output_path.write_bytes(b"watermarked-video")
        return 0, ""

    monkeypatch.setattr(media_processor, "run_ffmpeg_command", fake_ffmpeg)

    await api.apply_ai_disclosure_watermark(str(video_path))

    assert video_path.read_bytes() == b"watermarked-video"
    assert not Path(f"{video_path}.disclosure.png").exists()
    assert not Path(f"{video_path}.disclosed.mp4").exists()


@pytest.mark.asyncio
async def test_ai_disclosure_watermark_failure_removes_undisclosed_video(
    tmp_path, monkeypatch
):
    from pathlib import Path
    from backend.services import media_processor

    video_path = tmp_path / "lesson.mp4"
    video_path.write_bytes(b"original-video")

    async def failed_ffmpeg(args):
        Path(args[-1]).write_bytes(b"partial-output")
        return 1, "simulated watermark rendering failure"

    monkeypatch.setattr(media_processor, "run_ffmpeg_command", failed_ffmpeg)

    with pytest.raises(RuntimeError, match="AI disclosure watermark rendering failed"):
        await api.apply_ai_disclosure_watermark(str(video_path))

    assert not video_path.exists()
    assert not Path(f"{video_path}.disclosure.png").exists()
    assert not Path(f"{video_path}.disclosed.mp4").exists()
