import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import voices


def test_known_voice_is_returned_unchanged():
    assert voices.get_voice("en-IN-NeerjaNeural") == "en-IN-NeerjaNeural"


def test_missing_or_unknown_voice_falls_back_to_default():
    assert voices.get_voice("") == voices.DEFAULT_VOICE_ID
    assert voices.get_voice("unknown-voice") == voices.DEFAULT_VOICE_ID


def test_all_voices_contains_complete_metadata():
    available = voices.get_all_voices()
    assert len(available) == len(voices.VOICE_REGISTRY)
    required = {"voice_id", "name", "gender", "language", "accent", "description"}
    for entry in available:
        assert required.issubset(entry)
        assert entry["voice_id"] in voices.VOICE_REGISTRY


def test_default_voice_exists_in_registry():
    assert voices.DEFAULT_VOICE_ID in voices.VOICE_REGISTRY
