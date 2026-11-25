from backend.utils.subtitles import (
    build_cues,
    chunk_script,
    get_audio_duration,
    _fmt,
)


def write_subtitles(script: str, audio_path: str, out_base: str) -> tuple[str, str]:
    """Creates out_base.vtt and out_base.srt. Returns (vtt_path, srt_path)."""
    duration = get_audio_duration(audio_path)
    cues = build_cues(script, duration)

    vtt_path = out_base + ".vtt"
    srt_path = out_base + ".srt"

    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for start, end, text in cues:
            f.write(f"{_fmt(start, '.')} --> {_fmt(end, '.')}\n{text}\n\n")

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, (start, end, text) in enumerate(cues, 1):
            f.write(f"{i}\n{_fmt(start, ',')} --> {_fmt(end, ',')}\n{text}\n\n")

    return vtt_path, srt_path


__all__ = [
    "get_audio_duration",
    "chunk_script",
    "build_cues",
    "write_subtitles",
]
