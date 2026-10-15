# AI Mentor AI Service Backend

The AI service is a FastAPI application used by AI Mentor to generate lesson scripts, narration audio, lesson videos, subtitles, transcripts, syllabi, quizzes, and flashcards.

For normal local development, use the repository-root npm commands. Direct Python startup is reserved for focused debugging.

## Technology stack

| Layer                         | Technology                           |
| ----------------------------- | ------------------------------------ |
| API framework                 | FastAPI and Uvicorn                  |
| Primary AI provider           | Google Gemini through `google-genai` |
| Optional fallback AI provider | Groq                                 |
| Text-to-speech                | Edge TTS through `edge-tts`          |
| Video processing              | FFmpeg                               |
| Optional cloud delivery       | Cloudinary                           |
| Optional avatar provider      | D-ID                                 |
| Testing                       | pytest and pytest-asyncio            |

## Project structure

```text
ai_service/
|-- backend/
|   |-- api.py
|   |-- config.py
|   |-- graceful_server.py
|   |-- avatar_service.py
|   |-- requirements.txt
|   |-- .env.example
|   `-- input/
|-- outputs/
|   |-- audio/
|   |-- text/
|   `-- video/
`-- tests/
```

Generated media is temporary when Cloudinary delivery succeeds. The service removes local audio, video, and subtitle files after a successful upload while retaining the generated transcript text used by the application.

## Prerequisites

The local environment requires:

- Python available through `python`
- FFmpeg available on `PATH`
- Redis or Memurai listening on port `6379` for queued video generation
- `ai_service/backend/.env` with a real `GEMINI_API_KEY`

Node.js and npm are required for the repository-root setup and development commands.

## Installation

From the repository root, prepare only the AI service:

```bash
npm run setup:ai
```

The command:

- creates or reuses `ai_service/.venv`;
- installs `ai_service/backend/requirements.txt`;
- validates Python, FFmpeg, AI configuration names, AI imports, and Redis or Memurai availability;
- never prints secret values or overwrites an existing `.env` file.

To set up the complete repository, including all Node and React applications, run:

```bash
npm run setup
```

## Configuration

Create `ai_service/backend/.env` from `ai_service/backend/.env.example`.

| Variable                | Requirement                                     | Behavior when unavailable                              |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `GEMINI_API_KEY`        | Required                                        | Setup and AI startup fail with a clear error           |
| `GEMINI_MODEL`          | Optional                                        | Uses the default model configured by the service       |
| `GROQ_API_KEY`          | Optional                                        | Groq fallback is disabled                              |
| `CLOUDINARY_CLOUD_NAME` | Optional as part of the complete Cloudinary set | Cloud delivery is disabled when the set is incomplete  |
| `CLOUDINARY_API_KEY`    | Optional as part of the complete Cloudinary set | Cloud delivery is disabled when the set is incomplete  |
| `CLOUDINARY_API_SECRET` | Optional as part of the complete Cloudinary set | Cloud delivery is disabled when the set is incomplete  |
| `DID_API_KEY`           | Optional                                        | D-ID avatar rendering is unavailable                   |
| `DID_API_URL`           | Optional                                        | Uses the service default when omitted                  |
| `DID_SOURCE_URL`        | Optional                                        | D-ID rendering falls back to the local FFmpeg renderer |

Setup output reports only variable names and `<configured>` markers. Do not commit `.env` files or share credential values.

### Celebrity source videos

Place source video files in `ai_service/backend/input/`. File names must match the supported source name in lowercase. The service uses `modi.mp4` as the default local fallback when a requested source video is unavailable.

Only validated local files within the configured input directory are eligible for fallback rendering.

## Running the service

Start only the AI service:

```bash
npm run dev:ai
```

Start the complete product, including User, Admin, and AI services:

```bash
npm run dev
```

The development runner:

- labels AI output with `[AI/API]`;
- reports `Startup` and `Health` timing;
- reuses a healthy AI process already listening on port `8000`;
- stops only processes started by the current terminal when `Ctrl+C` is pressed.

The local AI API is available at `http://127.0.0.1:8000`. Interactive FastAPI documentation is available at `http://127.0.0.1:8000/docs`. The Node.js backend must use `AI_SERVICE_URL=http://127.0.0.1:8000`.

For direct debugging only, the underlying entry point is `ai_service/backend/graceful_server.py`.

## Main API routes

| Method | Route                           | Purpose                                                          |
| ------ | ------------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/`                             | Basic service response used for readiness checks                 |
| `POST` | `/generate`                     | Queue lesson script, narration, video, and subtitle generation   |
| `GET`  | `/status/{job_id}`              | Return generation status and generated asset metadata            |
| `GET`  | `/transcript/{filename}`        | Return a generated transcript                                    |
| `POST` | `/generate-syllabus`            | Generate a structured course syllabus                            |
| `POST` | `/generate-flashcards`          | Generate study flashcards from a lesson transcript               |
| `GET`  | `/voices`                       | Return available narration voices                                |
| `GET`  | `/video-stream/{filename}`      | Serve a local generated video when cloud delivery is unavailable |
| `GET`  | `/transcript-stream/{filename}` | Serve a local transcript file                                    |

Use the running service's FastAPI documentation for the current request and response schemas.

## Generation workflow

1. Validate the lesson request.
2. Generate the lesson script with Gemini.
3. Use Groq only when it is configured and the primary provider fails.
4. Save the transcript text.
5. Generate narration with Edge TTS.
6. Attempt D-ID rendering when its configuration is available.
7. Use the local FFmpeg renderer when D-ID is unavailable or fails.
8. Generate subtitle files.
9. Upload video and subtitles to Cloudinary when the full Cloudinary configuration is available.
10. Return asset metadata and remove temporary local media after successful cloud delivery.

The Node.js backend uses Redis or Memurai to queue and track video-generation work.

## Testing

Run the focused AI-service tests from the repository root with the isolated environment:

```bash
ai_service\.venv\Scripts\python.exe -m pytest -q ai_service/tests
```

For API exploration, start the service and open the FastAPI documentation at `http://127.0.0.1:8000/docs`.

## Troubleshooting

| Problem                                | Resolution                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| AI environment file is missing         | Copy `ai_service/backend/.env.example` to `ai_service/backend/.env`, add `GEMINI_API_KEY`, then run `npm run setup:ai` |
| `GEMINI_API_KEY` is not configured     | Add a real Gemini key without sharing it, then rerun setup                                                             |
| FFmpeg is unavailable                  | Install FFmpeg, ensure it is on `PATH`, restart the terminal, and run `npm run setup:ai`                               |
| Redis or Memurai warning               | Start a Redis-compatible service on port `6379`; queued video generation requires it                                   |
| D-ID configuration is missing          | The service uses the local FFmpeg fallback renderer                                                                    |
| Cloudinary configuration is incomplete | Cloud delivery is disabled and the supported local delivery path is used                                               |
| Video remains in processing state      | Review `[AI/API]` output and the User API queue logs for the first failed generation step                              |

## Security notes

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env`:

```env
# Google Gemini API key
GEMINI_API_KEY=your_gemini_api_key_here

# Cloudinary credentials (for cloud video hosting)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

> **Get a Gemini API key:** [Google AI Studio](https://aistudio.google.com/app/apikey) â€” free tier available.
>
> **Get Cloudinary credentials:** [Cloudinary Console](https://cloudinary.com/console) â€” free tier available.

### Input Videos (Celebrity Sources)

Place source video files in `ai_service/backend/input/`:

- File names must match the celebrity name (lowercase): e.g., `modi.mp4`, `elon.mp4`
- **`modi.mp4` is required** â€” it is used as the default fallback if a requested celebrity video is not found.

The video is looped silently and merged with the TTS audio.

---

## ðŸƒ Running the Service

```bash
# Activate your virtual environment first (see above)

# From the ai_service/ directory:
cd backend
python graceful_server.py
```

The service will be available at **http://localhost:8000**.

> âš ï¸ The Node.js backend must be configured with `AI_SERVICE_URL=http://127.0.0.1:8000` to communicate with this service.

---

## ðŸ“¡ API Reference

### `GET /`

Health check.

**Response:**

```json
{ "message": "AI Lesson Generator Backend Running" }
```

---

### `GET /health/live`
Liveness probe confirming the AI service process is running. Always returns HTTP 200.

**Response:**
```json
{
  "status": "alive"
}
```

---

### `GET /health/ready`
Readiness probe verifying runtime dependencies:
- **FFmpeg availability** (required)
- **Gemini API key configured** (`GEMINI_API_KEY`) (required)
- **Default input video** (`backend/input/modi.mp4`) (required)
- **Outputs storage writable** (`outputs/` folder) (required)
- **Optional integrations** (`groq`, `cloudinary`, `did` reported as `enabled` or `disabled` without failing readiness)

**Success Response (200 OK):**
```json
{
  "status": "ready",
  "checks": {
    "ffmpeg": "available",
    "gemini_api_key": "configured",
    "default_input_video": "available",
    "outputs_writable": "writable"
  },
  "optional": {
    "groq": "enabled",
    "cloudinary": "disabled",
    "did": "disabled"
  }
}
```

**Failure Response (503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "reason": "Gemini API key is missing",
  "reasons": [
    "Gemini API key is missing"
  ],
  "checks": {
    "ffmpeg": "available",
    "gemini_api_key": "missing",
    "default_input_video": "available",
    "outputs_writable": "writable"
  },
  "optional": {
    "groq": "disabled",
    "cloudinary": "disabled",
    "did": "disabled"
  }
}
```

---

### `POST /generate`

Generates an AI lesson video **asynchronously** (runs in background).

**Request Body:**

```json
{
  "course": "ReactJS",
  "topic": "Introduction to Components",
  "celebrity": "modi"
}
```

**Response (immediately):**

```json
{
  "status": "Processing",
  "filename": "Introduction_to_Components_20240101_120000.mp4",
  "text_file": "Introduction_to_Components_20240101_120000.txt",
  "audio_file": "Introduction_to_Components_20240101_120000.mp3",
  "jobId": "Introduction_to_Components_20240101_120000"
}
```

Use the `jobId` to poll `/status/:jobId` for completion.

---

### `GET /status/{job_id}`

Polls the status of a generation job.

**Response (while processing):**

```json
{ "status": "processing" }
```

**Response (on completion):**

```json
{
  "status": "ready",
  "cloudinary_url": "https://res.cloudinary.com/..."
}
```

**Response (on failure):**

```json
{ "status": "failed" }
```

---

### `GET /transcript/{filename}`

Returns the text content of a generated lesson script.

**Response:**

```json
{ "content": "Welcome students! Today we will learn about..." }
```

---

### `POST /generate-syllabus`

Generates a structured course syllabus using AI. This endpoint is **synchronous** and may take several seconds to complete. It tries Gemini first and falls back to Groq if Gemini fails.

**Request Body:**

```json
{
  "course_title": "ReactJS",
  "category": "Programming"
}
```

**Success Response:**

```json
{
  "modules": [
    {
      "title": "Module 1: Introduction",
      "lessons": [
        {
          "title": "Lesson 1: Basics",
          "duration": "5 mins",
          "type": "video"
        }
      ]
    }
  ]
}
```

**Failure Response:**

```json
{
  "error": "Failed to generate syllabus"
}
```

---

| Mount Path                      | Directory Served | Description                        |
| ------------------------------- | ---------------- | ---------------------------------- |
| `/video-stream/{filename}`      | `outputs/video/` | Serves generated `.mp4` videos     |
| `/transcript-stream/{filename}` | `outputs/text/`  | Serves raw transcript `.txt` files |

## ðŸ”„ Generation Pipeline

```
POST /generate
     â”‚
     â”œâ”€ 1. Gemini API â†’ generates 50-word lesson script
     â”‚
     â”œâ”€ 2. pyttsx3 â†’ converts script to .mp3 audio
     â”‚
     â”œâ”€ 3. FFmpeg â†’ loops celebrity .mp4 + merges .mp3 audio â†’ final .mp4
     â”‚
     â””â”€ 4. Cloudinary â†’ uploads final .mp4 â†’ stores secure_url in job_status
```

Jobs run in FastAPI **BackgroundTasks**, so `/generate` returns immediately while processing happens in the background.

---

## ðŸ§ª Testing with Swagger

FastAPI auto-generates interactive API documentation:

1. Start the server (see above).
2. Open **[http://localhost:8000/docs](http://localhost:8000/docs)** in your browser.
3. Click **POST /generate â†’ Try it out**, enter a request body, and click **Execute**.

---

## ðŸ›  Troubleshooting

| Problem                          | Solution                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `FFmpeg not found`               | Install FFmpeg and ensure its `bin/` folder is in your system PATH. Restart your terminal after adding it.               |
| `GEMINI_API_KEY not found`       | Ensure `backend/.env` exists with a valid `GEMINI_API_KEY`.                                                              |
| `Cloudinary credentials missing` | All three Cloudinary vars (`CLOUD_NAME`, `API_KEY`, `API_SECRET`) must be set in `backend/.env`.                         |
| PowerShell activation error      | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` then try `.\venv\Scripts\Activate.ps1` again. |
| Video status stays `processing`  | Check the terminal for FFmpeg or TTS errors. Ensure the input celebrity video exists in `backend/input/`.                |

## Configuration Modes

- **Required:** `GEMINI_API_KEY`  -  the primary AI provider.
- **Optional:** `GROQ_API_KEY`  -  enables Groq fallback when configured. If omitted, Gemini remains the only AI provider.
- **Optional:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`  -  enables Cloudinary video hosting when all three are configured.
- If Cloudinary is unavailable, generated videos remain available through the local-storage path.
- The service can run in reduced mode without Groq and/or Cloudinary credentials. Startup configuration reports which optional integrations are enabled.

### Development and Production Behavior

For development, only `GEMINI_API_KEY` is required to start the AI service. Groq and Cloudinary can be omitted when their features are not needed.

For production, configure Groq and Cloudinary when their fallback and cloud-hosting features are required. Missing optional credentials do not prevent the service from starting; the corresponding integration is disabled.

### Celebrity Video Security

Only the following celebrity names are approved for video selection:

- `modi`
- `owl`
- `salman`
- `srk`

Place the corresponding video files in `ai_service/backend/input/` using lowercase filenames, such as `modi.mp4` and `srk.mp4`.

For security, unapproved names and path traversal attempts—including absolute paths and URL-encoded traversal strings—fall back to `modi.mp4`. Video selection resolves the file path and verifies that the selected file is inside the approved input directory. Logs display the selected celebrity name rather than the absolute video path.

**Fallback requirement:** Keep `modi.mp4` in the input directory so it is available when a requested celebrity is invalid or its video is missing.
- Never commit `.env` files, provider keys, database credentials, or generated authentication tokens.
- Do not print raw request objects, generated secrets, full credential values, or provider authorization headers.
- Keep celebrity source selection restricted to validated files inside the configured input directory.
