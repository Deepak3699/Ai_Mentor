import subprocess
import time
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
from groq import Groq
from cachetools import TTLCache
from subtitles import write_subtitles
from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GROQ_API_KEY,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    GROQ_ENABLED,
    CLOUDINARY_ENABLED,
    validate_config,
)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
import voices
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
# GROQ Client (Fallback)
# --------------------------
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_ENABLED else None

# --------------------------
# GROQ Client (Fallback)
# --------------------------
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_ENABLED else None

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

class QuizRequest(BaseModel):
    lesson: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    explanation: str


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]

# --------------------------
# Helpers
# --------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def generate_tts(
    text: str,
    output_file: str,
    voice_id: str = "en-US-GuyNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
):
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice_id,
        rate=rate,
        pitch=pitch,
    )
    await communicate.save(output_file)


def get_celebrity_video(celebrity_name: str):
    input_video_dir = os.path.join(BASE_DIR, "backend", "input")
    celebrity_video = os.path.join(input_video_dir, f"{celebrity_name.lower()}.mp4")

    if os.path.exists(celebrity_video):
        print(f"🎬 Using celebrity video: {celebrity_video}")
        return celebrity_video
    else:
        input_video = os.path.join(input_video_dir, "modi.mp4")
        print(f"🎬 Using default video: {input_video}")
        return input_video

# --------------------------
# Serve Files
# --------------------------

base_output_path = os.path.join(BASE_DIR, "outputs")
video_output_path = os.path.join(base_output_path, "video")
text_output_path = os.path.join(base_output_path, "text")

os.makedirs(video_output_path, exist_ok=True)
os.makedirs(text_output_path, exist_ok=True)

app.mount("/video-stream", StaticFiles(directory=video_output_path), name="video-stream")
app.mount("/transcript-stream", StaticFiles(directory=text_output_path), name="transcript-stream")

# --------------------------
# Root Route
# --------------------------
@app.get("/")
def home():
    return {"message": "AI Lesson Generator Backend Running"}

@app.get("/transcript/{filename}")
def get_transcript(filename: str):
    file_path = os.path.join(BASE_DIR, "outputs", "text", filename)
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    return {"error": "Transcript not found"}

@app.get("/status/{job_id}")
def get_status(job_id: str):
    status_data = job_status.get(job_id, {"status": "not_found"})

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
    This endpoint is synchronous and may take several seconds to complete.

    Returns:
        A JSON object containing generated modules and lessons,
        or an error message if both AI providers fail.
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
        print("⚡ Trying Gemini Primary Model for Syllabus...")
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        text = response.text.strip()

        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]

        if text.endswith("```"):
            text = text[:-3]

        try:
            return json.loads(text.strip())
        except json.JSONDecodeError as json_error:
            print(f"❌ Gemini returned invalid JSON: {json_error}")
            raise

    except Exception as e:
        print(f"❌ Gemini failed: {e}. Trying Groq...")

        try:
            groq_response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=1000,
            )

            text = groq_response.choices[0].message.content.strip()

            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]

            if text.endswith("```"):
                text = text[:-3]

            try:
                return json.loads(text.strip())
            except json.JSONDecodeError as json_error:
                print(f"❌ Groq returned invalid JSON: {json_error}")
                raise

        except Exception as e2:
            print(f"❌ Groq failed: {e2}")

            raise HTTPException(
                status_code=503,
                detail="Failed to generate syllabus"
            )
# --------------------------
# Voices Endpoint
# --------------------------

@app.get("/voices")
def get_voices():
    return {"voices": voices.get_all_voices()}

# --------------------------
# Generate Quiz Endpoint
# --------------------------

@app.post("/generate-quiz", response_model=QuizResponse)
def generate_quiz(data: QuizRequest):
    prompt = f"""
    Generate a multiple-choice quiz for the following lesson:

    Lesson:
    {data.lesson}

    You MUST respond with ONLY a valid JSON object.
    Do not include markdown formatting or ```json code fences.

    The JSON structure must match this exactly:
    {{
      "questions": [
        {{
          "question": "Question text",
          "options": [
            "Option A",
            "Option B",
            "Option C",
            "Option D"
          ],
          "correct_index": 0,
          "explanation": "Explanation of why the answer is correct."
        }}
      ]
    }}

    Requirements:
    - Generate exactly 4 questions.
    - Each question must have exactly 4 options.
    - correct_index must be an integer from 0 to 3.
    - Each question must have a clear explanation.
    """

    for attempt in range(2):
        try:
            print(f"⚡ Generating quiz (attempt {attempt + 1}/2)...")

            try:
                print("⚡ Trying Gemini...")
                response = gemini_client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt
                )
                text = response.text.strip()

            except Exception as gemini_error:
                print(f"❌ Gemini failed: {gemini_error}")
                print("⚡ Trying Groq fallback...")

                groq_response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.7,
                    max_tokens=2000,
                )

                text = groq_response.choices[0].message.content.strip()

            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]

            if text.endswith("```"):
                text = text[:-3]

            quiz_data = json.loads(text.strip())

            validated_quiz = QuizResponse.model_validate(quiz_data)

            if len(validated_quiz.questions) != 4:
                raise ValueError("Quiz must contain exactly 4 questions.")

            for question in validated_quiz.questions:
                if len(question.options) != 4:
                    raise ValueError(
                        "Each question must contain exactly 4 options."
                    )

                if not 0 <= question.correct_index < 4:
                    raise ValueError(
                        "correct_index must be between 0 and 3."
                    )

            print("✅ Quiz generated and validated successfully.")
            return validated_quiz

        except Exception as e:
            print(f"❌ Quiz generation attempt {attempt + 1} failed: {e}")

            if attempt == 1:
                return {"questions": []}

    return {"questions": []}

# --------------------------
# Generate Lesson Endpoint
# --------------------------

job_status = {}
generation_cache = {}
active_jobs = set()
shutdown_failed_jobs = set()
shutting_down = False
# Job status cache:
# - Entries expire automatically after 1 hour.
# - Cache is limited to 1000 jobs.
# - This prevents the dictionary from growing indefinitely.
job_status = TTLCache(
    maxsize=1000,
    ttl=3600
)

generation_cache = TTLCache(maxsize=1000, ttl=3600)

@app.post("/generate")
def generate_lesson(
    data: LessonRequest,
    background_tasks: BackgroundTasks,
    force: bool = False,
):
    if shutting_down:
        raise HTTPException(
            status_code=503,
            detail="Service is shutting down; new jobs are not accepted.",
        )

    cache_data = json.dumps(
        {
            "course": data.course,
            "topic": data.topic,
            "celebrity": data.celebrity,
            "language": data.language,
            "voice_id": data.voice_id,
            "gender": data.gender,
            "speech_rate": data.speech_rate,
            "speech_pitch": data.speech_pitch,
            "preferences": data.preferences,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    cache_key = hashlib.sha256(
        cache_data.encode("utf-8")
    ).hexdigest()

    topic_clean = re.sub(
        r'[^\w\s-]', '', data.topic
    ).strip().replace(" ", "_")
    topic_clean = topic_clean[:81]
    if force:
        base_filename = f"{topic_clean}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')}_{uuid.uuid4().hex[:8]}"
    else:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        base_filename = f"{topic_clean}_{timestamp}"

    if not force and cache_key in generation_cache:
        base_filename = generation_cache[cache_key]
        existing_status = job_status.get(
            base_filename,
            {"status": "processing"}
        )

        return {
            "status": existing_status.get("status", "processing").capitalize(),
            "filename": f"{base_filename}.mp4",
            "text_file": f"{base_filename}.txt",
            "audio_file": f"{base_filename}.mp3",
            "jobId": base_filename,
            "cached": True,
        }

    topic_clean = re.sub(
        r'[^\w\s-]', '', data.topic
    ).strip().replace(" ", "_")

    if force:
        base_filename = f"{topic_clean}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')}_{uuid.uuid4().hex[:8]}"
    else:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        base_filename = f"{topic_clean}_{timestamp}"

    job_status[base_filename] = {"status": "processing"}

    if not force:
        generation_cache[cache_key] = base_filename

    background_tasks.add_task(run_tracked_lesson, data, base_filename)

    return {
        "status": "Processing",
        "filename": f"{base_filename}.mp4",
        "text_file": f"{base_filename}.txt",
        "audio_file": f"{base_filename}.mp3",
        "jobId": base_filename,
        "cached": False,
    }


def remove_failed_generation_cache(base_filename: str) -> None:
    """Remove cache entries that still point to this failed job."""
    for key, cached_filename in list(generation_cache.items()):
        if cached_filename == base_filename:
            generation_cache.pop(key, None)


# --------------------------
# Background Task Logic
# --------------------------

DEFAULT_LESSON_JOB_TIMEOUT = 120.0
LESSON_JOB_TIMEOUT = DEFAULT_LESSON_JOB_TIMEOUT

async def _cleanup_subprocess(proc):
    """Terminate a running subprocess and wait for it to exit."""
    if proc is None or proc.returncode is not None:
        return

    try:
        proc.terminate()
    except ProcessLookupError:
        pass

    try:
        await asyncio.wait_for(proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
    except ProcessLookupError:
        pass

async def run_tracked_lesson(
    data: LessonRequest,
    base_filename: str,
    timeout_seconds: float | None = None,
):
    """Track a lesson job and mark it failed if it exceeds its deadline."""
    timeout = (
        LESSON_JOB_TIMEOUT
        if timeout_seconds is None
        else timeout_seconds
    )

    if base_filename in shutdown_failed_jobs:
        active_jobs.discard(base_filename)
        return

    active_jobs.add(base_filename)

    try:
        await asyncio.wait_for(
            process_lesson(data, base_filename),
            timeout=timeout,
        )

        if base_filename in shutdown_failed_jobs:
            status_data = job_status.get(base_filename, {})
            status_data["status"] = "failed"
            job_status[base_filename] = status_data



    except asyncio.TimeoutError:
        logger.error("Lesson job %s timed out", base_filename)
        shutdown_failed_jobs.add(base_filename)

        status_data = job_status.get(base_filename, {})
        if not isinstance(status_data, dict):
            status_data = {}

        status_data["status"] = "failed"
        status_data["reason"] = "Lesson generation timed out"
        status_data.setdefault("meta", {}).setdefault(
            "timestamps", {}
        )["failed_at"] = datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat()

        job_status[base_filename] = status_data
        remove_failed_generation_cache(base_filename)


    except Exception:
        logger.exception("Lesson job %s failed", base_filename)

        if base_filename not in shutdown_failed_jobs:
            status_data = job_status.get(base_filename, {})
            if not isinstance(status_data, dict):
                status_data = {}

            status_data["status"] = "failed"
            status_data["reason"] = "Lesson generation failed"
            status_data.setdefault("meta", {}).setdefault(
                "timestamps", {}
            )["failed_at"] = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()

            job_status[base_filename] = status_data
            remove_failed_generation_cache(base_filename)
    finally:
        active_jobs.discard(base_filename)

async def process_lesson(data: LessonRequest, base_filename: str):

    print("\n📥 RAW REQUEST DATA:")
    print(data.dict())

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
        print(f"\n🚀 Starting generation for: {data.topic} ({data.celebrity})")

        preferences_text = ""

        if data.preferences:
            preferences_text = f"""
        User Preferences:
        - Learning Goal: {data.preferences.get("learning_goal", "Not specified")}
        - Interested Topics: {", ".join(data.preferences.get("interested_topics", [])) if isinstance(data.preferences.get("interested_topics"), list) else data.preferences.get("interested_topics", "Not specified")}
        - Experience Level: {data.preferences.get("experience_level", "Not specified")}
        - Weekly Commitment: {data.preferences.get("weekly_commitment", "Not specified")}
        - Learning Style: {data.preferences.get("learning_style", "Not specified")}
        """
        else:
            preferences_text = "User Preferences: Not provided"

        prompt = f"""
        Create a 50 word educational explanation about '{data.topic}' in the subject '{data.course}'.

        Rules:
        - {data.language or "English"} only
        - Simple classroom teaching tone
        - Between 45 and 60 words

        Narration style inspired by the celebrity {data.celebrity}.

        {preferences_text}

        Instructions:
        - Adapt explanation based on user's experience level
        - Adjust depth based on learning goal
        - Match explanation style with preferred learning style
        """

        print("\n📊 USER PREFERENCES:\n")
        print(data.preferences if data.preferences else "No preferences provided")

        job_status[base_filename]["status"] = "GENERATING_SCRIPT"
        job_status[base_filename]["stage"] = "GENERATING_SCRIPT"

        script = ""
        max_retries = 2

        for attempt in range(max_retries + 1):
            try:
                print(
                    f"⚡ Trying Gemini Primary Model "
                    f"(attempt {attempt + 1}/{max_retries + 1})..."
                )

                response = gemini_client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                )

                script = (response.text or "").strip().replace("\n", " ")

                if script:
                     provider_used = "gemini"
                     model_used = GEMINI_MODEL
                     print("✅ Gemini response generated")
                     break

                print("⚠️ Gemini returned an empty response")

            except Exception as gemini_error:
                print(
                    f"❌ Gemini attempt {attempt + 1} failed: "
                    f"{gemini_error}"
                )

            if attempt < max_retries:
                time.sleep(1 * (attempt + 1))

        if not script and GROQ_ENABLED and groq_client:
            for attempt in range(max_retries + 1):
                try:
                    print(
                        f"⚡ Trying Groq fallback "
                        f"(attempt {attempt + 1}/{max_retries + 1})..."
                    )

                    groq_response = groq_client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        messages=[
                            {
                                "role": "user",
                                "content": prompt,
                            }
                        ],
                        temperature=0.7,
                        max_tokens=300,
                    )

                    script = (
                        groq_response.choices[0].message.content or ""
                    ).strip().replace("\n", " ")

                    if script:
                        provider_used = "groq"
                        model_used = "llama-3.3-70b-versatile"
                        print("✅ Groq fallback response generated")
                        break

                    print("⚠️ Groq returned an empty response")

                except Exception as groq_error:
                    print(
                        f"❌ Groq attempt {attempt + 1} failed: "
                        f"{groq_error}"
                    )

                if attempt < max_retries:
                    time.sleep(1 * (attempt + 1))


        if not script:
            job_status[base_filename]["status"] = "failed"
            job_status[base_filename]["reason"] = "Lesson script generation failed"
            job_status[base_filename].setdefault("meta", {}).setdefault(
                "timestamps", {}
            )["failed_at"] = datetime.datetime.now(
                datetime.timezone.utc
            ).isoformat()
            remove_failed_generation_cache(base_filename)
            return



        print(f"📝 Generated text: {script}")
        # 2️⃣ Create Output Folders

        base_output_dir = os.path.join(BASE_DIR, "outputs")
        text_dir = os.path.join(base_output_dir, "text")
        audio_dir = os.path.join(base_output_dir, "audio")
        video_dir = os.path.join(base_output_dir, "video")

        os.makedirs(text_dir, exist_ok=True)
        os.makedirs(audio_dir, exist_ok=True)
        os.makedirs(video_dir, exist_ok=True)

        text_path = os.path.join(text_dir, f"{base_filename}.txt")

        audio_path = os.path.join(audio_dir, f"{base_filename}.mp3")
        audio_path = os.path.join(audio_dir, f"{base_filename}.mp3")
        final_video = os.path.join(video_dir, f"{base_filename}.mp4")

        # 3️⃣ Save Text to File

        with open(text_path, "w", encoding="utf-8") as f:
            f.write(script)

        print(f"💾 Saved text to: {text_path}")

     # 4️⃣ Convert Text to Speech (edge-tts)

        job_status[base_filename]["status"] = "SYNTHESIZING_AUDIO"
        job_status[base_filename]["stage"] = "SYNTHESIZING_AUDIO"

        print("🎵 Starting TTS generation...")

        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)

            # Validate voice or fallback
            selected_voice = voices.get_voice(data.voice_id)

            rate = data.speech_rate if data.speech_rate else "+0%"
            pitch = data.speech_pitch if data.speech_pitch else "+0Hz"

            await generate_tts(script, audio_path, voice_id=selected_voice, rate=rate, pitch=pitch)

            try:
                audio = MP3(audio_path)
                audio_seconds = audio.info.length
            except Exception as e:
                print(f"⚠️ Could not calculate audio duration: {e}")

            print(f"✅ Audio saved: {audio_path} ({audio_seconds:.2f}s)")

        except Exception as e:
            print(f"❌ TTS Error: {e}")

            job_status[base_filename] = {
                "status": "FAILED",
                "stage": "FAILED",
                "reason": f"Audio synthesis failed: {e}",
            }

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

            remove_failed_generation_cache(base_filename)
            return

                # 5. Try AI Avatar Video first
        try:
            print("🤖 Trying D-ID AI Avatar...")

            avatar_video_url = await create_avatar_video(audio_path)

            video_response = requests.get(
                avatar_video_url,
                timeout=120,
            )
            video_response.raise_for_status()

            with open(final_video, "wb") as video_file:
                video_file.write(video_response.content)

            print(f"✅ Avatar video downloaded: {final_video}")

        except Exception as avatar_error:
            print(f"⚠️ Avatar generation failed: {avatar_error}")
            print("🔄 Falling back to local FFmpeg renderer...")

            # 6. Use FFmpeg only if avatar generation fails
            input_video = get_celebrity_video(data.celebrity)

            if not input_video or not os.path.exists(input_video):
                error_message = "Fallback video file not found"

                job_status[base_filename] = {
                    "status": "failed",
                    "reason": error_message,
                }
                remove_failed_generation_cache(base_filename)
                return

            ffmpeg_command = [
                "ffmpeg",
                "-y",
                "-stream_loop", "-1",
                "-i", input_video,
                "-i", audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                final_video,
            ]


            proc = None
            try:
                proc = await asyncio.create_subprocess_exec(
                    *ffmpeg_command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )

                await asyncio.wait_for(
                    proc.communicate(),
                    timeout=300,
                )

                if proc.returncode != 0:
                    raise RuntimeError(
                        f"FFmpeg exited with code {proc.returncode}"
                    )

                print(f"✅ FFmpeg video created: {final_video}")

            except asyncio.CancelledError:
                await _cleanup_subprocess(proc)
                raise

            except Exception as ffmpeg_error:
                await _cleanup_subprocess(proc)
                logger.exception("FFmpeg failed: %s", ffmpeg_error)

                job_status[base_filename] = {
                    "status": "failed",
                    "reason": "Video rendering failed",
                }
                remove_failed_generation_cache(base_filename)
                return

        # Verify that either video-generation path produced a file
        if not os.path.isfile(final_video) or os.path.getsize(final_video) == 0:
            job_status[base_filename] = {
                "status": "failed",
                "reason": "Generated video file is missing or empty",
            }
            remove_failed_generation_cache(base_filename)
            return

        # 7️⃣ Upload to Cloudinary

        cloudinary_url = None

        job_status[base_filename]["status"] = "UPLOADING"
        job_status[base_filename]["stage"] = "UPLOADING"

        try:
            print(f"☁️ Uploading video to Cloudinary...")

            upload_result = cloudinary.uploader.upload(
                final_video,
                resource_type="video",
                folder="ai_mentor/videos",
                public_id=base_filename,
                overwrite=True,
                chunk_size=6000000,
            )

            cloudinary_url = upload_result.get("secure_url")

            print(f"✅ Cloudinary upload success: {cloudinary_url}")

        except Exception as cloud_err:

            print(f"⚠️ Cloudinary upload failed (will fall back to local proxy): {cloud_err}")

        status_data = job_status.get(base_filename, {})
        if not isinstance(status_data, dict):
            status_data = {}

        meta = status_data.setdefault("meta", {})
        timestamps = meta.setdefault("timestamps", {})

        completed_at = datetime.datetime.now(datetime.timezone.utc)
        timestamps["completed_at"] = completed_at.isoformat()

        started_at = timestamps.get("started_at")
        status_data.setdefault("meta", {}).setdefault("timestamps", {})

        if started_at:
            started = datetime.datetime.fromisoformat(started_at)
            duration_ms = int(
                (completed_at - started).total_seconds() * 1000
          )
        else:
            duration_ms = 0

        meta["duration_ms"] = duration_ms
        meta["provider"] = provider_used
        meta["word_count"] = len(script.split())
        meta["audio_seconds"] = audio_seconds
        meta["model"] = model_used

        status_data["status"] = "ready"
        status_data["cloudinary_url"] = cloudinary_url
        job_status[base_filename] = status_data
        print(f"✅ Lesson ready!")
        print(f"   Video : {final_video}")

        if cloudinary_url:
            print(f"   Cloud : {cloudinary_url}")


        # 8️⃣ Storage Cleanup
        if cloudinary_url:
            print("🧹 Cleaning up temporary files from local storage...")
            for local_file in [audio_path, final_video]:
                try:
                    if local_file and os.path.exists(local_file):
                        os.remove(local_file)
                        print(f"🗑️ Successfully deleted: {local_file}")
                except Exception as cleanup_err:
                    print(f"❌ Failed to delete {local_file}: {cleanup_err}")
        else:
            print("⚠️ Keeping local audio/video files as a fallback because Cloudinary upload failed.")

    except Exception as e:
        job_status[base_filename] = {
            "status": "failed"
        }
        print(f"❌ Error generating lesson: {e}")
        traceback.print_exc()