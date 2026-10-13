import asyncio
import os
import sys
import uuid
import time
from unittest.mock import patch, MagicMock, AsyncMock
import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), "../backend"))
from api import process_lesson, job_status, LessonRequest

@pytest.fixture(autouse=True)
def clear_job_status():
    job_status.clear()
    yield

@pytest.mark.asyncio
async def test_queued_metadata():
    # In API layer, queuing sets status to queued and creates timestamps.
    # The process_lesson function assumes status might already be set, but we can verify process_lesson updates it to processing
    base_filename = "test_queue_123"
    job_status[base_filename] = {
        "status": "queued",
        "meta": {
            "timestamps": {
                "queued_at": "2026-10-08T00:00:00Z"
            }
        }
    }
    
    data = LessonRequest(course="C", topic="T", celebrity="M")
    
    # We mock Gemini to throw an error and Groq to throw an error so it fails fast
    with patch("api.gemini_client.models.generate_content", side_effect=Exception("Fail")), \
         patch("api.groq_client.chat.completions.create", side_effect=Exception("Fail")):
        await process_lesson(data, base_filename)
        
    assert job_status[base_filename]["status"] == "failed"
    assert "started_at" in job_status[base_filename]["meta"]["timestamps"]
    assert "failed_at" in job_status[base_filename]["meta"]["timestamps"]

@pytest.mark.asyncio
async def test_gemini_metadata():
    base_filename = "test_gemini_123"
    data = LessonRequest(course="C", topic="T", celebrity="M")
    
    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "This is a five word script"
    
    with patch("api.gemini_client.models.generate_content", return_value=mock_gemini_response), \
         patch("api.generate_tts", new_callable=AsyncMock) as mock_tts, \
         patch("api.create_avatar_video", new_callable=AsyncMock) as mock_avatar, \
         patch("api.requests.get") as mock_get, \
         patch("api.write_subtitles", return_value=("vtt", "srt")), \
         patch("api.cloudinary.uploader.upload", side_effect=Exception("Cloud fail")), \
         patch("api.os.makedirs") as mock_makedirs, \
         patch("api.os.remove"), \
         patch("builtins.open", side_effect=safe_open):
        
        mock_makedirs.return_value = None
        mock_tts.return_value = None
        
        # We need mock_get to return some bytes
        mock_response = MagicMock()
        mock_response.content = b"fake video data"
        mock_get.return_value = mock_response
        mock_avatar.return_value = "http://fake/video"
        
        # Test unreadable audio metadata (MP3 fails because file is fake or doesn't exist)
        with patch("api.MP3", side_effect=Exception("No MP3")):
            await process_lesson(data, base_filename)
            
    assert job_status[base_filename]["status"] == "ready"
    assert job_status[base_filename]["meta"]["provider"] == "gemini"
    assert job_status[base_filename]["meta"]["word_count"] == 6
    assert job_status[base_filename]["meta"]["audio_seconds"] == 0.0
    assert "duration_ms" in job_status[base_filename]["meta"]
    assert "completed_at" in job_status[base_filename]["meta"]["timestamps"]
    assert "started_at" in job_status[base_filename]["meta"]["timestamps"]

original_exists = os.path.exists
def safe_exists(path):
    if isinstance(path, str) and ("test_groq_123" in path or "stock" in path or ".mp4" in path):
        return True
    return original_exists(path)

original_open = open
m_open = MagicMock()
m_open.__enter__.return_value = MagicMock()
m_open.__exit__.return_value = False
def safe_open(file, *args, **kwargs):
    if isinstance(file, str) and "test_" in file:
        return m_open
    return original_open(file, *args, **kwargs)

@pytest.mark.asyncio
async def test_groq_metadata_and_mp3_duration():
    base_filename = "test_groq_123"
    data = LessonRequest(course="C", topic="T", celebrity="M")
    
    mock_groq_response = MagicMock()
    mock_groq_response.choices = [MagicMock()]
    mock_groq_response.choices[0].message.content = "Groq fallback script"
    
    with patch("api.gemini_client.models.generate_content", side_effect=Exception("Gemini failed")), \
         patch("api.groq_client.chat.completions.create", return_value=mock_groq_response), \
         patch("api.generate_tts", new_callable=AsyncMock) as mock_tts, \
         patch("api.create_avatar_video", side_effect=Exception("Avatar failed")), \
         patch("api.asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec, \
         patch("api.os.path.exists", side_effect=safe_exists), \
         patch("api.os.makedirs") as mock_makedirs, \
         patch("api.os.remove"), \
         patch("builtins.open", side_effect=safe_open):
         
        # Ensure makedirs doesn't raise an error
        mock_makedirs.return_value = None
        mock_tts.return_value = None
        
        mock_process = MagicMock()
        mock_process.communicate = AsyncMock(return_value=(b"", b""))
        mock_process.returncode = 0
        mock_exec.return_value = mock_process
        
        mock_mp3 = MagicMock()
        mock_mp3.info.length = 42.5
        with patch("api.MP3", return_value=mock_mp3):
            await process_lesson(data, base_filename)
            
    assert job_status[base_filename]["status"] == "ready"
    assert job_status[base_filename]["meta"]["provider"] == "groq"
    assert job_status[base_filename]["meta"]["model"] == "llama-3.3-70b-versatile"
    assert job_status[base_filename]["meta"]["word_count"] == 3
    assert job_status[base_filename]["meta"]["audio_seconds"] == 42.5
    assert "duration_ms" in job_status[base_filename]["meta"]
    assert "completed_at" in job_status[base_filename]["meta"]["timestamps"]
