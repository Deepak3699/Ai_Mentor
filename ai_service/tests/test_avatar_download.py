"""Unit tests for bounded, streaming D-ID avatar video downloads.

Tests that avatar video files are downloaded in streams of chunks, size limits are enforced,
temporary files are used atomically, and failed downloads leave no partial files behind.
"""

from pathlib import Path
import sys
from unittest.mock import MagicMock
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from backend.services.lesson_pipeline import download_avatar_source


class FakeStreamingResponse:
    """Mock response that simulates an HTTP chunked stream."""

    def __init__(self, chunks, status_code=200, headers=None, raise_on_iter=None):
        self.chunks = chunks
        self.status_code = status_code
        self.headers = headers or {}
        self.raise_on_iter = raise_on_iter

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests

            raise requests.HTTPError(f"HTTP Error {self.status_code}")

    def iter_content(self, chunk_size=65536):
        for chunk in self.chunks:
            yield chunk
        if self.raise_on_iter:
            raise self.raise_on_iter


# 1. Normal streaming download: succeeds, preserves contents, and cleans up .part file
def test_download_avatar_source_success(tmp_path):
    target = tmp_path / "avatar.mp4"
    chunks = [b"chunk1_", b"chunk2_", b"chunk3"]
    fake_response = FakeStreamingResponse(
        chunks=chunks, headers={"Content-Length": "20"}
    )

    mock_requests = MagicMock()
    mock_requests.get.return_value = fake_response

    total_bytes = download_avatar_source(
        url="https://api.d-id.com/video.mp4",
        target_path=str(target),
        max_bytes=100,
        requests_lib=mock_requests,
    )

    assert total_bytes == 20
    assert target.exists()
    assert target.read_bytes() == b"chunk1_chunk2_chunk3"
    assert not (tmp_path / "avatar.mp4.part").exists()
    mock_requests.get.assert_called_once_with(
        "https://api.d-id.com/video.mp4", stream=True, timeout=120
    )


# 2. Fast-fail check: aborts immediately if Content-Length header is too large
def test_download_avatar_source_aborts_on_content_length_header(tmp_path):
    target = tmp_path / "avatar.mp4"
    fake_response = FakeStreamingResponse(
        chunks=[b"not_read"], headers={"Content-Length": "500"}
    )

    mock_requests = MagicMock()
    mock_requests.get.return_value = fake_response

    with pytest.raises(ValueError, match="exceeds limit"):
        download_avatar_source(
            url="https://api.d-id.com/large.mp4",
            target_path=str(target),
            max_bytes=100,
            requests_lib=mock_requests,
        )

    assert not target.exists()
    assert not (tmp_path / "avatar.mp4.part").exists()


# 3. Dynamic limit check: aborts mid-stream and removes .part file if bytes exceed limit
def test_download_avatar_source_aborts_on_stream_overflow(tmp_path):
    target = tmp_path / "avatar.mp4"
    chunks = [b"12345678", b"90123456"]
    fake_response = FakeStreamingResponse(chunks=chunks, headers={})

    mock_requests = MagicMock()
    mock_requests.get.return_value = fake_response

    with pytest.raises(ValueError, match="exceeded maximum allowed size"):
        download_avatar_source(
            url="https://api.d-id.com/stream.mp4",
            target_path=str(target),
            max_bytes=10,
            requests_lib=mock_requests,
        )

    assert not target.exists()
    assert not (tmp_path / "avatar.mp4.part").exists()


# 4. Error cleanup: removes partial file if remote server returns an HTTP error
def test_download_avatar_source_cleans_up_on_http_error(tmp_path):
    target = tmp_path / "avatar.mp4"
    fake_response = FakeStreamingResponse(chunks=[], status_code=404)

    mock_requests = MagicMock()
    mock_requests.get.return_value = fake_response

    with pytest.raises(Exception):
        download_avatar_source(
            url="https://api.d-id.com/missing.mp4",
            target_path=str(target),
            requests_lib=mock_requests,
        )

    assert not target.exists()
    assert not (tmp_path / "avatar.mp4.part").exists()


# 5. Network failure cleanup: removes partial file if connection drops mid-download
def test_download_avatar_source_cleans_up_on_network_failure(tmp_path):
    target = tmp_path / "avatar.mp4"
    import requests

    # Provide a chunk so a partial file is actually written to disk before disconnect
    fake_response = FakeStreamingResponse(
        chunks=[b"partial_chunk_before_disconnect"],
        raise_on_iter=requests.ConnectionError("Connection lost"),
    )

    mock_requests = MagicMock()
    mock_requests.get.return_value = fake_response

    with pytest.raises(requests.ConnectionError):
        download_avatar_source(
            url="https://api.d-id.com/dropped.mp4",
            target_path=str(target),
            requests_lib=mock_requests,
        )

    # Verify neither final video nor temporary partial file is left behind
    assert not target.exists()
    assert not (tmp_path / "avatar.mp4.part").exists()
