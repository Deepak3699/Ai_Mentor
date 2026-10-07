VOICE_REGISTRY = {
    "en-US-GuyNeural": {
        "voice_id": "en-US-GuyNeural",
        "name": "Guy",
        "gender": "Male",
        "language": "English",
        "accent": "US",
        "description": "Natural and professional male voice.",
    },
    "en-US-AriaNeural": {
        "voice_id": "en-US-AriaNeural",
        "name": "Aria",
        "gender": "Female",
        "language": "English",
        "accent": "US",
        "description": "Clear and expressive female voice.",
    },
    "en-GB-RyanNeural": {
        "voice_id": "en-GB-RyanNeural",
        "name": "Ryan",
        "gender": "Male",
        "language": "English",
        "accent": "UK",
        "description": "Friendly British male voice.",
    },
    "en-GB-SoniaNeural": {
        "voice_id": "en-GB-SoniaNeural",
        "name": "Sonia",
        "gender": "Female",
        "language": "English",
        "accent": "UK",
        "description": "Bright and approachable British female voice.",
    },
    "en-IN-PrabhatNeural": {
        "voice_id": "en-IN-PrabhatNeural",
        "name": "Prabhat",
        "gender": "Male",
        "language": "English",
        "accent": "India",
        "description": "Warm Indian male voice.",
    },
    "en-IN-NeerjaNeural": {
        "voice_id": "en-IN-NeerjaNeural",
        "name": "Neerja",
        "gender": "Female",
        "language": "English",
        "accent": "India",
        "description": "Professional Indian female voice.",
    },
    "es-ES-AlvaroNeural": {
        "voice_id": "es-ES-AlvaroNeural",
        "name": "Alvaro",
        "gender": "Male",
        "language": "Spanish",
        "accent": "Spain",
        "description": "Clear Spanish male voice.",
    },
    "es-ES-ElviraNeural": {
        "voice_id": "es-ES-ElviraNeural",
        "name": "Elvira",
        "gender": "Female",
        "language": "Spanish",
        "accent": "Spain",
        "description": "Professional Spanish female voice.",
    },
    "fr-FR-HenriNeural": {
        "voice_id": "fr-FR-HenriNeural",
        "name": "Henri",
        "gender": "Male",
        "language": "French",
        "accent": "France",
        "description": "Polite French male voice.",
    },
    "fr-FR-DeniseNeural": {
        "voice_id": "fr-FR-DeniseNeural",
        "name": "Denise",
        "gender": "Female",
        "language": "French",
        "accent": "France",
        "description": "Clear French female voice.",
    }
}

DEFAULT_VOICE_ID = "en-US-GuyNeural"

def get_voice(voice_id: str) -> str:
    """Validate and return the correct voice_id, falling back to default if invalid."""
    if not voice_id or voice_id not in VOICE_REGISTRY:
        return DEFAULT_VOICE_ID
    return voice_id

def get_all_voices() -> list:
    """Return the full list of available voices with metadata."""
    return list(VOICE_REGISTRY.values())
