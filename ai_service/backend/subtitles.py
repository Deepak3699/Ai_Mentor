from backend.utils.subtitles import (
    build_cues,
    chunk_script,
    get_audio_duration,
    _fmt,
)


def write_subtitles(
    script: str,
    audio_path: str,
    out_base: str,
    timing_events: list | None = None,
) -> tuple[str, str]:
    """Create VTT and SRT files, preserving compatibility with existing callers."""
    duration = get_audio_duration(audio_path)
    cues = build_cues(script, duration, timing_events)

    vtt_path = out_base + ".vtt"
    srt_path = out_base + ".srt"

    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for start, end, text in cues:
            f.write(f"{_fmt(start, '.')} --> {_fmt(end, '.')}\n{text}\n\n")

    with open(srt_path, "w", encoding="utf-8") as f:
        for index, (start, end, text) in enumerate(cues, 1):
            f.write(
                f"{index}\n"
                f"{_fmt(start, ',')} --> {_fmt(end, ',')}\n"
                f"{text}\n\n"
            )

    return vtt_path, srt_path


__all__ = [
    "get_audio_duration",
    "chunk_script",
    "build_cues",
    "write_subtitles",
]
