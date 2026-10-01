import asyncio
import base64

import requests

from config import DID_API_KEY, DID_API_URL, DID_SOURCE_URL

POLL_INTERVAL = 5
MAX_POLL_ATTEMPTS = 60


def _get_auth_header() -> str:
    """Build the Basic authentication header required by D-ID."""
    if not DID_API_KEY:
        raise RuntimeError("DID_API_KEY is not configured.")

    try:
        username, password = DID_API_KEY.split(":", 1)
    except ValueError as exc:
        raise RuntimeError(
            "DID_API_KEY must use the format USERNAME:PASSWORD."
        ) from exc

    credentials = f"{username}:{password}".encode("utf-8")
    encoded_credentials = base64.b64encode(credentials).decode("utf-8")

    return f"Basic {encoded_credentials}"


def _get_headers(content_type: str = "application/json") -> dict:
    return {
        "Authorization": _get_auth_header(),
        "Content-Type": content_type,
        "Accept": "application/json",
    }


def upload_audio(audio_path: str) -> str:
    """
    Upload a locally generated audio file to D-ID.

    Returns:
        D-ID audio URL.
    """
    headers = _get_headers()
    headers.pop("Content-Type", None)

    try:
        with open(audio_path, "rb") as audio_file:
            response = requests.post(
                f"{DID_API_URL}/audios",
                headers=headers,
                files={
                    "audio": (
                        audio_path.split("/")[-1],
                        audio_file,
                        "audio/mpeg",
                    )
                },
                timeout=60,
            )
    except requests.RequestException as exc:
        raise RuntimeError(
            f"D-ID audio upload request failed: {exc}"
        ) from exc
    except OSError as exc:
        raise RuntimeError(
            f"Could not read audio file: {audio_path}"
        ) from exc

    if response.status_code != 201:
        raise RuntimeError(
            f"D-ID audio upload failed: "
            f"{response.status_code} {response.text}"
        )

    audio_url = response.json().get("url")

    if not audio_url:
        raise RuntimeError(
            "D-ID audio upload succeeded but returned no audio URL."
        )

    return audio_url


async def create_avatar_video(audio_path: str) -> str:
    """
    Create a talking-avatar video from a local audio file.

    Returns:
        Public URL of the generated MP4 video.
    """
    if not DID_SOURCE_URL:
        raise RuntimeError(
            "DID_SOURCE_URL is not configured."
        )

    audio_url = upload_audio(audio_path)

    payload = {
        "source_url": DID_SOURCE_URL,
        "script": {
            "type": "audio",
            "audio_url": audio_url,
        },
    }

    try:
        response = requests.post(
            f"{DID_API_URL}/talks",
            headers=_get_headers(),
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise RuntimeError(
            f"D-ID avatar request failed: {exc}"
        ) from exc

    if response.status_code != 201:
        raise RuntimeError(
            f"D-ID avatar request failed: "
            f"{response.status_code} {response.text}"
        )

    talk_id = response.json().get("id")

    if not talk_id:
        raise RuntimeError(
            "D-ID did not return a talk ID."
        )

    return await _poll_for_video(talk_id)


async def _poll_for_video(talk_id: str) -> str:
    """Poll D-ID until the avatar video is ready."""
    headers = _get_headers()

    for _ in range(MAX_POLL_ATTEMPTS):
        await asyncio.sleep(POLL_INTERVAL)

        try:
            response = await asyncio.to_thread(
                requests.get,
                f"{DID_API_URL}/talks/{talk_id}",
                headers=headers,
                timeout=30,
            )
        except requests.RequestException as exc:
            raise RuntimeError(
                f"D-ID status request failed: {exc}"
            ) from exc

        if response.status_code != 200:
            raise RuntimeError(
                f"D-ID status request failed: "
                f"{response.status_code} {response.text}"
            )

        result = response.json()
        status = result.get("status")
        print(f"🔄 D-ID status: {status}")

        if status == "done":
            video_url = result.get("result_url")

            if not video_url:
                raise RuntimeError(
                    "D-ID completed the job but returned no video URL."
                )

            return video_url

        if status == "error":
           error = result.get("error", {})
           description = error.get(
        "description",
        "Unknown D-ID processing error."
    )
    raise RuntimeError(
        f"D-ID avatar generation failed: {description}"
    )

    raise RuntimeError(
        "D-ID avatar generation timed out."
    )
