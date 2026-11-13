from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import edge_tts

logger = logging.getLogger(__name__)

# Base directory for resolving assets (ai_service root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ALLOWED_CELEBRITIES = {"modi", "owl", "salman", "srk"}

VIDEO_WIDTH = 1280
VIDEO_HEIGHT = 720


def check_ffmpeg() -> None:
    """Verify that FFmpeg is available before starting the service."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        logger.info("FFmpeg is available.")
    except FileNotFoundError:
        logger.error(
            "FFmpeg is not installed or not available in PATH. "
            "Install FFmpeg before starting the AI service."
        )
        raise RuntimeError(
            "FFmpeg is required to start the AI service but was not found in PATH."
        )
    except subprocess.CalledProcessError as exc:
        logger.error(
            "FFmpeg availability check failed with exit code %s.",
            exc.returncode,
        )
        raise RuntimeError(
            "FFmpeg is required to start the AI service but the availability check failed."
        ) from exc


async def generate_tts(
    text: str,
    output_file: str,
    voice_id: str = "en-US-GuyNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> None:
    """Generate audio narration using edge_tts."""
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice_id,
        rate=rate,
        pitch=pitch,
    )
    await communicate.save(output_file)


def get_celebrity_video(celebrity_name: str, base_dir: str | None = None) -> str:
    """Select the valid video path for the requested celebrity, or fall back to modi."""
    effective_base = base_dir or BASE_DIR
    input_video_dir = os.path.realpath(
        os.path.join(effective_base, "backend", "input")
    )

    name = celebrity_name.strip().lower() if isinstance(celebrity_name, str) else ""
    if name not in ALLOWED_CELEBRITIES:
        name = "modi"

    candidate = os.path.realpath(
        os.path.join(input_video_dir, f"{name}.mp4")
    )

    if (
        os.path.commonpath([input_video_dir, candidate]) == input_video_dir
        and os.path.isfile(candidate)
    ):
        print(f"[INFO] Renderer source selected | source={name}", flush=True)
        return candidate

    fallback = os.path.realpath(os.path.join(input_video_dir, "modi.mp4"))
    print("[INFO] Default renderer source selected | source=modi", flush=True)
    return fallback


def build_landscape_video_filter() -> str:
    """Return the shared uncropped 16:9 blurred-background composition."""
    return (
        f"[0:v]split=2[background][foreground];"
        f"[background]scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=increase,"
        f"crop={VIDEO_WIDTH}:{VIDEO_HEIGHT},gblur=sigma=28[blurred];"
        f"[foreground]scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease[main];"
        f"[blurred][main]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[video]"
    )


def build_avatar_normalization_args(input_video: str, output_path: str) -> list[str]:
    """Normalize a downloaded avatar video while preserving its own audio."""
    return [
        "ffmpeg", "-y", "-i", input_video, "-filter_complex", build_landscape_video_filter(),
        "-map", "[video]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium",
        "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", output_path,
    ]


def build_fallback_ffmpeg_args(input_video: str, audio_path: str, output_path: str) -> list[str]:
    """Create an uncropped 16:9 lesson video with a blurred background."""
    return [
        "ffmpeg", "-y", "-stream_loop", "-1", "-i", input_video, "-i", audio_path,
        "-filter_complex", build_landscape_video_filter(), "-map", "[video]", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac",
        "-movflags", "+faststart", "-shortest", output_path,
    ]


async def run_ffmpeg_command(args: list[str]) -> tuple[int, str]:
    """Run FFmpeg and always return its exit code and safely decoded diagnostics."""
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await process.communicate()
    error_message = stderr.decode(errors="replace") if stderr else ""
    return process.returncode, error_message


def probe_video_metadata(video_path: str) -> dict:
    """Return safe delivery metadata without exposing local paths."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,codec_name,avg_frame_rate,bit_rate", "-of", "json", video_path],
        check=True, capture_output=True, text=True,
    )
    stream = (json.loads(result.stdout).get("streams") or [{}])[0]
    return {
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "codec": stream.get("codec_name") or "unknown",
        "frame_rate": stream.get("avg_frame_rate") or "unknown",
        "bit_rate": int(stream.get("bit_rate") or 0),
    }
