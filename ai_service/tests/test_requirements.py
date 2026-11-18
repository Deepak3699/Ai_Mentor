
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"


def read_requirement_names(filename):
    path = BACKEND_DIR / filename
    return {
        line.split("#", 1)[0].strip().split("==", 1)[0].split(">=", 1)[0].lower()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.split("#", 1)[0].strip()
    }


def requirement_names():
    return read_requirement_names("requirements.txt")


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


def test_pytest_is_not_declared_in_production_requirements():
    assert "pytest" not in requirement_names()


def test_pytest_is_declared_for_the_existing_ai_test_suite():
    dev_requirements = read_requirement_names("requirements-dev.txt")
    assert {"pytest", "pytest-asyncio"} <= dev_requirements
