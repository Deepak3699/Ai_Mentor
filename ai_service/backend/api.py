import os
import datetime
import re
import traceback
import asyncio
import edge_tts
import cloudinary
import cloudinary.uploader
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
from google import genai
from groq import Groq
from cachetools import TTLCache
from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GROQ_API_KEY,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    validate_config,
)
import voices
validate_config()
from avatar_service import create_avatar_video
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
    voice_id: str | None = None
    gender: str | None = None
    language: str | None = None
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

async def generate_tts(text: str, output_file: str, voice_id: str = "en-US-GuyNeural", rate: str = "+0%", pitch: str = "+0Hz"):
    communicate = edge_tts.Communicate(
        text=text,
        voice=voice_id,
        rate=rate,
        pitch=pitch
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

@app.post("/generate")
def generate_lesson(data: LessonRequest, background_tasks: BackgroundTasks):

    topic_clean = re.sub(r'[^\w\s-]', '', data.topic).strip().replace(" ", "_")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base_filename = f"{topic_clean}_{timestamp}"

    job_status[base_filename] = {"status": "processing"}

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

        script = ""

        try:
            print("⚡ Trying Gemini Primary Model...")

            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt
            )

            script = response.text.strip().replace("\n", " ")

            print("✅ Gemini response generated")

        except Exception as gemini_error:

            print(f"❌ Gemini failed: {gemini_error}")

            try:
                print("⚡ Switching to Groq fallback...")

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

            # Validate voice or fallback
            selected_voice = voices.get_voice(data.voice_id)
            rate = data.speech_rate if data.speech_rate else "+0%"
            pitch = data.speech_pitch if data.speech_pitch else "+0Hz"

            asyncio.run(generate_tts(script, audio_path, voice_id=selected_voice, rate=rate, pitch=pitch))

            print(f"✅ Audio saved: {audio_path}")

        except Exception as e:

            print(f"❌ TTS Error: {e}")

            job_status[base_filename] = {
                "status": "failed"
            }
            return

        # 5️⃣ Try AI Avatar Video
        avatar_video_url = None

        try:
            print("🤖 Trying D-ID AI Avatar...")

            avatar_video_url = create_avatar_video(audio_path)

            print(f"✅ D-ID avatar video ready: {avatar_video_url}")

            video_response = requests.get(
                avatar_video_url,
                timeout=120,
            )
            video_response.raise_for_status()

            with open(final_video, "wb") as video_file:
                video_file.write(video_response.content)

            print(f"✅ Avatar video downloaded: {final_video}")

        except Exception as avatar_error:
            print(
                f"⚠️ D-ID avatar generation failed: {avatar_error}"
            )
            print("🔄 Falling back to local FFmpeg renderer...")

            # 6️⃣ Fallback: Merge Stock Video + Audio (FFmpeg)
            input_video = get_celebrity_video(data.celebrity)

            if not os.path.exists(input_video):
                print(
                    f"❌ Fallback video not found at {input_video}"
                )
                job_status[base_filename] = {
                    "status": "failed"
                }
                return

            ffmpeg_command = (
                f'ffmpeg -y -stream_loop -1 -i "{input_video}" '
                f'-i "{audio_path}" '
                f'-map 0:v:0 -map 1:a:0 '
                f'-c:v copy -c:a aac -shortest "{final_video}"'
            )

            print("🎥 Running fallback FFmpeg command...")

            os.system(ffmpeg_command)

            if not os.path.exists(final_video):
                print(
                    "❌ FFmpeg fallback failed — "
                    f"video not found at {final_video}"
                )
                job_status[base_filename] = {
                    "status": "failed"
                }
                return

            print("✅ FFmpeg fallback video created.")



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
            for local_file in [audio_path, final_video]:
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
