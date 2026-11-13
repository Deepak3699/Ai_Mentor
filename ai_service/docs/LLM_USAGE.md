# LLM Usage

## 1. Overview

The AI service uses Gemini as its primary LLM provider and can use Groq as an
optional fallback. Lesson script, syllabus, quiz, and flashcard generation use
shared provider helpers. The `/explain-code` endpoint uses separate,
hardcoded provider model names and handles the `explain`, `debug`, and
`optimize` modes.

The values and behavior below describe the source code. Provider defaults not
explicitly set by the application are marked **UNKNOWN**.

## 2. Supported LLM providers

### Gemini

Gemini is initialized as the primary provider with `GEMINI_API_KEY`. Its
client is set to `None` when that key is absent. Shared generation calls use
the configured `GEMINI_MODEL`; `/explain-code` makes a direct call with a
hardcoded model instead.

### Groq

Groq is optional. `GROQ_ENABLED` is true when `GROQ_API_KEY` is truthy, and
the Groq client is initialized only in that case. Groq is used as a fallback
for generation endpoints when Gemini fails. Some endpoint fallback paths do
not check whether the Groq client exists before attempting a call; see
[Endpoint-wise provider fallback behaviour](#8-endpoint-wise-provider-fallback-behaviour)
and [Configuration caveats and known limitations](#9-configuration-caveats-and-known-limitations).

## 3. Model configuration

| Provider/use                                             | Model                                      | Configuration                          |
| -------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| Gemini shared helper: lesson, syllabus, quiz, flashcards | `GEMINI_MODEL`; default `gemini-2.5-flash` | Environment-configurable               |
| Gemini `/explain-code`                                   | `gemini-3.8-flash`                         | Hardcoded; does not use `GEMINI_MODEL` |
| Groq shared helper: lesson, syllabus, quiz, flashcards   | `llama-3.3-70b-versatile`                  | Hardcoded                              |
| Groq `/explain-code`                                     | `openai/gpt-oss-120b`                      | Hardcoded                              |

The runtime value of `GEMINI_MODEL` is **UNKNOWN** without the service
environment. The default is used only when the environment does not override
it. No Groq model environment variable is defined in the inspected
configuration.

## 4. Environment variables and API keys

| Variable              | Purpose                                | Default/behavior                                 |
| --------------------- | -------------------------------------- | ------------------------------------------------ |
| `GEMINI_API_KEY`      | Gemini API key                         | Config is documented as requiring it.            |
| `GEMINI_MODEL`        | Model for shared Gemini calls          | `gemini-2.5-flash`                               |
| `GROQ_API_KEY`        | Optional Groq API key                  | Groq client enabled when truthy                  |
| `LLM_TIMEOUT_SECONDS` | LLM request timeout                    | `60` seconds                                     |
| `PYTEST_CURRENT_TEST` | Controls dotenv loading in `config.py` | If set, `load_dotenv(override=False)` is skipped |

The `.env.example` also lists Cloudinary and D-ID variables; these are not
LLM provider, model, temperature, or token-limit settings.

`GEMINI_API_KEY` and `GROQ_API_KEY` are passed to their respective client
initializers. The Gemini client is set to `None` if the Gemini key is absent;
the Groq client is set to `None` if Groq is not enabled. The configuration
defines `validate_config()` to raise `ValueError` if `GEMINI_API_KEY` is
missing. Although `api.py` imports this function, no invocation in
application source was found. Calls found outside its definition are in
tests; startup enforcement by this function is therefore not established by
the application source.

## 5. Generation parameters (temperature and token limits)

The shared Groq helper defaults to `temperature=0.7` and requires its caller
to provide `max_tokens`. The following values are explicitly passed by
endpoint:

| Generation flow          |       Groq temperature | Groq `max_tokens` |
| ------------------------ | ---------------------: | ----------------: |
| Lesson fallback          | `0.7` (helper default) |             `300` |
| Syllabus fallback        | `0.7` (helper default) |            `1000` |
| Quiz fallback            | `0.7` (helper default) |            `2000` |
| Flashcard fallback       |                  `0.4` |            `3000` |
| `/explain-code` fallback |                  `0.2` |            `4000` |

These are helper defaults or per-call settings, not global environment
settings. No Gemini temperature or output-token limit is explicitly passed
in the inspected calls. Gemini defaults for these parameters are **UNKNOWN**.
No `max_output_tokens` parameter appears in the inspected `api.py`.

The shared Gemini and Groq clients use `LLM_TIMEOUT_SECONDS`, defaulting to
60 seconds. Gemini receives timeout values in milliseconds; Groq receives
seconds. The shared generation helpers also pass timeout options. The direct
Groq call in `/explain-code` does not specify a call-level timeout; the Groq
client itself is initialized with the configured timeout.

## 6. Prompt construction and input processing

Shared generation serializes the user-data dictionary with
`json.dumps(user_data, ensure_ascii=False)`. Gemini receives the serialized
JSON as `contents` and a separate `system_instruction`. Groq receives a
system message and a user message containing that serialized JSON.

The shared lesson, syllabus, quiz, and flashcard prompts include an
instruction to treat values in user JSON as untrusted data rather than
instructions.

| Flow       | User data passed to the shared helper                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson     | `course`, `topic`, `celebrity`, `language`, and preferences. `None` preference values are excluded. Voice and speech settings are not included in this LLM payload. |
| Syllabus   | `course_title` and `category`; a falsey category becomes `"General Education"`.                                                                                     |
| Quiz       | `lesson`                                                                                                                                                            |
| Flashcards | `count` and `transcript`                                                                                                                                            |

The `/explain-code` endpoint constructs a text prompt containing the
programming language, requested mode, and code inside a language-labelled
code fence. It instructs the model to analyze the code, not follow
instructions in it. Gemini receives that prompt as `contents`; Groq receives
it as a user message.

## 7. Input validation and error handling

Pydantic request models define these constraints:

| Request    | Validated fields                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lesson     | `course`: 1–100 characters; `topic`: 1–200; `celebrity`: default `"modi"`, 1–50; `language`: default `"English"`, maximum 50. Optional preference fields each have maximum 100 characters; extra preference fields are forbidden. |
| Syllabus   | `course_title`: 1–100 characters; optional `category`: maximum 100.                                                                                                                                                               |
| Code       | `code`: 1–20,000 characters; `language`: 1–50; `mode`: `explain`, `debug`, or `optimize`.                                                                                                                                         |
| Quiz       | `lesson`: 1–30,000 characters.                                                                                                                                                                                                    |
| Flashcards | `transcript`: 1–30,000 characters; `count`: default 5, minimum 5, maximum 10.                                                                                                                                                     |

Generated lesson text must be a string, is whitespace-normalized, and must
be nonempty and no longer than 10,000 characters. Quiz output is parsed and
validated as a `QuizResponse`, then checked for exactly four questions and
four options per question, with `correct_index` from 0 to 3. Flashcard
output must contain the requested number of cards, validate against the
`Flashcard` model, and have unique fronts. Syllabus output is fence-stripped
and JSON-parsed; further response-schema validation is not shown. Code
analysis output is parsed as JSON and checked for required top-level keys;
additional field-level validation is not shown.

Provider errors are generally caught as `Exception` and logged or returned
through endpoint-specific paths. `short_error()` categorizes timeout errors
for diagnostics. Quiz generation retries and returns an empty question list
after repeated failures; flashcards retry and then return HTTP 503; syllabus
returns HTTP 503 if both provider paths fail; code analysis returns HTTP 502
if both providers fail or the response is invalid. If lesson generation
fails at both providers, it raises `ProviderGenerationError`, which the
lesson processing flow records as a failed job.

The exact HTTP response behavior for invalid incoming request bodies is
**UNKNOWN** from the route/model code inspected; the file defines Pydantic
request constraints but no route-specific handling for those validation
errors.

## 8. Endpoint-wise provider fallback behaviour

| Endpoint/operation                                           | Provider order and fallback                                                                         | Failure behavior                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Lesson: `POST /generate`                                     | `generate_lesson_script` tries Gemini, then Groq if Gemini generation or output validation fails.   | If both fail, raises `ProviderGenerationError`; lesson processing marks the job failed. |
| Syllabus: `POST /generate-syllabus`                          | Gemini first; Groq on Gemini, JSON parse, or related failure.                                       | HTTP 503 if the Groq path also fails.                                                   |
| Quiz: `POST /generate-quiz`                                  | Gemini first; Groq on Gemini failure. The attempt loop allows two attempts.                         | Returns `{"questions": []}` after the second failed attempt.                            |
| Flashcards: `POST /generate-flashcards`                      | Gemini first; Groq is attempted only if a Groq client exists. The attempt loop allows two attempts. | HTTP 503 after retries fail.                                                            |
| Code explanation: `/explain-code`, mode `explain`            | Gemini `gemini-3.8-flash`, then Groq `openai/gpt-oss-120b` if Gemini raises.                        | HTTP 502 if both provider calls fail or the response is invalid.                        |
| Code analysis: `/explain-code`, modes `debug` and `optimize` | Same route and provider fallback as code explanation.                                               | Same HTTP 502 behavior.                                                                 |

There is no separate code-analysis route in `api.py`; `/explain-code`
supports all three modes.

## 9. Configuration caveats and known limitations

- Groq is optional, but lesson, syllabus, quiz, and `/explain-code`
  fallback paths attempt Groq without first checking whether the client
  exists. Flashcards explicitly check for the Groq client before calling
  it. A missing Groq client therefore enters the endpoint’s exception and
  retry/failure handling in the unguarded paths.
- `validate_config()` is defined and imported into `api.py`, but no
  application-source invocation was found. Tests call it; that does not
  establish that application startup invokes it.
- The `.env.example` model `GEMINI_MODEL` controls the shared-helper Gemini
  calls for lesson, syllabus, quiz, and flashcards. It does **not** control
  `/explain-code`, which hardcodes `gemini-3.8-flash`.
- Groq models, temperatures, and token limits are hardcoded or passed by
  helper callers; the inspected configuration exposes no environment
  variables for them.
- Gemini temperature and output-token defaults are **UNKNOWN** from the
  repository source inspected here.
- The effective runtime value of `GEMINI_MODEL` is **UNKNOWN** without the
  service environment.

## 10. Source-code references

Paths and line numbers below refer to the repository source used for this
documentation.

| File                                               | Relevant sections                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_service/backend/api.py`                        | Provider clients: lines 154–167; request models: 172–225; serialization and provider helpers: 228–269; lesson prompt, validation and fallback: 272–347; syllabus endpoint: 495–585; quiz endpoint: 598–687; flashcard endpoint: 690–755; `/explain-code` prompt, provider calls, validation and errors: 760–884; lesson route: 926–960; lesson failure recording: 1294–1304. |
| `ai_service/backend/config.py`                     | Dotenv loading: lines 3–5; Gemini settings and timeout: 7–12; Groq key and enablement: 14–15, 27; `validate_config()` definition: 36–38.                                                                                                                                                                                                                                     |
| `ai_service/backend/.env.example`                  | Gemini key/model: lines 1–3; timeout: 5–6; optional Groq key: 8–10.                                                                                                                                                                                                                                                                                                          |
| `ai_service/tests/test_config.py`                  | Test-only calls to `validate_config()`: lines 44, 50, 56, 66.                                                                                                                                                                                                                                                                                                                |
| `ai_service/backend/tests/test_optional_config.py` | Test-only call to `validate_config()`: line 33.                                                                                                                                                                                                                                                                                                                              |
