import re
import subprocess


def get_audio_duration(audio_path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def chunk_script(text: str, max_words: int = 12) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        words = sentence.split()
        for i in range(0, len(words), max_words):
            chunks.append(" ".join(words[i:i + max_words]))
    return chunks


def build_cues(script: str, duration: float) -> list[tuple[float, float, str]]:
    chunks = chunk_script(script)
    total_words = sum(len(c.split()) for c in chunks)
    if total_words == 0:
        return []
    cues, current = [], 0.0
    for chunk in chunks:
        share = len(chunk.split()) / total_words * duration
        cues.append((current, current + share, chunk))
        current += share
    return cues


def _fmt(seconds: float, sep: str) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}{sep}{ms:03}"


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