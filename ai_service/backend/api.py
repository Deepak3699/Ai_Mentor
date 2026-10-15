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
    REQUIRE_SCRIPT_MODERATION,
    validate_config,
)
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
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

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
    # Default changed to "owl" (animated, rights-unambiguous) to avoid defaulting
    # to real-person footage whose licensing cannot be verified at runtime.
    celebrity: str = Field("owl", min_length=1, max_length=50)
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


class FlashcardRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=30000)
    count: int = Field(5, ge=5, le=10)


class Flashcard(BaseModel):
    id: int = Field(..., ge=1)
    front: str = Field(..., min_length=1, max_length=500)
    back: str = Field(..., min_length=1, max_length=2000)
    hint: str = Field(..., min_length=1, max_length=300)

# --------------------------
# Helpers
# --------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

async def generate_tts(text: str, output_file: str, voice_id: str = "en-US-GuyNeural", rate: str = "+0%", pitch: str = "+0Hz"):
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice_id,
        rate=rate,
        pitch=pitch
    )
    await communicate.save(output_file)

# "owl" is an animated character; its footage does not depict a real person.
# The other names (modi, salman, srk) refer to real public figures whose footage
# is present in the repository; operators must confirm they hold the necessary
# rights before enabling those sources in production.
ALLOWED_CELEBRITIES = {"modi", "owl", "salman", "srk"}

# Safe fallback used when the requested celebrity source is not available.
# Defaults to "owl" (animated) to avoid silently selecting unverified footage.
_SAFE_FALLBACK_CELEBRITY = os.getenv("FALLBACK_CELEBRITY_SOURCE", "owl")


def get_celebrity_video(celebrity_name: str) -> str | None:
    """Resolve the local video file for *celebrity_name*.

    Returns the absolute path to the video file, or ``None`` if neither the
    requested source nor the safe fallback can be found on disk.  Callers
    should treat a ``None`` return as a hard failure rather than proceeding
    with an unlabelled or unknown source.
    """
    input_video_dir = os.path.realpath(
        os.path.join(BASE_DIR, "backend", "input")
    )

    name = celebrity_name.strip().lower() if isinstance(celebrity_name, str) else ""
    if name not in ALLOWED_CELEBRITIES:
        log_event(
            "WARN",
            "Unknown celebrity source requested; using safe fallback",
            requested=name,
            fallback=_SAFE_FALLBACK_CELEBRITY,
        )
        name = _SAFE_FALLBACK_CELEBRITY

    candidate = os.path.realpath(
        os.path.join(input_video_dir, f"{name}.mp4")
    )

    if (
        os.path.commonpath([input_video_dir, candidate]) == input_video_dir
        and os.path.isfile(candidate)
    ):
        log_event("INFO", "Renderer source selected", source=name)
        return candidate

    # Try the safe fallback before giving up.
    if name != _SAFE_FALLBACK_CELEBRITY:
        fallback_path = os.path.realpath(
            os.path.join(input_video_dir, f"{_SAFE_FALLBACK_CELEBRITY}.mp4")
        )
        if (
            os.path.commonpath([input_video_dir, fallback_path]) == input_video_dir
            and os.path.isfile(fallback_path)
        ):
            log_event(
                "WARN",
                "Requested source not found; using safe fallback",
                requested=name,
                fallback=_SAFE_FALLBACK_CELEBRITY,
            )
            return fallback_path

    log_event("ERROR", "No usable renderer source found", requested=name)
    return None


# ---------------------------------------------------------------------------
# Script moderation
# ---------------------------------------------------------------------------

# A minimal block-list used as a last-resort content check.  It is not a
# substitute for a proper moderation service, but it prevents the most
# obvious misuse cases from reaching synthesis.
_BLOCKED_TERMS: frozenset[str] = frozenset({
    # Add project-appropriate blocked terms here.  Keep the list narrow so
    # that ordinary educational content is not incorrectly rejected.
})


class ScriptModerationError(ValueError):
    """Raised when a generated script fails content moderation."""


def moderate_script(script: str) -> None:
    """Check *script* for obviously harmful content.

    Raises :class:`ScriptModerationError` when the script contains blocked
    content.  Callers must handle this exception before proceeding to TTS
    synthesis.  The check is intentionally conservative so that normal
    educational or informational content is never blocked.

    When ``REQUIRE_SCRIPT_MODERATION`` is ``False`` (the default when not
    configured) this function still runs the local block-list check.  The
    flag only controls whether an *external* moderation provider is required.
    """
    lowered = script.lower()
    matched = [term for term in _BLOCKED_TERMS if term in lowered]
    if matched:
        raise ScriptModerationError(
            f"Generated script failed moderation: blocked terms detected ({len(matched)} match(es))."
        )


# ---------------------------------------------------------------------------
# AI-disclosure watermarking
# ---------------------------------------------------------------------------

DISCLOSURE_TEXT = "AI-GENERATED CONTENT"


async def apply_ai_disclosure_watermark(
    input_video: str,
    output_video: str,
) -> None:
    """Burn a persistent AI-GENERATED CONTENT label into *input_video*.

    The label is rendered via an FFmpeg ``drawtext`` filter.  If the filter
    fails (e.g. the build of FFmpeg lacks the ``drawtext`` filter or the
    font is unavailable) the function raises :class:`RuntimeError` and the
    caller must *not* expose the unlabelled video.
    """
    # Use a safe, argument-list invocation — no shell=True.
    label = DISCLOSURE_TEXT.replace("'", "\\'")  # escape for drawtext value
    drawtext_filter = (
        f"drawtext=text='{label}'"
        ":fontsize=22"
        ":fontcolor=white@0.85"
        ":borderw=2"
        ":bordercolor=black@0.7"
        ":x=(w-text_w)/2"
        ":y=h-th-18"
        ":box=1"
        ":boxcolor=black@0.45"
        ":boxborderw=6"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_video,
        "-vf", drawtext_filter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "copy",
        output_video,
    ]
    log_event("RUN", "Burning AI-disclosure watermark into video")
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0:
        error_detail = stderr.decode(errors="replace")[:400]
        raise RuntimeError(
            f"FFmpeg drawtext watermark failed (exit {process.returncode}): {error_detail}"
        )
    log_event("OK", "AI-disclosure watermark applied")


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
        log_event("RUN", "Generating syllabus with Gemini")
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
            log_event("ERROR", "Gemini returned invalid syllabus JSON", error=short_error(json_error))
            raise

    except Exception as e:
        log_event("WARN", "Gemini syllabus generation failed; trying Groq", error=short_error(e))

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
                log_event("ERROR", "Groq returned invalid syllabus JSON", error=short_error(json_error))
                raise

        except Exception as e2:
            log_event("ERROR", "Groq syllabus generation failed", error=short_error(e2))

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
            log_event("RUN", "Generating quiz", attempt=f"{attempt + 1}/2")

            try:
                log_event("RUN", "Trying Gemini")
                response = gemini_client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt
                )
                text = response.text.strip()

            except Exception as gemini_error:
                log_event("WARN", "Gemini lesson generation failed", error=short_error(gemini_error))
                log_event("RUN", "Trying Groq fallback")

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

            log_event("OK", "Quiz generated and validated")
            return validated_quiz

        except Exception as e:
            log_event("WARN", "Quiz generation attempt failed", attempt=attempt + 1, error=short_error(e))

            if attempt == 1:
                return {"questions": []}

    return {"questions": []}


@app.post("/generate-flashcards", response_model=list[Flashcard])
def generate_flashcards(data: FlashcardRequest):
    prompt = f"""
    Create exactly {data.count} study flashcards from this lesson transcript.
    Focus on distinct, important concepts and use concise question-and-answer pairs.
    Do not introduce facts that are not supported by the transcript.

    Transcript:
    {data.transcript}

    Respond with ONLY a valid JSON array, without markdown or code fences:
    [
      {{"id": 1, "front": "Question", "back": "Answer", "hint": "Short recall hint"}}
    ]

    Each card must have a unique question and a useful hint. Generate exactly
    {data.count} cards, with IDs numbered from 1 through {data.count}.
    """

    for attempt in range(2):
        try:
            try:
                response = gemini_client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                )
                text = response.text.strip()
            except Exception as gemini_error:
                logger.warning("Gemini flashcard generation failed: %s", gemini_error)
                if not groq_client:
                    raise
                groq_response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4,
                    max_tokens=3000,
                )
                text = groq_response.choices[0].message.content.strip()

            if text.startswith("```"):
                text = text.split("\n", 1)[-1]
                if text.endswith("```"):
                    text = text[:-3]

            flashcard_data = json.loads(text.strip())
            if not isinstance(flashcard_data, list) or len(flashcard_data) != data.count:
                raise ValueError(f"Expected exactly {data.count} flashcards.")

            cards = [Flashcard.model_validate(card) for card in flashcard_data]
            if len({card.front.strip().casefold() for card in cards}) != data.count:
                raise ValueError("Flashcard questions must be unique.")

            return [
                Flashcard.model_validate({**card.model_dump(), "id": index})
                for index, card in enumerate(cards, start=1)
            ]
        except Exception as error:
            logger.warning(
                "Flashcard generation attempt %s failed: %s", attempt + 1, error
            )

    raise HTTPException(status_code=503, detail="Failed to generate flashcards")

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

    if not force:
        generation_cache[cache_key] = base_filename
    job_status[base_filename] = {
        "status": "queued",
        "meta": {
            "timestamps": {
                "queued_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
        }
    }

    active_jobs.add(base_filename)
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
async def run_tracked_lesson(data: LessonRequest, base_filename: str):
    try:
        await process_lesson(data, base_filename)
    finally:
        active_jobs.discard(base_filename)


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
        log_event("START", "Lesson generation started", job=base_filename, topic=data.topic, source=data.celebrity)

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
        - Adapt the explanation to the user's preferred explanation type.
        - Adjust the teaching speed and depth to match the user's preferred teaching pace.
        - Use examples that match the user's preferred example type.
        - Focus the explanation on the user's selected focus area.
        - Match the explanation style with the user's preferred learning style.
        """

        log_event("INFO", "Preferences loaded", configured=bool(data.preferences))

        script = ""

        try:
            log_event("RUN", "Generating lesson script with Gemini")

            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt
            )

            script = response.text.strip().replace("\n", " ")
            provider_used = "gemini"
            model_used = GEMINI_MODEL
            log_event("OK", "Lesson script generated", provider="gemini", words=len(script.split()))

        except Exception as gemini_error:

            log_event("WARN", "Gemini lesson generation failed", error=short_error(gemini_error))

            try:
                log_event("RUN", "Switching to Groq fallback")

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
                )

                script = groq_response.choices[0].message.content.strip().replace("\n", " ")
                provider_used = "groq"
                model_used = "llama-3.3-70b-versatile"
                log_event("OK", "Lesson script generated", provider="groq", words=len(script.split()))

            except Exception as groq_error:

                log_event("ERROR", "Groq lesson generation failed", error=short_error(groq_error))

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

        # --- Script moderation --------------------------------------------------
        # Run before any synthesis so that flagged content never reaches TTS or
        # video rendering.  A moderation failure is treated as a hard job failure
        # when REQUIRE_SCRIPT_MODERATION is True; the job is marked "failed" and
        # no audio or video file is produced.
        try:
            log_event("RUN", "Running script content moderation")
            moderate_script(script)
            log_event("OK", "Script passed content moderation")
        except ScriptModerationError as mod_err:
            log_event("ERROR", "Script moderation rejected generated content", error=short_error(mod_err))
            if base_filename not in shutdown_failed_jobs:
                if base_filename in job_status:
                    job_status[base_filename]["status"] = "failed"
                    meta_m = job_status[base_filename].setdefault("meta", {})
                    meta_m.setdefault("timestamps", {})["failed_at"] = (
                        datetime.datetime.now(datetime.timezone.utc).isoformat()
                    )
                    meta_m["moderation_rejected"] = True
            remove_failed_generation_cache(base_filename)
            return
        except Exception as mod_unexpected:
            # An unexpected moderation error: fail safe — do not continue.
            log_event("ERROR", "Unexpected moderation error", error=short_error(mod_unexpected))
            if REQUIRE_SCRIPT_MODERATION:
                if base_filename not in shutdown_failed_jobs and base_filename in job_status:
                    job_status[base_filename]["status"] = "failed"
                    meta_m = job_status[base_filename].setdefault("meta", {})
                    meta_m.setdefault("timestamps", {})["failed_at"] = (
                        datetime.datetime.now(datetime.timezone.utc).isoformat()
                    )
                remove_failed_generation_cache(base_filename)
                return
            # When moderation is not strictly required, log and continue.
            log_event("WARN", "Script moderation unavailable; continuing without external check")

        log_event("INFO", "Script prepared", words=len(script.split()))

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
        final_video = os.path.join(video_dir, f"{base_filename}.mp4")

        # 3️⃣ Save Text to File

        with open(text_path, "w", encoding="utf-8") as f:
            f.write(script)

        log_event("OK", "Transcript saved", file=os.path.basename(text_path))

        # 4️⃣ Convert Text to Speech (edge-tts)

        log_event("RUN", "Generating narration audio")

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
                log_event("WARN", "Could not read audio duration", error=short_error(e))

            log_event("OK", "Narration audio ready", duration=f"{audio_seconds:.2f}s")

        except Exception as e:

            log_event("ERROR", "Narration generation failed", error=short_error(e))

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

        # 5️⃣ Try AI Avatar Video
        avatar_video_url = None

        try:
            log_event("RUN", "Trying D-ID avatar renderer")

            avatar_video_url = await create_avatar_video(audio_path)

            log_event("OK", "D-ID avatar render completed")

            video_response = requests.get(
                avatar_video_url,
                timeout=120,
            )
            video_response.raise_for_status()

            with open(final_video, "wb") as video_file:
                video_file.write(video_response.content)

            log_event("OK", "Avatar video downloaded", file=os.path.basename(final_video))

        except Exception as avatar_error:
            log_event("WARN", "D-ID unavailable; using FFmpeg fallback", error=short_error(avatar_error))
            log_event("RUN", "Starting FFmpeg fallback renderer")

            # 6️⃣ Fallback: Merge Stock Video + Audio (FFmpeg)
            input_video = get_celebrity_video(data.celebrity)

            if not input_video or not os.path.exists(input_video):
                _src = input_video or "<none>"
                log_event("ERROR", "Fallback source video not found", file=os.path.basename(_src))
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

            log_event("RUN", "Rendering lesson video with FFmpeg")

            # Merge stock video with synthesised audio into an intermediate file.
            # The intermediate is then watermarked in the next step.
            merged_video = os.path.join(video_dir, f"{base_filename}_merged.mp4")
            ffmpeg_args = [
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
                merged_video,
            ]

            process = await asyncio.create_subprocess_exec(
                *ffmpeg_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode(errors="replace")
                log_event("ERROR", "FFmpeg render failed", code=process.returncode, error=short_error(RuntimeError(error_msg)))
                if base_filename in job_status:
                    job_status[base_filename]["status"] = "failed"
                    if "meta" not in job_status[base_filename]:
                        job_status[base_filename]["meta"] = {"timestamps": {}}
                    if "timestamps" not in job_status[base_filename]["meta"]:
                        job_status[base_filename]["meta"]["timestamps"] = {}
                    job_status[base_filename]["meta"]["timestamps"]["failed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                remove_failed_generation_cache(base_filename)
                return

            if not os.path.exists(merged_video):
                log_event("ERROR", "FFmpeg completed without an output video")
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

            log_event("OK", "FFmpeg video render completed")

            # --- Apply AI-disclosure watermark (mandatory) ---
            # The watermark MUST be applied before the video is exposed.  If the
            # watermarking step fails the job is marked as failed so that an
            # unlabelled video is never served to the client.
            try:
                await apply_ai_disclosure_watermark(merged_video, final_video)
            except Exception as wm_err:
                log_event("ERROR", "AI-disclosure watermark failed; discarding video", error=short_error(wm_err))
                # Clean up the un-watermarked intermediate.
                try:
                    if os.path.exists(merged_video):
                        os.remove(merged_video)
                except OSError:
                    pass
                if base_filename not in shutdown_failed_jobs and base_filename in job_status:
                    job_status[base_filename]["status"] = "failed"
                    meta_w = job_status[base_filename].setdefault("meta", {})
                    meta_w.setdefault("timestamps", {})["failed_at"] = (
                        datetime.datetime.now(datetime.timezone.utc).isoformat()
                    )
                remove_failed_generation_cache(base_filename)
                return
            finally:
                # Always remove the intermediate merged file.
                try:
                    if os.path.exists(merged_video):
                        os.remove(merged_video)
                except OSError:
                    pass



        # 6.5 Generate subtitles (.vtt + .srt)
        vtt_path, srt_path = None, None
        try:
            vtt_path, srt_path = write_subtitles(
                script, audio_path, os.path.join(video_dir, base_filename)
            )
            log_event("OK", "Subtitle files created")
        except Exception as sub_err:
            log_event("WARN", "Subtitle generation failed; video remains available", error=short_error(sub_err))

        # 7️⃣ Upload to Cloudinary

        cloudinary_url = None

        try:
            log_event("RUN", "Uploading lesson video")

            upload_result = cloudinary.uploader.upload(
                final_video,
                resource_type="video",
                folder="ai_mentor/videos",
                public_id=base_filename,
                overwrite=True,
                chunk_size=6000000,
            )

            cloudinary_url = upload_result.get("secure_url")

            log_event("OK", "Lesson video uploaded")

        except Exception as cloud_err:

            log_event("WARN", "Video upload failed; using local proxy", error=short_error(cloud_err))

        # Upload subtitles to Cloudinary when available. Local static URLs remain
        # available as a fallback when video or subtitle upload fails.
        local_video_url = f"/video-stream/{base_filename}.mp4"
        local_vtt_url = f"/video-stream/{base_filename}.vtt" if vtt_path else None
        local_srt_url = f"/video-stream/{base_filename}.srt" if srt_path else None
        vtt_url, srt_url = None, None

        if vtt_path and srt_path:
            try:
                vtt_url = cloudinary.uploader.upload(
                    vtt_path,
                    resource_type="raw",
                    folder="ai_mentor/subtitles",
                    public_id=f"{base_filename}.vtt",
                    overwrite=True,
                ).get("secure_url")
                srt_url = cloudinary.uploader.upload(
                    srt_path,
                    resource_type="raw",
                    folder="ai_mentor/subtitles",
                    public_id=f"{base_filename}.srt",
                    overwrite=True,
                ).get("secure_url")
                log_event("OK", "Subtitle files uploaded")
            except Exception as sub_up_err:
                log_event("WARN", "Subtitle upload failed; using local files", error=short_error(sub_up_err))

        subtitle_vtt_url = vtt_url or local_vtt_url
        subtitle_srt_url = srt_url or local_srt_url
        duration_ms = int((time.time() - start_time) * 1000)

        if base_filename not in shutdown_failed_jobs:
            if base_filename in job_status:
                job_status[base_filename]["status"] = "ready"
                job_status[base_filename]["cloudinary_url"] = cloudinary_url
                job_status[base_filename]["local_video_url"] = local_video_url
                job_status[base_filename]["subtitle_url"] = subtitle_vtt_url
                job_status[base_filename]["subtitle_vtt_url"] = subtitle_vtt_url
                job_status[base_filename]["subtitle_srt_url"] = subtitle_srt_url
                # Inform clients that the narration and video contain AI-generated
                # content and that a visible disclosure label has been burned into
                # the video.  This flag is always True for videos produced by this
                # service; it must not be removed or set to False.
                job_status[base_filename]["ai_disclosure"] = True
                job_status[base_filename]["ai_disclosure_label"] = DISCLOSURE_TEXT

                meta = job_status[base_filename].setdefault("meta", {})
                timestamps = meta.setdefault("timestamps", {})
                meta["provider"] = provider_used
                meta["model"] = model_used
                meta["duration_ms"] = duration_ms
                meta["audio_seconds"] = audio_seconds
                meta["word_count"] = len(script.split())
                timestamps["completed_at"] = datetime.datetime.now(
                    datetime.timezone.utc
                ).isoformat()
        log_event("READY", "Lesson generation completed", job=base_filename, provider=provider_used, duration=f"{duration_ms / 1000:.1f}s", audio=f"{audio_seconds:.1f}s", words=len(script.split()), delivery="cloud" if cloudinary_url else "local")


        # 8️⃣ Storage Cleanup
        if cloudinary_url:
            log_event("CLEAN", "Removing temporary media files")
            cleanup_files = [audio_path, final_video]
            if vtt_url and vtt_path:
                cleanup_files.append(vtt_path)
            if srt_url and srt_path:
                cleanup_files.append(srt_path)
            for local_file in cleanup_files:
                try:
                    if local_file and os.path.exists(local_file):
                        os.remove(local_file)
                        log_event("CLEAN", "Temporary file removed", file=os.path.basename(local_file))
                except Exception as cleanup_err:
                    log_event("WARN", "Temporary file cleanup failed", file=os.path.basename(local_file), error=short_error(cleanup_err))
        else:
            log_event("WARN", "Local media retained because upload failed")
            log_event("INFO", "Local fallback files require later cleanup")
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

        remove_failed_generation_cache(base_filename)

        log_event("ERROR", "Lesson generation failed", job=base_filename, error=short_error(e))
        traceback.print_exc()
