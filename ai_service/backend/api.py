import os
import datetime
import re
import traceback
import asyncio
import logging
import subprocess
from contextlib import asynccontextmanager
from job_shutdown import wait_for_jobs_to_finish
import edge_tts
import cloudinary
import cloudinary.uploader
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import hashlib
import uuid
import time
from mutagen.mp3 import MP3
from google import genai
from google.genai import types
from groq import Groq
from cachetools import TTLCache

from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GROQ_API_KEY,
    LLM_TIMEOUT_SECONDS,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    OUTPUT_RETENTION_HOURS,
    validate_config,
)

validate_config()

from avatar_service import create_avatar_video


# --------------------------
# Cloudinary Config
# --------------------------
if CLOUDINARY_ENABLED:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


# --------------------------
# FastAPI App
# --------------------------
logger = logging.getLogger(__name__)


def log_event(level: str, message: str, **details):
    """Write compact, scan-friendly service logs without exposing payloads or URLs."""
    suffix = ""
    visible = [f"{key}={value}" for key, value in details.items() if value not in (None, "")]
    if visible:
        suffix = " | " + " | ".join(visible)
    print(f"[{level}] {message}{suffix}", flush=True)


def short_error(error: Exception, limit: int = 180) -> str:
    message = " ".join(str(error).split())
    return message if len(message) <= limit else f"{message[: limit - 3]}..."


def check_ffmpeg() -> None:
    """Verify that FFmpeg is available before starting the service."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        logger.info("FFmpeg is available.")
    except FileNotFoundError:
        logger.error(
            "FFmpeg is not installed or not available in PATH. "
            "Install FFmpeg before starting the AI service."
        )
        raise RuntimeError(
            "FFmpeg is required to start the AI service but was not found in PATH."
        )
    except subprocess.CalledProcessError as exc:
        logger.error(
            "FFmpeg availability check failed with exit code %s.",
            exc.returncode,
        )
        raise RuntimeError(
            "FFmpeg is required to start the AI service but the availability check failed."
        ) from exc


@asynccontextmanager
async def lifespan(app: FastAPI):
    global shutting_down

    check_ffmpeg()
    shutting_down = False
    yield

    shutting_down = True
    await wait_for_jobs_to_finish(
        active_jobs=active_jobs,
        job_status=job_status,
        shutdown_failed_jobs=shutdown_failed_jobs,
        timeout_seconds=0,
    )


app = FastAPI(
    title="AI Lesson Generator",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------
# GEMINI Client (Primary)
# --------------------------
gemini_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000),
) if GEMINI_API_KEY else None


# --------------------------
# GROQ Client (Fallback)
# --------------------------
groq_client = Groq(
    api_key=GROQ_API_KEY,
    timeout=LLM_TIMEOUT_SECONDS,
) if GROQ_ENABLED else None


# --------------------------
# Request Model
# --------------------------
class LessonRequest(BaseModel):
    course: str = Field(..., min_length=1, max_length=100)
    topic: str = Field(..., min_length=1, max_length=200)
    celebrity: str = Field("modi", min_length=1, max_length=50)
    language: str = "English"
    preferences: dict | None = None
    voice_id: str | None = None
    gender: str | None = None
    speech_rate: str | None = "+0%"
    speech_pitch: str | None = "+0Hz"


class SyllabusRequest(BaseModel):
    course_title: str
    category: str | None = None


# --------------------------
# Helpers
# --------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def generate_tts(text: str, output_file: str):
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice_id,
        rate=rate,
        pitch=pitch
    )
    await communicate.save(output_file)


def get_celebrity_video(celebrity_name: str):
    input_video_dir = os.path.join(BASE_DIR, "backend", "input")
    celebrity_video = os.path.join(
        input_video_dir,
        f"{celebrity_name.lower()}.mp4"
    )

    if os.path.exists(celebrity_video):
        print(f"🎬 Using celebrity video: {celebrity_video}")
        return celebrity_video
    else:
        input_video = os.path.join(input_video_dir, "modi.mp4")
        print(f"🎬 Using default video: {input_video}")
        return input_video


# --------------------------
# Output Directories
# --------------------------
base_output_path = os.path.join(BASE_DIR, "outputs")
video_output_path = os.path.join(base_output_path, "video")
text_output_path = os.path.join(base_output_path, "text")
audio_output_path = os.path.join(base_output_path, "audio")

os.makedirs(video_output_path, exist_ok=True)
os.makedirs(text_output_path, exist_ok=True)
os.makedirs(audio_output_path, exist_ok=True)

app.mount(
    "/video-stream",
    StaticFiles(directory=video_output_path),
    name="video-stream"
)

app.mount(
    "/transcript-stream",
    StaticFiles(directory=text_output_path),
    name="transcript-stream"
)


# --------------------------
# Job Status
# --------------------------
job_status = {}


def update_job_status(job_id: str, status: str, **extra_data):
    """
    Update job status while keeping a timestamp.

    The timestamp allows the cleanup system to remove
    stale job-status entries safely.
    """
    job_status[job_id] = {
        "status": status,
        "updated_at": datetime.datetime.now().timestamp(),
        **extra_data,
    }


# --------------------------
# Storage Cleanup
# --------------------------
def cleanup_old_output_files():
    """
    Remove output files older than OUTPUT_RETENTION_HOURS.

    Files belonging to currently processing jobs are protected.
    Also removes stale job_status entries.
    """

    retention_seconds = OUTPUT_RETENTION_HOURS * 60 * 60
    cutoff_time = datetime.datetime.now().timestamp() - retention_seconds

    output_directories = [
        text_output_path,
        audio_output_path,
        video_output_path,
    ]

    # Protect files belonging to currently processing jobs.
    active_jobs = {
        job_id
        for job_id, data in job_status.items()
        if isinstance(data, dict)
        and data.get("status") == "processing"
    }

    deleted_files = 0
    deleted_bytes = 0

    print(
        f"🧹 Starting output cleanup "
        f"(retention: {OUTPUT_RETENTION_HOURS} hours)"
    )

    for directory in output_directories:
        if not os.path.exists(directory):
            continue

        for filename in os.listdir(directory):
            file_path = os.path.join(directory, filename)

            if not os.path.isfile(file_path):
                continue

            # Job ID is the filename without extension.
            job_id = os.path.splitext(filename)[0]

            # Never remove files belonging to active jobs.
            if job_id in active_jobs:
                print(
                    f"🔒 Skipping active job file: {file_path}"
                )
                continue

            try:
                modified_time = os.path.getmtime(file_path)

                if modified_time < cutoff_time:
                    file_size = os.path.getsize(file_path)

                    os.remove(file_path)

                    deleted_files += 1
                    deleted_bytes += file_size

                    print(
                        f"🗑️ Deleted old output: {file_path}"
                    )

            except Exception as cleanup_error:
                print(
                    f"❌ Failed to delete {file_path}: "
                    f"{cleanup_error}"
                )

    # --------------------------
    # Cleanup stale job statuses
    # --------------------------
    stale_jobs = []

    for job_id, data in list(job_status.items()):
        if not isinstance(data, dict):
            stale_jobs.append(job_id)
            continue

        # Never remove an active processing job.
        if data.get("status") == "processing":
            continue

        updated_at = data.get("updated_at")

        if updated_at is None:
            continue

        if updated_at < cutoff_time:
            stale_jobs.append(job_id)

    for job_id in stale_jobs:
        job_status.pop(job_id, None)
        print(
            f"🧹 Removed stale job-status entry: {job_id}"
        )

    deleted_mb = deleted_bytes / (1024 * 1024)

    print(
        f"✅ Cleanup complete: "
        f"{deleted_files} files deleted, "
        f"{deleted_mb:.2f} MB freed, "
        f"{len(stale_jobs)} stale job statuses removed."
    )


async def periodic_cleanup():
    """
    Run cleanup once every hour while the server is running.
    """

    while True:
        try:
            await asyncio.sleep(60 * 60)
            cleanup_old_output_files()
        except asyncio.CancelledError:
            print("🛑 Periodic cleanup task stopped.")
            break
        except Exception as cleanup_error:
            print(
                f"❌ Periodic cleanup error: "
                f"{cleanup_error}"
            )


cleanup_task = None


@app.on_event("startup")
async def startup_cleanup():
    """
    Run cleanup when the backend starts and then
    continue cleanup every hour.
    """
    global cleanup_task

    print("🚀 Backend startup cleanup...")
    cleanup_old_output_files()

    cleanup_task = asyncio.create_task(
        periodic_cleanup()
    )

    print(
        "⏰ Periodic output cleanup scheduled "
        "(every 1 hour)."
    )


@app.on_event("shutdown")
async def shutdown_cleanup():
    """
    Stop the periodic cleanup task when the server shuts down.
    """
    global cleanup_task

    if cleanup_task:
        cleanup_task.cancel()

        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


# --------------------------
# Root Route
# --------------------------
@app.get("/")
def home():
    return {
        "message": "AI Lesson Generator Backend Running"
    }


@app.get("/transcript/{filename}")
def get_transcript(filename: str):
    file_path = os.path.join(
        BASE_DIR,
        "outputs",
        "text",
        filename
    )

    if os.path.exists(file_path):
        with open(
            file_path,
            "r",
            encoding="utf-8"
        ) as f:
            content = f.read()

        return {"content": content}

    return {"error": "Transcript not found"}


@app.get("/status/{job_id}")
def get_status(job_id: str):
    status_data = job_status.get(
        job_id,
        {"status": "not_found"}
    )

    if isinstance(status_data, str):
        return {"status": status_data}

    return status_data


# --------------------------
# Generate Syllabus Endpoint
# --------------------------
@app.post("/generate-syllabus")
def generate_syllabus(data: SyllabusRequest):
    """
    Generate a structured course syllabus using AI.

    Tries Gemini first and falls back to Groq if Gemini fails.
    """

    prompt = f"""
    Create a highly structured course syllabus for a course titled '{data.course_title}'.
    Category: {data.category or 'General Education'}

    You MUST respond with ONLY a valid JSON object. Do not include markdown formatting like ```json.

    The JSON structure must match this exactly:
    {{
      "modules": [
        {{
          "title": "Module 1: Introduction",
          "lessons": [
            {{
              "title": "Lesson 1: Basics",
              "duration": "5 mins",
              "type": "video"
            }}
          ]
        }}
      ]
    }}

    Requirements:
    - Create exactly 3 modules.
    - Each module should have exactly 2 lessons.
    - All lesson types should be "video".
    """

    try:
        print(
            "⚡ Trying Gemini Primary Model for Syllabus..."
        )

        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000)
            ),
        )

        text = response.text.strip()

        if text.startswith("```json"):
            text = text[7:]

        if text.startswith("```"):
            text = text[3:]

        if text.endswith("```"):
            text = text[:-3]

        return json.loads(text.strip())

    except Exception as e:
        print(
            f"❌ Gemini failed: {e}. Trying Groq..."
        )

        try:
            groq_response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=1000,
                timeout=LLM_TIMEOUT_SECONDS,
            )

            text = (
                groq_response
                .choices[0]
                .message
                .content
                .strip()
            )

            if text.startswith("```json"):
                text = text[7:]

            if text.startswith("```"):
                text = text[3:]

            if text.endswith("```"):
                text = text[:-3]

            return json.loads(text.strip())

        except Exception as e2:
            print(
                f"❌ Groq failed: {e2}"
            )

            return {
                "error": "Failed to generate syllabus"
            }


# --------------------------
# Generate Lesson Endpoint
# --------------------------
@app.post("/generate")
def generate_lesson(
    data: LessonRequest,
    background_tasks: BackgroundTasks
):

    topic_clean = re.sub(
        r'[^\w\s-]',
        '',
        data.topic
    ).strip().replace(" ", "_")

    timestamp = datetime.datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    base_filename = f"{topic_clean}_{timestamp}"

    update_job_status(
        base_filename,
        "processing"
    )

    background_tasks.add_task(
        process_lesson,
        data,
        base_filename
    )

    return {
        "status": "Processing",
        "filename": f"{base_filename}.mp4",
        "text_file": f"{base_filename}.txt",
        "audio_file": f"{base_filename}.mp3",
        "jobId": base_filename,
        "cached": False,
    }


# --------------------------
# Background Task Logic
# --------------------------
def process_lesson(
    data: LessonRequest,
    base_filename: str
):


async def process_lesson(data: LessonRequest, base_filename: str):
    log_event("QUEUE", "Lesson request accepted", job=base_filename, topic=data.topic, source=data.celebrity)

    start_time = time.time()
    provider_used = "unknown"
    model_used = "unknown"
    audio_seconds = 0.0

    # INITIALIZE job_status ENTRY IF IT DOESN'T EXIST (For Tests)
    if base_filename not in job_status:
        job_status[base_filename] = {
            "status": "processing",
            "meta": {
                "timestamps": {
                    "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            }
        }
    else:
        job_status[base_filename]["status"] = "processing"
        if "meta" not in job_status[base_filename]:
            job_status[base_filename]["meta"] = {"timestamps": {}}
        if "timestamps" not in job_status[base_filename]["meta"]:
            job_status[base_filename]["meta"]["timestamps"] = {}
        job_status[base_filename]["meta"]["timestamps"]["started_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        print(
            f"\n🚀 Starting generation for: "
            f"{data.topic} ({data.celebrity})"
        )

        preferences_text = ""

        if data.preferences:
            preferences_text = f"""
        User Preferences:
        - Explanation Type: {data.preferences.get("explanation_type", "Not specified")}
        - Learning Style: {data.preferences.get("learning_style", "Not specified")}
        - Teaching Pace: {data.preferences.get("teaching_pace", "Not specified")}
        - Example Type: {data.preferences.get("example_type", "Not specified")}
        - Focus Area: {data.preferences.get("focus_area", "Not specified")}
        """
        else:
            preferences_text = (
                "User Preferences: Not provided"
            )

        prompt = f"""
        Create a 50 word educational explanation about '{data.topic}' in the subject '{data.course}'.

        Rules:
        - {data.language or "English"} only
        - Simple classroom teaching tone
        - Between 45 and 60 words

        Narration style inspired by the celebrity {data.celebrity}.

        {preferences_text}

        Instructions:
        - Adapt the explanation to the user's preferred explanation type.
        - Adjust the teaching speed and depth to match the user's preferred teaching pace.
        - Use examples that match the user's preferred example type.
        - Focus the explanation on the user's selected focus area.
        - Match the explanation style with the user's preferred learning style.
        """

        print("\n📊 USER PREFERENCES:\n")
        print(
            data.preferences
            if data.preferences
            else "No preferences provided"
        )

        script = ""

        try:
            print(
                "⚡ Trying Gemini Primary Model..."
            )

            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000)
                ),
            )

            script = (
                response.text
                .strip()
                .replace("\n", " ")
            )

            print(
                "✅ Gemini response generated"
            )

        except Exception as gemini_error:

            print(
                f"❌ Gemini failed: {gemini_error}"
            )

            try:
                print(
                    "⚡ Switching to Groq fallback..."
                )

                groq_response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    temperature=0.7,
                    max_tokens=300,
                    timeout=LLM_TIMEOUT_SECONDS,
                )

                script = (
                    groq_response
                    .choices[0]
                    .message
                    .content
                    .strip()
                    .replace("\n", " ")
                )

                print(
                    "✅ Groq fallback response generated"
                )

            except Exception as groq_error:

                print(
                    f"❌ Groq also failed: {groq_error}"
                )

                update_job_status(
                    base_filename,
                    "failed"
                )

                return

        print(
            f"📝 Generated text: {script}"
        )

        # --------------------------
        # Create Output Folders
        # --------------------------
        base_output_dir = os.path.join(
            BASE_DIR,
            "outputs"
        )

        text_dir = os.path.join(
            base_output_dir,
            "text"
        )

        audio_dir = os.path.join(
            base_output_dir,
            "audio"
        )

        video_dir = os.path.join(
            base_output_dir,
            "video"
        )

        os.makedirs(
            text_dir,
            exist_ok=True
        )

        os.makedirs(
            audio_dir,
            exist_ok=True
        )

        os.makedirs(
            video_dir,
            exist_ok=True
        )

        text_path = os.path.join(
            text_dir,
            f"{base_filename}.txt"
        )

        audio_path = os.path.join(
            audio_dir,
            f"{base_filename}.mp3"
        )

        final_video = os.path.join(
            video_dir,
            f"{base_filename}.mp4"
        )

        # --------------------------
        # Save Text to File
        # --------------------------
        with open(
            text_path,
            "w",
            encoding="utf-8"
        ) as f:
            f.write(script)

        print(
            f"💾 Saved text to: {text_path}"
        )

        # --------------------------
        # Convert Text to Speech
        # --------------------------
        print(
            "🎵 Starting TTS generation..."
        )

        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)

            asyncio.run(
                generate_tts(
                    script,
                    audio_path
                )
            )

            print(
                f"✅ Audio saved: {audio_path}"
            )

        except Exception as e:

            print(
                f"❌ TTS Error: {e}"
            )

            update_job_status(
                base_filename,
                "failed"
            )

                    if "meta" not in job_status[base_filename]:
                        job_status[base_filename]["meta"] = {
                            "timestamps": {}
                        }

                    if "timestamps" not in job_status[base_filename]["meta"]:
                        job_status[base_filename]["meta"]["timestamps"] = {}

                    job_status[base_filename]["meta"]["timestamps"]["failed_at"] = (
                        datetime.datetime.now(
                            datetime.timezone.utc
                        ).isoformat()
                    )

            remove_failed_generation_cache(base_filename)
            return

        # --------------------------
        # Try AI Avatar Video
        # --------------------------
        avatar_video_url = None
        renderer_used = "did"

        try:
            print(
                "🤖 Trying D-ID AI Avatar..."
            )

            avatar_video_url = create_avatar_video(
                audio_path
            )

            print(
                f"✅ D-ID avatar video ready: "
                f"{avatar_video_url}"
            )

            video_response = requests.get(
                avatar_video_url,
                timeout=120,
            )

            video_response.raise_for_status()

            with open(
                final_video,
                "wb"
            ) as video_file:
                video_file.write(
                    video_response.content
                )

            print(
                f"✅ Avatar video downloaded: "
                f"{final_video}"
            )

        except Exception as avatar_error:

            print(
                f"⚠️ D-ID avatar generation failed: "
                f"{avatar_error}"
            )

            print(
                "🔄 Falling back to local FFmpeg renderer..."
            )

            # --------------------------
            # Fallback: FFmpeg
            # --------------------------
            input_video = get_celebrity_video(
                data.celebrity
            )

            if not os.path.exists(input_video):
                print(
                    f"❌ Fallback video not found at "
                    f"{input_video}"
                )

                update_job_status(
                    base_filename,
                    "failed"
                )

                return

            ffmpeg_command = (
                f'ffmpeg -y -stream_loop -1 '
                f'-i "{input_video}" '
                f'-i "{audio_path}" '
                f'-map 0:v:0 -map 1:a:0 '
                f'-c:v copy -c:a aac -shortest '
                f'"{final_video}"'
            )

            print(
                "🎥 Running fallback FFmpeg command..."
            )

            os.system(ffmpeg_command)

            if not os.path.exists(final_video):
                print(
                    "❌ FFmpeg fallback failed — "
                    f"video not found at {final_video}"
                )

                update_job_status(
                    base_filename,
                    "failed"
                )

                return

            print(
                "✅ FFmpeg fallback video created."
            )

        # --------------------------
        # Upload to Cloudinary
        # --------------------------
        cloudinary_url = None

        try:
            print(
                "☁️ Uploading video to Cloudinary..."
            )

            upload_result = cloudinary.uploader.upload(
                final_video,
                resource_type="video",
                folder="ai_mentor/videos",
                public_id=base_filename,
                overwrite=True,
                chunk_size=6000000,
            )

            cloudinary_url = upload_result.get(
                "secure_url"
            )

            print(
                f"✅ Cloudinary upload success: "
                f"{cloudinary_url}"
            )

        except Exception as cloud_err:

            print(
                "⚠️ Cloudinary upload failed "
                "(will fall back to local proxy): "
                f"{cloud_err}"
            )

        update_job_status(
            base_filename,
            "ready",
            cloudinary_url=cloudinary_url
        )

        print(
            "✅ Lesson ready!"
        )

        print(
            f"   Video : {final_video}"
        )

        if cloudinary_url:
            print(
                f"   Cloud : {cloudinary_url}"
            )

        # --------------------------
        # Immediate Cleanup
        # --------------------------
        if cloudinary_url:

            print(
                "🧹 Cloudinary upload succeeded. "
                "Cleaning temporary local files..."
            )

            for local_file in [
                text_path,
                audio_path,
                final_video
            ]:

                try:
                    if os.path.exists(local_file):

                        os.remove(local_file)

                        print(
                            f"🗑️ Successfully deleted: "
                            f"{local_file}"
                        )

                except Exception as cleanup_err:

                    print(
                        f"❌ Failed to delete "
                        f"{local_file}: "
                        f"{cleanup_err}"
                    )

        else:

            print(
                "⚠️ Keeping local files on disk "
                "because Cloudinary upload failed."
            )

            print(
                f"⏰ Files will be automatically "
                f"removed after "
                f"{OUTPUT_RETENTION_HOURS} hours."
            )

    except Exception as e:
        if base_filename not in shutdown_failed_jobs:
            if base_filename in job_status:
                job_status[base_filename]["status"] = "failed"

                if "meta" not in job_status[base_filename]:
                    job_status[base_filename]["meta"] = {
                        "timestamps": {}
                    }

                if "timestamps" not in job_status[base_filename]["meta"]:
                    job_status[base_filename]["meta"]["timestamps"] = {}

                job_status[base_filename]["meta"]["timestamps"]["failed_at"] = (
                    datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat()
                )

        update_job_status(
            base_filename,
            "failed"
        )

        print(
            f"❌ Error generating lesson: {e}"
        )

        log_event("ERROR", "Lesson generation failed", job=base_filename, error=short_error(e))
        traceback.print_exc()
