import subprocess
import time
import os
import datetime
import re
import traceback
import asyncio
import edge_tts
import cloudinary
import cloudinary.uploader
from fastapi import FastAPI, BackgroundTasks
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
        voice="en-US-GuyNeural",
        rate="+0%",
        pitch="+0Hz"
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
            model="gemini-2.5-flash",
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
                model="llama-3.3-70b-versatile",
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
def generate_lesson(data: LessonRequest, background_tasks: BackgroundTasks):

    topic_clean = re.sub(r'[^\w\s-]', '', data.topic).strip().replace(" ", "_")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base_filename = f"{topic_clean}_{timestamp}"


    job_status[base_filename] = {
      "status": "QUEUED",
      "stage": "QUEUED",
      "created_at": time.time(),

    }


    background_tasks.add_task(process_lesson, data, base_filename)

    return {
        "status": "Processing",
        "filename": f"{base_filename}.mp4",
        "text_file": f"{base_filename}.txt",
        "audio_file": f"{base_filename}.mp3",
        "jobId": base_filename
    }

# --------------------------
# Background Task Logic
# --------------------------
def process_lesson(data: LessonRequest, base_filename: str):

    started_at = time.monotonic()
    job_timeout = 120

    def remaining_job_time():
        remaining = job_timeout - (time.monotonic() - started_at)

        if remaining <= 0:
            raise TimeoutError("Lesson generation exceeded the 120-second job timeout.")

        return remaining

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
        - 100% English only
        - No Hindi
        - No Hinglish
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

        job_status[base_filename] = {
           "status": "GENERATING_SCRIPT",
           "stage": "GENERATING_SCRIPT",
     }

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

                if not script:
                    raise RuntimeError("Gemini returned an empty script.")

                print("✅ Gemini response generated")
                break

            except Exception as gemini_error:
                print(f"❌ Gemini attempt {attempt + 1} failed: {gemini_error}")

                if attempt < max_retries:
                    time.sleep(1 * (attempt + 1))

        if not script:
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

                    if not script:
                        raise RuntimeError("Groq returned an empty script.")

                    print("✅ Groq fallback response generated")
                    break

                except Exception as groq_error:
                    print(f"❌ Groq attempt {attempt + 1} failed: {groq_error}")

                    if attempt < max_retries:
                        time.sleep(1 * (attempt + 1))

            if not script:
              job_status[base_filename] = {
                "status": "FAILED",
                "stage": "FAILED",
                "reason": (
                    "Script generation failed after retries with both "
                    "Gemini and Groq."
                ),
            }
            return

        remaining_job_time()

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

        remaining_job_time()

        # 4️⃣ Convert Text to Speech (edge-tts)

        job_status[base_filename] = {
            "status": "SYNTHESIZING_AUDIO",
            "stage": "SYNTHESIZING_AUDIO",
        }

        print("🎵 Starting TTS generation...")

        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)

            asyncio.run(generate_tts(script, audio_path))

            print(f"✅ Audio saved: {audio_path}")

        except Exception as e:
            print(f"❌ TTS Error: {e}")

            job_status[base_filename] = {
                "status": "FAILED",
                "stage": "FAILED",
                "reason": f"Audio synthesis failed: {e}",
            }

            return

        # 5️⃣ Select Video

        input_video = get_celebrity_video(data.celebrity)

        if not os.path.exists(input_video):
             print(f"❌ Error: Video file not found at {input_video}")

             job_status[base_filename] = {
               "status": "FAILED",
               "reason": f"Source video not found: {input_video}",
             }

             return

        # 6️⃣ Merge Video + Audio (FFmpeg)

        job_status[base_filename] = {
            "status": "RENDERING_VIDEO",
            "stage": "RENDERING_VIDEO",
        }


        print("🎥 Running ffmpeg command...")

        try:
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
                final_video,
            ]

            result = subprocess.run(
                ffmpeg_args,
                timeout=min(90, remaining_job_time()),
                check=False,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0 or not os.path.exists(final_video):
                error_detail = result.stderr[-1000:] if result.stderr else "FFmpeg produced no output."
                raise RuntimeError(error_detail)

        except subprocess.TimeoutExpired:
            job_status[base_filename] = {
                "status": "FAILED",
                "stage": "FAILED",
                "reason": (
                    "Video rendering timed out or exceeded the remaining "
                    "120-second job deadline."
                ),
            }
            return

        except Exception as e:
            job_status[base_filename] = {
                "status": "FAILED",
                "reason": f"Video rendering failed: {e}",
            }
            return


        # 7️⃣ Upload to Cloudinary

        cloudinary_url = None

        job_status[base_filename] = {
            "status": "UPLOADING",
            "stage": "UPLOADING",
        }

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
            "status": "COMPLETED",
            "stage": "COMPLETED",
            "cloudinary_url": cloudinary_url,
            "video_url": cloudinary_url,
            "message": (
                "Lesson generated and uploaded successfully."
                if cloudinary_url
                else "Lesson generated; using local video fallback."
            ),
        }

        print(f"✅ Lesson ready!")
        print(f"   Video : {final_video}")

        if cloudinary_url:
            print(f"   Cloud : {cloudinary_url}")


        # 8️⃣ Storage Cleanup
        if cloudinary_url:
            print("🧹 Cleaning up temporary files from local storage...")

            # Keep the transcript .txt file for future retrieval.
            for local_file in [audio_path, final_video]:
                try:
                    if os.path.exists(local_file):
                        os.remove(local_file)
                        print(f"🗑️ Successfully deleted: {local_file}")
                except Exception as cleanup_err:
                    print(f"❌ Failed to delete {local_file}: {cleanup_err}")
        else:
            print("⚠️ Keeping local audio/video files as a fallback because Cloudinary upload failed.")

    except Exception as e:
        reason = str(e)

        job_status[base_filename] = {
            "status": "FAILED",
            "stage": "FAILED",
            "reason": (
                reason
                if reason
                else "An unexpected error occurred during lesson generation."
            ),
        }

        print(f"❌ Error generating lesson: {reason}")
        traceback.print_exc()