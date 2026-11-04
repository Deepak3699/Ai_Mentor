from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"


def read_lines(filename):
    path = BACKEND_DIR / filename
    return path.read_text(encoding="utf-8-sig").splitlines()


def requirement_names(filename="requirements.txt"):
    names = set()
    for line in read_lines(filename):
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name = line.split("==", 1)[0].split(">=", 1)[0].split("[", 1)[0]
        names.add(name.strip().lower())
    return names


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


def test_runtime_dependencies_are_pinned():
    for line in read_lines("requirements.txt"):
        line = line.split("#", 1)[0].strip()
        if line:
            assert "==" in line, f"{line} is not pinned with =="


def test_pytest_is_not_a_runtime_dependency():
    assert "pytest" not in requirement_names()


def test_pytest_is_declared_in_dev_requirements():
    assert "pytest" in requirement_names("requirements-dev.txt")
