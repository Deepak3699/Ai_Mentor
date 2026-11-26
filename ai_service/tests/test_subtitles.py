import subprocess

import pytest

from backend.subtitles import build_cues, chunk_script, get_audio_duration, write_subtitles


def test_chunk_script_normalizes_whitespace_and_limits_words():
    chunks = chunk_script("  One   two three four five. Six seven!  ", max_words=3)
    assert chunks == ["One two three", "four five.", "Six seven!"]


def test_build_cues_uses_word_weighting_and_exact_final_duration():
    cues = build_cues("one two. three four five six.", 12.0)
    assert cues == [(0.0, 4.0, "one two."), (4.0, 12.0, "three four five six.")]
    assert build_cues("   ", 5.0) == []


def test_get_audio_duration_invokes_ffprobe(monkeypatch):
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, 0, stdout="20.5\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert get_audio_duration("lesson.mp3") == 20.5
    assert calls[0][0][0] == "ffprobe"
    assert calls[0][1]["check"] is True


def test_get_audio_duration_propagates_ffprobe_failure(monkeypatch):
    def fake_run(*args, **kwargs):
        raise subprocess.CalledProcessError(1, args[0])

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(subprocess.CalledProcessError):
        get_audio_duration("missing.mp3")


def test_write_subtitles_creates_valid_vtt_and_srt(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.subtitles.get_audio_duration", lambda _: 20.0)
    out_base = str(tmp_path / "lesson")
    vtt_path, srt_path = write_subtitles("one two. three four.", "audio.mp3", out_base)
    vtt = (tmp_path / "lesson.vtt").read_text(encoding="utf-8")
    srt = (tmp_path / "lesson.srt").read_text(encoding="utf-8")
    assert vtt_path.endswith("lesson.vtt")
    assert srt_path.endswith("lesson.srt")
    assert vtt.startswith("WEBVTT\n\n")
    assert "00:00:00.000 --> 00:00:10.000" in vtt
    assert "00:00:10.000 --> 00:00:20.000" in vtt
    assert "1\n00:00:00,000 --> 00:00:10,000" in srt
    assert "2\n00:00:10,000 --> 00:00:20,000" in srt


def test_build_cues_uses_word_boundary_timestamps():
    events = [
        {
            "type": "WordBoundary",
            "offset": 0,
            "duration": 4_000_000,
            "text": "Hello",
        },
        {
            "type": "WordBoundary",
            "offset": 5_000_000,
            "duration": 4_000_000,
            "text": " there.",
        },
        {
            "type": "WordBoundary",
            "offset": 20_000_000,
            "duration": 3_000_000,
            "text": "How",
        },
        {
            "type": "WordBoundary",
            "offset": 23_000_000,
            "duration": 2_000_000,
            "text": " are",
        },
        {
            "type": "WordBoundary",
            "offset": 25_000_000,
            "duration": 3_000_000,
            "text": " you?",
        },
    ]

    cues = build_cues("Hello there. How are you?", 5.0, events)

    assert cues == [
        (0.0, 0.9, "Hello there."),
        (2.0, 2.8, "How are you?"),
    ]


def test_build_cues_falls_back_for_invalid_word_metadata():
    events = [
        {
            "type": "WordBoundary",
            "offset": 10_000_000,
            "duration": 2_000_000,
            "text": "Hello",
        },
        {
            "type": "WordBoundary",
            "offset": 0,
            "duration": 2_000_000,
            "text": "there",
        },
    ]

    cues = build_cues("Hello there.", 5.0, events)

    assert cues == [(0.0, 5.0, "Hello there.")]


def test_build_cues_falls_back_when_metadata_is_missing():
    cues = build_cues("Hello there.", 5.0, None)

    assert cues == [(0.0, 5.0, "Hello there.")]


def test_build_cues_falls_back_for_empty_timing_events():
    assert build_cues("Hello there.", 5.0, []) == [
        (0.0, 5.0, "Hello there.")
    ]


def test_build_cues_rejects_malformed_word_event():
    events = [
        {
            "type": "WordBoundary",
            "offset": 0,
            "duration": 0,
            "text": "Hello",
        }
    ]
    assert build_cues("Hello there.", 5.0, events) == [
        (0.0, 5.0, "Hello there.")
    ]


def test_build_cues_clips_events_to_audio_duration():
    events = [
        {
            "type": "WordBoundary",
            "offset": 35_000_000,
            "duration": 20_000_000,
            "text": "Hello",
        }
    ]
    assert build_cues("Hello", 4.0, events) == [
        (3.5, 4.0, "Hello")
    ]


def test_build_cues_respects_maximum_12_words_per_cue():
    words = [f"word{i}" for i in range(13)]
    events = [
        {
            "type": "WordBoundary",
            "offset": i * 1_000_000,
            "duration": 500_000,
            "text": f" {word}" if i else word,
        }
        for i, word in enumerate(words)
    ]

    cues = build_cues(" ".join(words), 5.0, events)

    assert len(cues) == 2
    assert len(cues[0][2].split()) == 12
    assert len(cues[1][2].split()) == 1


def test_timed_vtt_and_srt_use_identical_cue_timestamps(
    monkeypatch, tmp_path
):
    events = [
        {
            "type": "WordBoundary",
            "offset": 0,
            "duration": 5_000_000,
            "text": "Hello",
        },
        {
            "type": "WordBoundary",
            "offset": 20_000_000,
            "duration": 5_000_000,
            "text": " there.",
        },
    ]

    monkeypatch.setattr("backend.subtitles.get_audio_duration", lambda _: 5.0)

    out_base = str(tmp_path / "timed")
    vtt_path, srt_path = write_subtitles(
        "Hello there.", "audio.mp3", out_base, timing_events=events
    )

    vtt = (tmp_path / "timed.vtt").read_text(encoding="utf-8")
    srt = (tmp_path / "timed.srt").read_text(encoding="utf-8")

    assert "00:00:00.000 --> 00:00:00.500" in vtt
    assert "00:00:02.000 --> 00:00:02.500" in vtt
    assert "00:00:00,000 --> 00:00:00,500" in srt
    assert "00:00:02,000 --> 00:00:02,500" in srt


@pytest.mark.parametrize(
    "offset,event_duration",
    [
        (-1, 1_000_000),
        (0, -1_000_000),
        (float("nan"), 1_000_000),
        (float("inf"), 1_000_000),
        (float("-inf"), 1_000_000),
        (0, float("nan")),
        (0, float("inf")),
        (0, float("-inf")),
        (True, 1_000_000),
        (0, True),
        (0, 0),
    ],
)
def test_build_cues_falls_back_for_invalid_numeric_timing(
    offset, event_duration
):
    events = [
        {
            "type": "WordBoundary",
            "offset": offset,
            "duration": event_duration,
            "text": "Hello",
        }
    ]
    assert build_cues("Hello there.", 5.0, events) == [
        (0.0, 5.0, "Hello there.")
    ]


def test_build_cues_falls_back_when_all_events_start_after_audio():
    events = [
        {
            "type": "WordBoundary",
            "offset": 60_000_000,
            "duration": 1_000_000,
            "text": "Hello",
        }
    ]

    assert build_cues("Hello there.", 5.0, events) == [
        (0.0, 5.0, "Hello there.")
    ]
