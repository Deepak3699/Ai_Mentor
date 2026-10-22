import subprocess
import os
import datetime
import re
import traceback
import asyncio
import edge_tts
import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from google import genai
from groq import Groq
from config import (
    GEMINI_API_KEY,
    GROQ_API_KEY,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
)

# --------------------------
# Cloudinary Config
# --------------------------
cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET,
    secure=True,
)

# --------------------------
# FastAPI App
# --------------------------
app = FastAPI(title="AI Lesson Generator")

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
    api_key=GEMINI_API_KEY
)

# --------------------------
# GROQ Client (Fallback)
# --------------------------
groq_client = Groq(
    api_key=GROQ_API_KEY
)

# --------------------------
# Request Model
# --------------------------
class LessonRequest(BaseModel):
    course: str
    topic: str
    celebrity: str
    preferences: dict | None = None
    language: str = "English"
    gender: str | None = None
    voice_id: str | None = None

class SyllabusRequest(BaseModel):
    course_title: str
    category: str | None = None

# --------------------------
# Helpers
# --------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LANGUAGE_CODES = {
    "english": "en",
    "spanish": "es",
    "french": "fr",
    "hindi": "hi",
    "bengali": "bn",
    "portuguese": "pt",
    "japanese": "ja",
    "chinese": "zh",
    "german": "de",
    "arabic": "ar",
    "italian": "it",
    "korean": "ko",
    "russian": "ru",
    "tamil": "ta",
    "telugu": "te",
}


async def select_voice(
    language: str,
    gender: str | None,
    voice_id: str | None,
):
    try:
        voices = await edge_tts.list_voices()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve available text-to-speech voices.",
        ) from exc

    if voice_id:
        selected = next(
            (
                voice for voice in voices
                if voice.get("ShortName") == voice_id
            ),
            None,
        )
        if selected is None:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown voice_id: {voice_id}",
            )
        return selected["ShortName"]

    language_code = LANGUAGE_CODES.get(language.strip().casefold())
    if not language_code:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported language: {language}",
        )

    normalized_gender = gender.strip().casefold() if gender else None
    if normalized_gender and normalized_gender not in {"male", "female"}:
        raise HTTPException(
            status_code=422,
            detail="gender must be 'male' or 'female'.",
        )

    candidates = [
        voice for voice in voices
        if voice.get("Locale", "").casefold().startswith(
            language_code + "-"
        )
        and (
            normalized_gender is None
            or voice.get("Gender", "").casefold() == normalized_gender
        )
    ]

    if not candidates:
        raise HTTPException(
            status_code=422,
            detail=(
                f"No available voice for language '{language}' "
                f"and gender '{gender}'."
            ),
        )

    return candidates[0]["ShortName"]


async def generate_tts(
    text: str,
    output_file: str,
    voice_id: str = "en-US-GuyNeural",
):
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice_id,
        rate="+0%",
        pitch="+0Hz",
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


# Available Voices Route
@app.get("/voices")
async def get_voices():
    try:
        voices = await edge_tts.list_voices()
        return [
            {
                "voice_id": voice["ShortName"],
                "language": voice["Locale"],
                "gender": voice["Gender"],
                "name": voice.get("FriendlyName", voice["ShortName"]),
            }
            for voice in voices
        ]
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve available text-to-speech voices.",
        ) from exc


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
            model="gemini-3.8-flash",
            contents=prompt
        )
        text = response.text.strip()
        if text.startswith("```json"): text = text[7:]
        if text.startswith("```"): text = text[3:]
        if text.endswith("```"): text = text[:-3]
        return json.loads(text.strip())
    except Exception as e:
        print(f"❌ Gemini failed: {e}. Trying Groq...")
        try:
            groq_response = groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{ "role": "user", "content": prompt }],
                temperature=0.7,
                max_tokens=1000,
            )
            text = groq_response.choices[0].message.content.strip()
            if text.startswith("```json"): text = text[7:]
            if text.startswith("```"): text = text[3:]
            if text.endswith("```"): text = text[:-3]
            return json.loads(text.strip())
        except Exception as e2:
            print(f"❌ Groq failed: {e2}")
            return {"error": "Failed to generate syllabus"}

# --------------------------
# Generate Lesson Endpoint
# --------------------------

job_status = {}

@app.post("/generate")
async def generate_lesson(
    data: LessonRequest,
    background_tasks: BackgroundTasks,
):
    selected_voice = await select_voice(
        data.language,
        data.gender,
        data.voice_id,
    )

    topic_clean = re.sub(
        r"[^\w\s-]", "", data.topic
    ).strip().replace(" ", "_")

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base_filename = f"{topic_clean}_{timestamp}"

    job_status[base_filename] = {"status": "processing"}

    background_tasks.add_task(
        process_lesson,
        data,
        base_filename,
        selected_voice,
    )

    return {
        "status": "Processing",
        "filename": f"{base_filename}.mp4",
        "text_file": f"{base_filename}.txt",
        "audio_file": f"{base_filename}.mp3",
        "jobId": base_filename,
    }

# --------------------------
# Background Task Logic
# --------------------------
def process_lesson(
    data: LessonRequest,
    base_filename: str,
    selected_voice: str,
):

    print("\n📥 RAW REQUEST DATA:")
    print(data.dict())

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
        - Write the explanation entirely in {data.language}.
        - Use the correct script and natural phrasing for that language.
        - Keep technical terms and code accurate.
        - Use a simple classroom teaching tone.
        - Keep the explanation between 45 and 60 words.

        Narration style inspired by the celebrity {data.celebrity}.

        {preferences_text}

        Instructions:
        - Adapt explanation based on user's experience level
        - Adjust depth based on learning goal
        - Match explanation style with preferred learning style
        """

        print("\n📊 USER PREFERENCES:\n")
        print(data.preferences if data.preferences else "No preferences provided")

        script = ""

        try:
            print("⚡ Trying Gemini Primary Model...")

            response = gemini_client.models.generate_content(
                model="gemini-3.8-flash",
                contents=prompt
            )

            script = response.text.strip().replace("\n", " ")

            print("✅ Gemini response generated")

        except Exception as gemini_error:

            print(f"❌ Gemini failed: {gemini_error}")

            try:
                print("⚡ Switching to Groq fallback...")

                groq_response = groq_client.chat.completions.create(
                    model="openai/gpt-oss-120b",
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

                print("✅ Groq fallback response generated")

            except Exception as groq_error:

                print(f"❌ Groq also failed: {groq_error}")

                job_status[base_filename] = {
                    "status": "failed"
                }

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
        final_video = os.path.join(video_dir, f"{base_filename}.mp4")

        # 3️⃣ Save Text to File

        with open(text_path, "w", encoding="utf-8") as f:
            f.write(script)

        print(f"💾 Saved text to: {text_path}")

        # 4️⃣ Convert Text to Speech (edge-tts)

        print("🎵 Starting TTS generation...")

        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)

            asyncio.run(
                generate_tts(script, audio_path, selected_voice)
            )

            print(f"✅ Audio saved: {audio_path}")

        except Exception as e:

            print(f"❌ TTS Error: {e}")

            return

        # 5️⃣ Select Video

        input_video = get_celebrity_video(data.celebrity)

        if not os.path.exists(input_video):
            print(f"❌ Error: Video file not found at {input_video}")
            return

        # 6️⃣ Merge Video + Audio (FFmpeg)

        ffmpeg_path = (
            r"C:\Users\bisha\Downloads\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
        )

        if not os.path.isfile(ffmpeg_path):
            print(f"❌ FFmpeg executable not found: {ffmpeg_path}")
            job_status[base_filename] = {"status": "failed"}
            return

        ffmpeg_command = [
            ffmpeg_path,
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

        print("🎥 Running FFmpeg command...")

        result = subprocess.run(
            ffmpeg_command,
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode != 0:
            print(f"❌ FFmpeg failed with exit code {result.returncode}")
            print(result.stderr)
            job_status[base_filename] = {"status": "failed"}
            return

        if not os.path.isfile(final_video):
            print(f"❌ Final video was not created: {final_video}")
            job_status[base_filename] = {"status": "failed"}
            return

        print(f"✅ Video created successfully: {final_video}")

        # 7️⃣ Upload to Cloudinary

        cloudinary_url = None

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

        job_status[base_filename] = {
            "status": "ready",
            "cloudinary_url": cloudinary_url,
        }

        print(f"✅ Lesson ready!")
        print(f"   Video : {final_video}")

        if cloudinary_url:
            print(f"   Cloud : {cloudinary_url}")

        # 8️⃣ Storage Cleanup
        if cloudinary_url:
            print("🧹 Cleaning up temporary files from local storage...")
            for local_file in [text_path, audio_path, final_video]:
                try:
                    if os.path.exists(local_file):
                        os.remove(local_file)
                        print(f"🗑️ Successfully deleted: {local_file}")
                except Exception as cleanup_err:
                    print(f"❌ Failed to delete {local_file}: {cleanup_err}")
        else:
            print("⚠️ Keeping local files on disk as a fallback proxy since Cloudinary upload failed.")
            print("⚠️ Note: These files will remain until the server is restarted or manually cleaned.")
    except Exception as e:

        job_status[base_filename] = {
            "status": "failed"
        }

        print(f"❌ Error generating lesson: {e}")

        traceback.print_exc()