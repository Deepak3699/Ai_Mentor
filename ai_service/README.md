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

### Filtering voices

`GET /voices` returns every registered voice by default. Narrow the list with optional query parameters:

| Parameter  | Example             | Behavior                             |
| ---------- | ------------------- | ------------------------------------ |
| `language` | `?language=Spanish` | Only voices whose `language` matches |
| `gender`   | `?gender=Female`    | Only voices whose `gender` matches   |

- Matching is case-insensitive, so `?language=spanish` and `?language=Spanish` are equivalent.
- When both parameters are given, a voice must match both: `?language=English&gender=Male`.
- A value that matches no voice is not an error. The service responds with HTTP 200 and `{"voices": []}`.
- An empty parameter (`?language=`) is treated as if it were omitted.

```bash
curl "http://localhost:8000/voices?language=English&gender=Female"
```

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

Lesson, syllabus, quiz, and flashcard generation send fixed task instructions in
the provider's system-instruction field and caller-controlled values as a
separate, JSON-serialized user message. The system instructions tell the model
to treat JSON values as untrusted content rather than instructions. JSON
serialization preserves input as data but cannot guarantee resistance to every
prompt injection.

Lesson preferences are validated against the supported fields
`explanation_type`, `learning_style`, `teaching_pace`, `example_type`, and
`focus_area`; unknown keys are rejected.

- Never commit `.env` files, provider keys, database credentials, or generated authentication tokens.
- Do not print raw request objects, generated secrets, full credential values, or provider authorization headers.
- Keep celebrity source selection restricted to validated files inside the configured input directory.
