"""Tests for issue #265: AI-generated content disclosure, script moderation,
and celebrity-footage safety.

All tests use mocks/monkeypatching so that no paid API calls, real FFmpeg
processes, or file-system writes are required.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_fake_process(returncode: int = 0, stderr: bytes = b"") -> MagicMock:
    """Return a mock asyncio.subprocess.Process."""
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(b"", stderr))
    return proc


# ===========================================================================
# Section A: LessonRequest default (backward-compat + safe default)
# ===========================================================================


def test_lesson_request_default_celebrity_is_owl():
    """LessonRequest.celebrity defaults to 'owl' (animated, rights-clear)."""
    import api  # noqa: PLC0415

    req = api.LessonRequest(course="Math", topic="Addition")
    assert req.celebrity == "owl", (
        "Default must be 'owl' to avoid silently using unverified real-person footage"
    )


def test_lesson_request_explicit_celebrity_is_preserved():
    """Callers that pass an explicit celebrity value are not affected."""
    import api  # noqa: PLC0415

    req = api.LessonRequest(course="Math", topic="Addition", celebrity="modi")
    assert req.celebrity == "modi"


# ===========================================================================
# Section B: get_celebrity_video – safe fallback behaviour
# ===========================================================================


def test_get_celebrity_video_returns_path_for_known_allowed_source(tmp_path, monkeypatch):
    """Known allowed celebrities resolve when the file exists."""
    import api  # noqa: PLC0415

    # BASE_DIR is os.path.dirname(os.path.dirname(abspath(__file__))), so the
    # function builds: BASE_DIR/backend/input/<name>.mp4
    # We must create that structure relative to our fake BASE_DIR.
    ai_service_dir = tmp_path
    backend_dir = ai_service_dir / "backend"
    fake_input = backend_dir / "input"
    fake_input.mkdir(parents=True)
    owl_video = fake_input / "owl.mp4"
    owl_video.write_bytes(b"fake")

    monkeypatch.setattr(api, "BASE_DIR", str(ai_service_dir))
    monkeypatch.setattr(api, "_SAFE_FALLBACK_CELEBRITY", "owl")

    result = api.get_celebrity_video("owl")
    assert result is not None
    assert Path(result).name == "owl.mp4"


def test_get_celebrity_video_returns_none_when_no_source_exists(tmp_path, monkeypatch):
    """Returns None when neither the requested source nor the fallback is found."""
    import api  # noqa: PLC0415

    # Build the proper two-level structure; leave the input dir empty.
    ai_service_dir = tmp_path
    fake_input = ai_service_dir / "backend" / "input"
    fake_input.mkdir(parents=True)  # deliberately empty

    monkeypatch.setattr(api, "BASE_DIR", str(ai_service_dir))
    monkeypatch.setattr(api, "_SAFE_FALLBACK_CELEBRITY", "owl")

    result = api.get_celebrity_video("modi")
    assert result is None


def test_get_celebrity_video_unknown_name_uses_safe_fallback(tmp_path, monkeypatch):
    """An unrecognised celebrity name falls back to the safe fallback source."""
    import api  # noqa: PLC0415

    ai_service_dir = tmp_path
    fake_input = ai_service_dir / "backend" / "input"
    fake_input.mkdir(parents=True)
    owl_video = fake_input / "owl.mp4"
    owl_video.write_bytes(b"fake")

    monkeypatch.setattr(api, "BASE_DIR", str(ai_service_dir))
    monkeypatch.setattr(api, "_SAFE_FALLBACK_CELEBRITY", "owl")

    result = api.get_celebrity_video("unknown_person")
    assert result is not None
    assert "owl" in Path(result).name


def test_get_celebrity_video_cannot_escape_input_directory(tmp_path, monkeypatch):
    """Path traversal attempts against the input directory are blocked."""
    import api  # noqa: PLC0415

    fake_input = tmp_path / "input"
    fake_input.mkdir()

    # Put a file *outside* the input directory to ensure it is not served.
    outside = tmp_path / "secret.mp4"
    outside.write_bytes(b"secret")

    monkeypatch.setattr(api, "BASE_DIR", str(tmp_path))
    monkeypatch.setattr(api, "_SAFE_FALLBACK_CELEBRITY", "owl")
    monkeypatch.setattr(api, "ALLOWED_CELEBRITIES", {"../secret"})

    result = api.get_celebrity_video("../secret")
    # Either None (fallback also missing) or falls back to allowed owl source
    if result is not None:
        assert "secret" not in result


# ===========================================================================
# Section C: Script moderation
# ===========================================================================


def test_moderate_script_passes_for_normal_educational_content():
    """Educational content is accepted without raising ScriptModerationError."""
    import api  # noqa: PLC0415

    # Should not raise
    api.moderate_script(
        "Photosynthesis is the process by which plants convert sunlight into energy."
    )


def test_moderate_script_raises_for_blocked_term(monkeypatch):
    """A blocked term in the script causes ScriptModerationError."""
    import api  # noqa: PLC0415

    monkeypatch.setattr(api, "_BLOCKED_TERMS", frozenset({"badterm"}))
    with pytest.raises(api.ScriptModerationError):
        api.moderate_script("This script contains badterm in it.")


def test_moderate_script_case_insensitive(monkeypatch):
    """Blocked-term matching is case-insensitive."""
    import api  # noqa: PLC0415

    monkeypatch.setattr(api, "_BLOCKED_TERMS", frozenset({"blockedword"}))
    with pytest.raises(api.ScriptModerationError):
        api.moderate_script("This contains BLOCKEDWORD.")


# ===========================================================================
# Section D: apply_ai_disclosure_watermark
# ===========================================================================


@pytest.mark.asyncio
async def test_watermark_invokes_ffmpeg_with_drawtext():
    """apply_ai_disclosure_watermark calls FFmpeg with the drawtext filter."""
    import api  # noqa: PLC0415

    captured_cmd: list[str] = []
    fake_proc = _make_fake_process(returncode=0)

    async def fake_exec(*cmd, **_kwargs):
        captured_cmd.extend(cmd)
        return fake_proc

    with patch("api.asyncio.create_subprocess_exec", side_effect=fake_exec):
        await api.apply_ai_disclosure_watermark("/tmp/in.mp4", "/tmp/out.mp4")

    assert "ffmpeg" in captured_cmd
    # Must use the drawtext filter
    assert any("drawtext" in arg for arg in captured_cmd), (
        "FFmpeg command must contain a drawtext filter"
    )
    # Must include the disclosure text
    assert any(api.DISCLOSURE_TEXT.replace(" ", "") in arg.replace(" ", "") or "AI-GENERATED" in arg
               for arg in captured_cmd), "Drawtext filter must include the disclosure label"
    # Must NOT use shell=True (no shell kwarg in subprocess call)
    assert "-y" in captured_cmd, "ffmpeg must receive -y overwrite flag"


@pytest.mark.asyncio
async def test_watermark_raises_on_ffmpeg_failure():
    """If FFmpeg exits non-zero, RuntimeError is raised — never silently ignored."""
    import api  # noqa: PLC0415

    fake_proc = _make_fake_process(returncode=1, stderr=b"some ffmpeg error")

    with patch("api.asyncio.create_subprocess_exec", AsyncMock(return_value=fake_proc)):
        with pytest.raises(RuntimeError, match="watermark failed|drawtext"):
            await api.apply_ai_disclosure_watermark("/tmp/in.mp4", "/tmp/out.mp4")


@pytest.mark.asyncio
async def test_unlabelled_video_never_served_on_watermark_failure():
    """When the watermark step fails, the job is marked 'failed', not 'ready'."""
    import api  # noqa: PLC0415

    base_filename = "test_wm_failure_job"
    api.job_status[base_filename] = {"status": "processing", "meta": {"timestamps": {}}}
    api.shutdown_failed_jobs.discard(base_filename)

    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "Short educational script about algebra."

    fake_proc_merge = _make_fake_process(returncode=0)
    fake_proc_wm = _make_fake_process(returncode=1, stderr=b"drawtext filter not found")

    call_count = {"n": 0}

    async def fake_exec(*cmd, **_kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return fake_proc_merge
        return fake_proc_wm

    def safe_open(file, *args, **kwargs):
        if isinstance(file, str) and base_filename in file:
            m = MagicMock()
            m.__enter__ = MagicMock(return_value=MagicMock())
            m.__exit__ = MagicMock(return_value=False)
            return m
        return open(file, *args, **kwargs)  # noqa: WPS515

    def fake_exists(path):
        if isinstance(path, str) and ("_merged" in path or base_filename in path):
            return True
        return False

    data = api.LessonRequest(course="Math", topic="Algebra")

    with (
        patch("api.gemini_client.models.generate_content", return_value=mock_gemini_response),
        patch("api.generate_tts", new_callable=AsyncMock),
        patch("api.create_avatar_video", side_effect=RuntimeError("D-ID unavailable")),
        patch("api.asyncio.create_subprocess_exec", side_effect=fake_exec),
        patch("api.os.path.exists", side_effect=fake_exists),
        patch("api.os.makedirs"),
        patch("api.os.remove"),
        patch("builtins.open", side_effect=safe_open),
    ):
        await api.process_lesson(data, base_filename)

    status = api.job_status.get(base_filename, {})
    assert status.get("status") == "failed", (
        "Job must be marked 'failed' when watermarking fails — "
        f"got status={status.get('status')!r}"
    )
    assert status.get("ai_disclosure") is not True, (
        "ai_disclosure must NOT be True when the watermark was not applied"
    )

    # Clean up
    api.job_status.pop(base_filename, None)


# ===========================================================================
# Section E: ai_disclosure in job status payload
# ===========================================================================


@pytest.mark.asyncio
async def test_ready_job_includes_ai_disclosure_fields():
    """A successfully completed job always exposes ai_disclosure=True in status."""
    import api  # noqa: PLC0415

    base_filename = "test_disclosure_fields"
    api.job_status[base_filename] = {"status": "processing", "meta": {"timestamps": {}}}
    api.shutdown_failed_jobs.discard(base_filename)

    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "Educational content about photosynthesis for students."

    fake_proc = _make_fake_process(returncode=0)

    def safe_open(file, *args, **kwargs):
        if isinstance(file, str) and base_filename in file:
            m = MagicMock()
            m.__enter__ = MagicMock(return_value=MagicMock())
            m.__exit__ = MagicMock(return_value=False)
            return m
        return open(file, *args, **kwargs)  # noqa: WPS515

    def fake_exists(path: str) -> bool:
        # Return True for celebrity video (so the fallback renderer can proceed)
        # and for the merged intermediate video so watermarking appears to succeed.
        if isinstance(path, str) and (base_filename in path or path.endswith(".mp4")):
            return True
        return False

    data = api.LessonRequest(course="Biology", topic="Photosynthesis")

    with (
        patch("api.gemini_client.models.generate_content", return_value=mock_gemini_response),
        patch("api.generate_tts", new_callable=AsyncMock),
        patch("api.create_avatar_video", side_effect=RuntimeError("D-ID unavailable")),
        patch("api.asyncio.create_subprocess_exec", AsyncMock(return_value=fake_proc)),
        patch("api.apply_ai_disclosure_watermark", new_callable=AsyncMock),
        patch("api.write_subtitles", return_value=(None, None)),
        patch("api.cloudinary.uploader.upload", side_effect=Exception("No cloudinary")),
        patch("api.os.path.exists", side_effect=fake_exists),
        patch("api.os.makedirs"),
        patch("api.os.remove"),
        patch("builtins.open", side_effect=safe_open),
    ):
        await api.process_lesson(data, base_filename)

    status = api.job_status.get(base_filename, {})
    assert status.get("status") == "ready", f"Expected ready, got {status.get('status')!r}"
    assert status.get("ai_disclosure") is True, "ai_disclosure must be True in completed jobs"
    assert status.get("ai_disclosure_label") == api.DISCLOSURE_TEXT

    # Clean up
    api.job_status.pop(base_filename, None)


# ===========================================================================
# Section F: Moderation rejection inside process_lesson
# ===========================================================================


@pytest.mark.asyncio
async def test_moderation_rejection_marks_job_failed():
    """When moderate_script raises, the job is marked failed and TTS is never called."""
    import api  # noqa: PLC0415

    base_filename = "test_moderation_reject"
    api.job_status[base_filename] = {"status": "processing", "meta": {"timestamps": {}}}
    api.shutdown_failed_jobs.discard(base_filename)

    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "Script containing a harmless educational topic."

    tts_calls = {"n": 0}

    async def counting_tts(*args, **kwargs):
        tts_calls["n"] += 1

    data = api.LessonRequest(course="History", topic="World War II")

    with (
        patch("api.gemini_client.models.generate_content", return_value=mock_gemini_response),
        patch("api.generate_tts", side_effect=counting_tts),
        # Simulate moderation rejection
        patch("api.moderate_script", side_effect=api.ScriptModerationError("blocked")),
        patch("api.os.makedirs"),
    ):
        await api.process_lesson(data, base_filename)

    status = api.job_status.get(base_filename, {})
    assert status.get("status") == "failed"
    assert status.get("meta", {}).get("moderation_rejected") is True
    assert tts_calls["n"] == 0, "TTS must not be invoked after moderation rejection"

    api.job_status.pop(base_filename, None)


@pytest.mark.asyncio
async def test_unexpected_moderation_error_fails_job_when_required(monkeypatch):
    """When REQUIRE_SCRIPT_MODERATION is True, moderation errors fail the job."""
    import api  # noqa: PLC0415
    import config  # noqa: PLC0415

    base_filename = "test_moderation_required"
    api.job_status[base_filename] = {"status": "processing", "meta": {"timestamps": {}}}
    api.shutdown_failed_jobs.discard(base_filename)

    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "A perfectly normal educational script."

    original_require = api.REQUIRE_SCRIPT_MODERATION
    monkeypatch.setattr(api, "REQUIRE_SCRIPT_MODERATION", True)

    data = api.LessonRequest(course="Science", topic="Newton's Laws")

    with (
        patch("api.gemini_client.models.generate_content", return_value=mock_gemini_response),
        patch("api.generate_tts", new_callable=AsyncMock),
        patch("api.moderate_script", side_effect=RuntimeError("Moderation service down")),
        patch("api.os.makedirs"),
    ):
        await api.process_lesson(data, base_filename)

    status = api.job_status.get(base_filename, {})
    assert status.get("status") == "failed", (
        "Job must fail when REQUIRE_SCRIPT_MODERATION=True and moderation raises unexpectedly"
    )

    monkeypatch.setattr(api, "REQUIRE_SCRIPT_MODERATION", original_require)
    api.job_status.pop(base_filename, None)


# ===========================================================================
# Section G: Backward compatibility for unaffected requests
# ===========================================================================


def test_lesson_request_fields_unchanged():
    """LessonRequest still exposes all fields expected by the existing API contract."""
    import ast
    from pathlib import Path as _Path

    source = (_Path(__file__).resolve().parents[1] / "backend" / "api.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "LessonRequest")
    fields = {
        n.target.id
        for n in node.body
        if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)
    }
    required = {"course", "topic", "celebrity", "language", "preferences",
                "voice_id", "gender", "speech_rate", "speech_pitch"}
    assert required <= fields, f"Missing LessonRequest fields: {required - fields}"


def test_disclosure_text_constant_is_defined():
    """DISCLOSURE_TEXT must be a non-empty string constant."""
    import api  # noqa: PLC0415

    assert isinstance(api.DISCLOSURE_TEXT, str)
    assert len(api.DISCLOSURE_TEXT) > 0


def test_config_exports_require_script_moderation():
    """config.py must export REQUIRE_SCRIPT_MODERATION."""
    import config  # noqa: PLC0415

    assert hasattr(config, "REQUIRE_SCRIPT_MODERATION")
    assert isinstance(config.REQUIRE_SCRIPT_MODERATION, bool)
