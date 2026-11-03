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


def ids(entries):
    return {entry["voice_id"] for entry in entries}


def test_no_filters_returns_full_registry():
    assert ids(voices.get_all_voices()) == set(voices.VOICE_REGISTRY)
    assert ids(voices.get_all_voices(language=None, gender=None)) == set(voices.VOICE_REGISTRY)
    assert ids(voices.get_all_voices(language="", gender="")) == set(voices.VOICE_REGISTRY)


def test_filter_by_language_only():
    spanish = voices.get_all_voices(language="Spanish")
    assert ids(spanish) == {"es-ES-AlvaroNeural", "es-ES-ElviraNeural"}
    assert all(v["language"] == "Spanish" for v in spanish)


def test_filter_by_gender_only():
    female = voices.get_all_voices(gender="Female")
    assert female
    assert all(v["gender"] == "Female" for v in female)
    expected = {k for k, v in voices.VOICE_REGISTRY.items() if v["gender"] == "Female"}
    assert ids(female) == expected


def test_filters_combine_with_and():
    result = voices.get_all_voices(language="English", gender="Male")
    assert ids(result) == {"en-US-GuyNeural", "en-GB-RyanNeural", "en-IN-PrabhatNeural"}
    assert ids(voices.get_all_voices(language="French", gender="Female")) == {"fr-FR-DeniseNeural"}


def test_filters_are_case_insensitive_and_trim_whitespace():
    expected = ids(voices.get_all_voices(language="English", gender="Female"))
    assert expected
    assert ids(voices.get_all_voices(language="english", gender="FEMALE")) == expected
    assert ids(voices.get_all_voices(language=" EnGlIsH ", gender=" female ")) == expected


def test_unknown_values_return_empty_list():
    assert voices.get_all_voices(language="Klingon") == []
    assert voices.get_all_voices(gender="Unknown") == []
    assert voices.get_all_voices(language="English", gender="Unknown") == []
    assert voices.get_all_voices(language="Klingon", gender="Female") == []


def test_filtering_does_not_mutate_registry():
    before = dict(voices.VOICE_REGISTRY)
    voices.get_all_voices(language="English", gender="Male").clear()
    assert voices.VOICE_REGISTRY == before


def test_voices_endpoint_applies_filters():
    import api

    assert ids(api.get_voices()["voices"]) == set(voices.VOICE_REGISTRY)
    assert ids(api.get_voices(language="spanish")["voices"]) == {"es-ES-AlvaroNeural", "es-ES-ElviraNeural"}
    assert ids(api.get_voices(gender="female")["voices"]) == {
        k for k, v in voices.VOICE_REGISTRY.items() if v["gender"] == "Female"
    }
    assert ids(api.get_voices(language="French", gender="male")["voices"]) == {"fr-FR-HenriNeural"}
    assert api.get_voices(language="Hindi", gender="Female") == {"voices": []}


def test_voices_endpoint_exposes_optional_query_parameters():
    import api

    params = {p["name"]: p for p in api.app.openapi()["paths"]["/voices"]["get"]["parameters"]}
    assert set(params) == {"language", "gender"}
    assert all(p["in"] == "query" and not p.get("required") for p in params.values())
