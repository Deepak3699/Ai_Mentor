import json

import pytest

from backend.services import media_processor


@pytest.mark.asyncio
async def test_generate_tts_returns_word_boundary_metadata(monkeypatch, tmp_path):
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
    ]

    calls = {}

    class FakeCommunicate:
        def __init__(self, **kwargs):
            calls["init"] = kwargs

        async def save(self, output_file, metadata_fname=None):
            calls["save"] = metadata_fname
            with open(output_file, "wb") as audio:
                audio.write(b"fake audio")

            with open(metadata_fname, "w", encoding="utf-8") as metadata:
                for event in events:
                    metadata.write(json.dumps(event) + "\n")

    monkeypatch.setattr(
        media_processor.edge_tts,
        "Communicate",
        FakeCommunicate,
    )

    output_file = str(tmp_path / "lesson.mp3")
    metadata_file = output_file + ".word-boundaries.jsonl"

    result = await media_processor.generate_tts(
        "Hello there.",
        output_file,
    )

    assert result == events
    assert calls["init"]["boundary"] == "WordBoundary"
    assert calls["init"]["text"] == "Hello there."
    assert calls["save"] == metadata_file
    assert (tmp_path / "lesson.mp3").exists()
    assert not (tmp_path / "lesson.mp3.word-boundaries.jsonl").exists()


@pytest.mark.asyncio
async def test_generate_tts_returns_none_when_metadata_is_missing(
    monkeypatch,
    tmp_path,
):
    class FakeCommunicate:
        def __init__(self, **kwargs):
            pass

        async def save(self, output_file, metadata_fname=None):
            with open(output_file, "wb") as audio:
                audio.write(b"fake audio")

    monkeypatch.setattr(
        media_processor.edge_tts,
        "Communicate",
        FakeCommunicate,
    )

    result = await media_processor.generate_tts(
        "Hello there.",
        str(tmp_path / "lesson.mp3"),
    )

    assert result is None


@pytest.mark.asyncio
async def test_generate_tts_returns_none_for_malformed_metadata(
    monkeypatch,
    tmp_path,
):
    class FakeCommunicate:
        def __init__(self, **kwargs):
            pass

        async def save(self, output_file, metadata_fname=None):
            with open(output_file, "wb") as audio:
                audio.write(b"fake audio")

            with open(metadata_fname, "w", encoding="utf-8") as metadata:
                metadata.write("{invalid json}\n")

    monkeypatch.setattr(
        media_processor.edge_tts,
        "Communicate",
        FakeCommunicate,
    )

    output_file = str(tmp_path / "lesson.mp3")
    metadata_file = output_file + ".word-boundaries.jsonl"

    result = await media_processor.generate_tts(
        "Hello there.",
        output_file,
    )

    assert result is None
    assert not (tmp_path / "lesson.mp3.word-boundaries.jsonl").exists()


@pytest.mark.asyncio
async def test_generate_tts_propagates_audio_generation_errors(
    monkeypatch,
    tmp_path,
):
    class FakeCommunicate:
        def __init__(self, **kwargs):
            pass

        async def save(self, output_file, metadata_fname=None):
            raise RuntimeError("TTS generation failed")

    monkeypatch.setattr(
        media_processor.edge_tts,
        "Communicate",
        FakeCommunicate,
    )

    with pytest.raises(RuntimeError, match="TTS generation failed"):
        await media_processor.generate_tts(
            "Hello there.",
            str(tmp_path / "lesson.mp3"),
        )
