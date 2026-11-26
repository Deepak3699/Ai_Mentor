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
