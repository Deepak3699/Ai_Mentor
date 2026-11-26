
import math
import re
import subprocess


TICKS_PER_SECOND = 10_000_000
MAX_WORDS_PER_CUE = 12
MAX_PAUSE_BETWEEN_WORDS = 0.75


def get_audio_duration(audio_path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def chunk_script(text: str, max_words: int = MAX_WORDS_PER_CUE) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text or max_words < 1:
        return []

    chunks = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        words = sentence.split()
        for i in range(0, len(words), max_words):
            chunks.append(" ".join(words[i:i + max_words]))
    return chunks


def _fallback_cues(
    script: str,
    duration: float,
) -> list[tuple[float, float, str]]:
    chunks = chunk_script(script)
    total_words = sum(len(chunk.split()) for chunk in chunks)

    if total_words == 0 or duration <= 0:
        return []

    cues = []
    current = 0.0

    for index, chunk in enumerate(chunks):
        share = len(chunk.split()) / total_words * duration
        end = duration if index == len(chunks) - 1 else current + share
        cues.append((current, end, chunk))
        current = end

    return cues


def _join_event_text(parts: list[str]) -> str:
    """Join Edge TTS word fragments without damaging punctuation."""
    result = ""

    for part in parts:
        if not result:
            result = part
        elif (
            part[:1].isspace()
            or result[-1:].isspace()
            or re.match(r"^[,.;:!?%)\]}]", part)
            or result[-1:] in "([{"
        ):
            result += part
        else:
            result += " " + part

    return re.sub(r"\s+", " ", result).strip()


def _word_events_to_cues(
    events: list,
    duration: float,
    max_words: int = MAX_WORDS_PER_CUE,
) -> list[tuple[float, float, str]] | None:
    """
    Convert Edge TTS WordBoundary events into subtitle cues.

    Edge TTS offsets and durations use 100-nanosecond ticks.
    Returns None when metadata is unusable, allowing fallback timing.
    """
    if not isinstance(events, (list, tuple)) or duration <= 0:
        return None

    word_events = [
        event for event in events
        if isinstance(event, dict) and event.get("type") == "WordBoundary"
    ]

    if not word_events:
        return None

    normalized = []
    previous_start = -1.0

    for event in word_events:
        offset = event.get("offset")
        event_duration = event.get("duration")
        text = event.get("text")

        if (
            isinstance(offset, bool)
            or not isinstance(offset, (int, float))
            or isinstance(event_duration, bool)
            or not isinstance(event_duration, (int, float))
            or not isinstance(text, str)
            or not text.strip()
            or not math.isfinite(offset)
            or not math.isfinite(event_duration)
            or offset < 0
            or event_duration <= 0
        ):
            return None

        start = offset / TICKS_PER_SECOND
        end = (offset + event_duration) / TICKS_PER_SECOND

        # Reject out-of-order metadata instead of producing bad subtitles.
        if start < previous_start:
            return None

        previous_start = start

        if start >= duration:
            continue

        end = min(end, duration)
        if end <= start:
            continue

        normalized.append((start, end, text))

    if not normalized:
        return None

    cues = []
    group = []
    group_words = 0

    def flush_group():
        nonlocal group, group_words

        if not group:
            return

        cue_text = _join_event_text([item[2] for item in group])
        if cue_text:
            cues.append((
                group[0][0],
                max(item[1] for item in group),
                cue_text,
            ))

        group = []
        group_words = 0

    for event in normalized:
        start, end, text = event
        word_count = max(1, len(text.split()))

        # Split subtitle cues when speech contains a meaningful pause.
        if group and start - group[-1][1] > MAX_PAUSE_BETWEEN_WORDS:
            flush_group()

        if group and group_words + word_count > max_words:
            flush_group()

        group.append(event)
        group_words += word_count

        # Preserve sentence breaks as well as the 12-word limit.
        if text.strip().endswith((".", "!", "?")):
            flush_group()

    flush_group()

    # Validate the resulting cue sequence.
    previous_end = 0.0
    for start, end, text in cues:
        if (
            not math.isfinite(start)
            or not math.isfinite(end)
            or start < previous_end
            or end <= start
            or end > duration
            or not text
        ):
            return None
        previous_end = end

    return cues or None


def build_cues(
    script: str,
    duration: float,
    timing_events: list | None = None,
) -> list[tuple[float, float, str]]:
    if not isinstance(script, str) or not script.strip():
        return []

    if (
        isinstance(duration, bool)
        or not isinstance(duration, (int, float))
        or not math.isfinite(duration)
        or duration <= 0
    ):
        return []

    if timing_events is not None:
        timed_cues = _word_events_to_cues(timing_events, duration)
        if timed_cues is not None:
            return timed_cues

    return _fallback_cues(script, duration)


def _fmt(seconds: float, sep: str) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}{sep}{ms:03}"


def write_subtitles(
    script: str,
    audio_path: str,
    out_base: str,
    timing_events: list | None = None,
) -> tuple[str, str]:
    """Create VTT and SRT files from the same subtitle cues."""
    duration = get_audio_duration(audio_path)
    cues = build_cues(script, duration, timing_events)

    vtt_path = out_base + ".vtt"
    srt_path = out_base + ".srt"

    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for start, end, text in cues:
            f.write(
                f"{_fmt(start, '.')} --> {_fmt(end, '.')}\n"
                f"{text}\n\n"
            )

    with open(srt_path, "w", encoding="utf-8") as f:
        for index, (start, end, text) in enumerate(cues, 1):
            f.write(
                f"{index}\n"
                f"{_fmt(start, ',')} --> {_fmt(end, ',')}\n"
                f"{text}\n\n"
            )

    return vtt_path, srt_path
