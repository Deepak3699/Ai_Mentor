from pathlib import Path


def requirement_names():
    path = Path(__file__).resolve().parents[1] / "backend" / "requirements.txt"
    return {
        line.split("#", 1)[0].strip().split("==", 1)[0].split(">=", 1)[0].lower()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.split("#", 1)[0].strip()
    }


def test_requirements_do_not_redeclare_standard_library_asyncio():
    assert "asyncio" not in requirement_names()


def test_api_direct_runtime_dependencies_are_declared():
    required = {
        "fastapi",
        "uvicorn",
        "python-dotenv",
        "google-genai",
        "groq",
        "edge-tts",
        "requests",
        "cloudinary",
        "cachetools",
    }
    assert required <= requirement_names()


def test_pytest_is_declared_for_the_existing_ai_test_suite():
    assert "pytest" in requirement_names()
