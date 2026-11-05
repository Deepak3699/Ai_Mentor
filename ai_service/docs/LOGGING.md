# AI Service Logging

This document describes the logging configuration, approved log metadata, message redaction behavior, and logging call sites in the AI service.

## 1. Logging configuration

### Log level

The AI service reads its log level from the `AI_SERVICE_LOG_LEVEL` environment variable.

```python
log_level = os.getenv("AI_SERVICE_LOG_LEVEL", "INFO").upper()
```

- Default: `INFO`
- The configured value is converted to uppercase.
- Supported standard Python logging levels: `DEBUG`, `INFO`, `WARNING`, `ERROR`, and `CRITICAL`.
- If the value does not match an attribute on Python's `logging` module, the configuration falls back to `INFO`.

For example, to enable debug logging:

```powershell
$env:AI_SERVICE_LOG_LEVEL = "DEBUG"
npm run dev:ai
```

The environment variable must be set in the environment inherited by the AI service process.

### Configuration location

The `configure_logging()` function is defined in:

`ai_service/backend/api.py`

It calls:

```python
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
```

The configured output format is:

```text
%(asctime)s %(levelname)s %(name)s %(message)s
```

The components are:

| Component   | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| `asctime`   | Timestamp                                                 |
| `levelname` | Python logging severity                                   |
| `name`      | Logger name                                               |
| `message`   | Log message, including approved metadata where applicable |

The API logger is created using:

```python
logger = logging.getLogger(__name__)
```

### When configuration is applied

The custom configuration is called from:

`ai_service/backend/graceful_server.py`

It is executed inside the `if __name__ == "__main__":` block, before the Uvicorn server is started.

The repository's normal development commands also use this entry point:

| Command          | Startup path                                                                           |
| ---------------- | -------------------------------------------------------------------------------------- |
| `npm run dev:ai` | `scripts/dev-runner.cjs` launches `graceful_server.py`                                 |
| `npm run dev`    | `scripts/dev-runner.cjs` launches `graceful_server.py` as part of the complete product |
| Direct debugging | `ai_service/backend/graceful_server.py`                                                |

The development runner sets its working directory to `ai_service/backend` and launches the Python executable with `graceful_server.py` as its argument.

**Important startup distinction:** Importing `api.py` does not itself call `configure_logging()`. A different startup path that imports `api:app` without executing `graceful_server.py` does not automatically apply this custom configuration. Uvicorn may configure its own logging, and `logging.basicConfig()` also does not replace existing root handlers when handlers are already configured.

## 2. Structured logging through `log_event()`

The main application logging helper is:

```python
log_event(level, message, **details)
```

It is defined in `ai_service/backend/api.py`.

Its purpose is to emit approved operational messages and metadata while preventing arbitrary application data from entering logs.

The helper applies three checks:

1. Validate the message.
2. Validate each metadata field and its value.
3. Emit the resulting message using the requested logger method, with a fallback to `INFO` for unknown levels.

### Message allow-list

The helper maintains a `safe_messages` set containing 24 approved messages.

An ASCII string is emitted unchanged only when it exactly matches an approved message.

- An approved message is preserved as-is.
- An unapproved ASCII message is replaced with `Generation event`.
- A non-string or non-ASCII message is replaced with `Log event omitted: invalid message`.

Message matching is exact and case-sensitive.

The 24 approved messages are:

| Approved message                                 |
| ------------------------------------------------ |
| `Log event omitted: invalid message`             |
| `Generation event`                               |
| `Preferences loaded`                             |
| `Script prepared`                                |
| `Lesson generation started`                      |
| `Lesson request accepted`                        |
| `Lesson script generated`                        |
| `Gemini lesson generation failed`                |
| `Gemini quiz generation failed`                  |
| `Gemini syllabus generation failed; trying Groq` |
| `Gemini returned invalid syllabus JSON`          |
| `Groq returned invalid syllabus JSON`            |
| `Groq syllabus generation failed`                |
| `Renderer source selected`                       |
| `Default renderer source selected`               |
| `Switching to Groq fallback`                     |
| `Trying Gemini`                                  |
| `Trying Groq fallback`                           |
| `Generating quiz`                                |
| `Quiz generated and validated`                   |
| `Quiz generation attempt failed`                 |
| `Gemini code analysis failed`                    |
| `Groq code analysis failed`                      |
| `Invalid AI response`                            |

### Log levels used by the application

The first argument to `log_event()` is resolved dynamically against the logger.

| Supplied level                                                            | Effective Python logging method |
| ------------------------------------------------------------------------- | ------------------------------- |
| `DEBUG`                                                                   | `debug()`                       |
| `INFO`                                                                    | `info()`                        |
| `WARNING`                                                                 | `warning()`                     |
| `WARN`                                                                    | `warning()`                     |
| `ERROR`                                                                   | `error()`                       |
| `CRITICAL`                                                                | `critical()`                    |
| `RUN`, `OK`, `QUEUE`, `START`, `READY`, `CLEAN`, and other unknown values | `info()` fallback               |

The application uses some operational labels rather than standard Python severity names. These labels are not separate logging levels; they fall back to `INFO`.

## 3. Approved metadata fields

`SAFE_LOG_FIELDS` contains 12 approved field names.

Any field not in this set is omitted. Values equal to `None` are also omitted.

| Field        | Validation and allowed values                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `job`        | String containing 1–80 characters. Only letters (`A-Z`, `a-z`), digits (`0-9`), underscores (`_`), and hyphens (`-`) are accepted. |
| `provider`   | `gemini` or `groq`. String values are normalized to lowercase.                                                                     |
| `model`      | The currently configured `GEMINI_MODEL` or `llama-3.3-70b-versatile`.                                                              |
| `stage`      | `started`, `completed`, or `failed`.                                                                                               |
| `status`     | `queued`, `processing`, `completed`, or `failed`.                                                                                  |
| `configured` | Boolean `True`/`False`, or the strings `true`/`false`, normalized to lowercase.                                                    |
| `words`      | Non-negative integer. Boolean values are rejected.                                                                                 |
| `duration`   | Integer or floating-point number from `0` to `86400`, inclusive. Boolean values are rejected.                                      |
| `audio`      | Boolean `True`/`False`, or the strings `true`/`false`, normalized to lowercase.                                                    |
| `delivery`   | `success` or `failed`. String values are normalized to lowercase.                                                                  |
| `attempt`    | Non-negative integer. Boolean values are rejected.                                                                                 |
| `code`       | Integer. Boolean values are rejected.                                                                                              |

### Additional validation behavior

- Unknown field names are discarded.
- Fields with `None` values are discarded.
- Invalid values are discarded individually; they do not invalidate the entire event.
- Boolean values are explicitly rejected for integer and numeric fields where the implementation checks for booleans.
- The `model` field accepts only the configured Gemini model or the specified Groq model identifier.
- The `job` field is restricted to a safe character pattern and length.

### Output format for metadata

Accepted fields are appended to the message in the following format:

```text
Approved message | field=value | field=value
```

The metadata is emitted only after the corresponding field and value pass validation.

## 4. `log_event()` call-site inventory

The following inventory covers every `log_event()` call found in `ai_service/backend/api.py` at the time this document was prepared.

- Source line numbers refer to the inspected version of `api.py`.
- The source message is the string supplied by the call site.
- The emitted message shows the result after allow-list validation.
- `Generation event` means the original ASCII message was not on the approved allow-list.
- Metadata lists the keyword arguments supplied by the call site, not necessarily the fields that survive validation.

### Lesson script generation

| Line | Level | Function / stage                          | Source message                           | Emitted message                   | Metadata |
| ---: | ----- | ----------------------------------------- | ---------------------------------------- | --------------------------------- | -------- |
|  441 | RUN   | `generate_lesson_script` – Gemini attempt | `Trying Gemini for lesson script`        | `Generation event`                | —        |
|  444 | OK    | `generate_lesson_script` – Gemini success | `Gemini lesson script generated`         | `Generation event`                | —        |
|  448 | WARN  | `generate_lesson_script` – Gemini failure | `Gemini lesson generation failed`        | `Gemini lesson generation failed` | `error`  |
|  454 | RUN   | `generate_lesson_script` – Groq fallback  | `Trying Groq fallback for lesson script` | `Generation event`                | —        |
|  477 | OK    | `generate_lesson_script` – Groq success   | `Groq fallback lesson script generated`  | `Generation event`                | —        |

### Syllabus generation

| Line | Level | Function / stage                          | Source message                                   | Emitted message                                  | Metadata |
| ---: | ----- | ----------------------------------------- | ------------------------------------------------ | ------------------------------------------------ | -------- |
|  664 | RUN   | `generate_syllabus` – Gemini attempt      | `Generating syllabus with Gemini`                | `Generation event`                               | —        |
|  680 | ERROR | `generate_syllabus` – Invalid Gemini JSON | `Gemini returned invalid syllabus JSON`          | `Gemini returned invalid syllabus JSON`          | `error`  |
|  684 | WARN  | `generate_syllabus` – Groq fallback       | `Gemini syllabus generation failed; trying Groq` | `Gemini syllabus generation failed; trying Groq` | `error`  |
|  707 | ERROR | `generate_syllabus` – Invalid Groq JSON   | `Groq returned invalid syllabus JSON`            | `Groq returned invalid syllabus JSON`            | `error`  |
|  711 | ERROR | `generate_syllabus` – Groq failure        | `Groq syllabus generation failed`                | `Groq syllabus generation failed`                | `error`  |

### Quiz generation

| Line | Level | Function / stage                  | Source message                                  | Emitted message                  | Metadata           |
| ---: | ----- | --------------------------------- | ----------------------------------------------- | -------------------------------- | ------------------ |
|  760 | RUN   | `generate_quiz` – Attempt         | `Generating quiz`                               | `Generating quiz`                | `attempt`          |
|  763 | RUN   | `generate_quiz` – Gemini attempt  | `Trying Gemini`                                 | `Trying Gemini`                  | —                  |
|  771 | WARN  | `generate_quiz` – Gemini failure  | `Gemini quiz generation failed`                 | `Gemini quiz generation failed`  | `provider`         |
|  772 | RUN   | `generate_quiz` – Groq fallback   | `Trying Groq fallback`                          | `Trying Groq fallback`           | —                  |
|  809 | OK    | `generate_quiz` – Success         | `Quiz generated and validated`                  | `Quiz generated and validated`   | —                  |
|  815 | WARN  | `generate_quiz` – Timeout         | `Quiz provider timed out; returning empty quiz` | `Generation event`               | `attempt`          |
|  822 | WARN  | `generate_quiz` – Attempt failure | `Quiz generation attempt failed`                | `Quiz generation attempt failed` | `attempt`, `error` |

### Code explanation

| Line | Level | Function / stage                  | Source message                | Emitted message               | Metadata   |
| ---: | ----- | --------------------------------- | ----------------------------- | ----------------------------- | ---------- |
|  966 | RUN   | `explain_code` – Gemini attempt   | `Trying Gemini`               | `Trying Gemini`               | —          |
|  974 | WARN  | `explain_code` – Gemini failure   | `Gemini code analysis failed` | `Gemini code analysis failed` | `provider` |
|  975 | RUN   | `explain_code` – Groq fallback    | `Trying Groq fallback`        | `Trying Groq fallback`        | —          |
|  986 | WARN  | `explain_code` – Groq failure     | `Groq code analysis failed`   | `Groq code analysis failed`   | `provider` |
| 1018 | WARN  | `explain_code` – Invalid response | `Invalid AI response`         | `Invalid AI response`         | —          |

### Lesson generation pipeline

| Line | Level | Function / stage                            | Source message                                        | Emitted message             | Metadata                                                               |
| ---: | ----- | ------------------------------------------- | ----------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| 1173 | QUEUE | `process_lesson` – Request accepted         | `Lesson request accepted`                             | `Lesson request accepted`   | `correlation_id`                                                       |
| 1199 | START | `process_lesson` – Generation started       | `Lesson generation started`                           | `Lesson generation started` | `correlation_id`                                                       |
| 1201 | INFO  | `process_lesson` – Preferences              | `User preferences`                                    | `Generation event`          | `configured`                                                           |
| 1203 | INFO  | `process_lesson` – Script preparation       | `Script prepared`                                     | `Script prepared`           | `words`                                                                |
| 1225 | OK    | `process_lesson` – Transcript               | `Transcript saved`                                    | `Generation event`          | —                                                                      |
| 1229 | RUN   | `process_lesson` – Narration                | `Generating narration audio`                          | `Generation event`          | —                                                                      |
| 1247 | WARN  | `process_lesson` – Audio duration           | `Could not read audio duration`                       | `Generation event`          | `error`                                                                |
| 1249 | OK    | `process_lesson` – Narration ready          | `Narration audio ready`                               | `Generation event`          | `duration`                                                             |
| 1252 | ERROR | `process_lesson` – Narration failure        | `Narration generation failed`                         | `Generation event`          | `error`                                                                |
| 1261 | RUN   | `process_lesson` – Avatar renderer          | `Trying D-ID avatar renderer`                         | `Generation event`          | —                                                                      |
| 1265 | OK    | `process_lesson` – Avatar render            | `D-ID avatar render completed`                        | `Generation event`          | —                                                                      |
| 1277 | OK    | `process_lesson` – Avatar download          | `Avatar video downloaded`                             | `Generation event`          | —                                                                      |
| 1288 | WARN  | `process_lesson` – Avatar cleanup           | `Avatar source cleanup failed`                        | `Generation event`          | `error`                                                                |
| 1293 | OK    | `process_lesson` – Video normalization      | `Avatar video normalized to landscape`                | `Generation event`          | —                                                                      |
| 1297 | WARN  | `process_lesson` – Renderer fallback        | `D-ID unavailable; using FFmpeg fallback`             | `Generation event`          | `error`                                                                |
| 1298 | RUN   | `process_lesson` – FFmpeg fallback          | `Starting FFmpeg fallback renderer`                   | `Generation event`          | —                                                                      |
| 1304 | ERROR | `process_lesson` – Missing source           | `Fallback source video not found`                     | `Generation event`          | —                                                                      |
| 1308 | RUN   | `process_lesson` – FFmpeg rendering         | `Rendering lesson video with FFmpeg`                  | `Generation event`          | —                                                                      |
| 1315 | ERROR | `process_lesson` – FFmpeg failure           | `FFmpeg render failed`                                | `Generation event`          | `code`, `error`                                                        |
| 1320 | ERROR | `process_lesson` – Missing output           | `FFmpeg completed without an output video`            | `Generation event`          | —                                                                      |
| 1324 | OK    | `process_lesson` – FFmpeg success           | `FFmpeg video render completed`                       | `Generation event`          | —                                                                      |
| 1332 | OK    | `process_lesson` – Subtitle creation        | `Subtitle files created`                              | `Generation event`          | —                                                                      |
| 1334 | WARN  | `process_lesson` – Subtitle failure         | `Subtitle generation failed; video remains available` | `Generation event`          | `error`                                                                |
| 1341 | RUN   | `process_lesson` – Video upload             | `Uploading lesson video`                              | `Generation event`          | —                                                                      |
| 1354 | OK    | `process_lesson` – Video upload success     | `Lesson video uploaded`                               | `Generation event`          | —                                                                      |
| 1358 | WARN  | `process_lesson` – Upload fallback          | `Video upload failed; using local proxy`              | `Generation event`          | `error`                                                                |
| 1387 | OK    | `process_lesson` – Subtitle upload          | `Subtitle files uploaded`                             | `Generation event`          | —                                                                      |
| 1389 | WARN  | `process_lesson` – Subtitle upload fallback | `Subtitle upload failed; using local files`           | `Generation event`          | `error`                                                                |
| 1398 | WARN  | `process_lesson` – Metadata probe           | `Video metadata probe failed`                         | `Generation event`          | `error`                                                                |
| 1420 | READY | `process_lesson` – Completion               | `Lesson generation completed`                         | `Generation event`          | `correlation_id`, `provider`, `duration`, `audio`, `words`, `delivery` |
| 1424 | CLEAN | `process_lesson` – Cleanup                  | `Removing temporary media files`                      | `Generation event`          | —                                                                      |
| 1434 | CLEAN | `process_lesson` – File removal             | `Temporary file removed`                              | `Generation event`          | —                                                                      |
| 1436 | WARN  | `process_lesson` – Cleanup failure          | `Temporary file cleanup failed`                       | `Generation event`          | `error`                                                                |
| 1438 | WARN  | `process_lesson` – Local media retention    | `Local media retained because upload failed`          | `Generation event`          | —                                                                      |
| 1439 | INFO  | `process_lesson` – Local fallback cleanup   | `Local fallback files require later cleanup`          | `Generation event`          | —                                                                      |
| 1447 | ERROR | `process_lesson` – Generation failure       | `Lesson generation failed`                            | `Generation event`          | `correlation_id`, `failure`                                            |

## 5. Logging paths that bypass `log_event()`

Not all logging in the AI service goes through the approved message and field validation helper.

The following direct logging calls were found in the backend.

### Direct logging in `api.py`

| Location         | Method             | Message / behavior                                                 |
| ---------------- | ------------------ | ------------------------------------------------------------------ |
| `api.py:230`     | `logger.info()`    | `FFmpeg is available.`                                             |
| `api.py:232–235` | `logger.error()`   | Logs an FFmpeg missing/not-in-PATH diagnostic.                     |
| `api.py:240–243` | `logger.error()`   | Logs FFmpeg availability-check failure with the process exit code. |
| `api.py:862–865` | `logger.warning()` | Logs Gemini flashcard generation failure and `short_error(...)`.   |
| `api.py:894–898` | `logger.warning()` | Logs flashcard attempt number and `short_error(...)`.              |

These messages do not pass through the `safe_messages` or `SAFE_LOG_FIELDS` validation in `log_event()`.

The flashcard warnings use `short_error()` rather than directly logging the original exception message.

### Direct output in `avatar_service.py`

Location: `ai_service/backend/avatar_service.py:176`

```python
print(f"[INFO] D-ID status | state={status}", flush=True)
```

This prints the D-ID status directly to standard output. It bypasses the application logging helper and its message/field validation.

### Direct logging in `job_shutdown.py`

Location: `ai_service/backend/job_shutdown.py:44`

```python
logger.warning("Job marked failed because shutdown timed out.")
```

This emits a direct warning through the module logger and does not use `log_event()`.

These direct paths are documented exceptions to the structured logging helper.

## 6. Safe process for adding a new log message

When adding a new operational message through `log_event()`, follow this process:

1. **Choose a static message.** Do not include user input, topics, preferences, provider responses, exception text, file paths, or other sensitive/dynamic content in the message.
2. **Add the exact message to `safe_messages`.** The helper uses exact, case-sensitive message matching.
3. **Use approved metadata fields only.** Check `SAFE_LOG_FIELDS` before passing any keyword arguments.
4. **Check the value validator.** Ensure every value matches the rules in `SAFE_LOG_VALUES` or the corresponding field-specific validation.
5. **Do not add arbitrary fields to bypass validation.** If a new operational field is genuinely needed, review its safety and validation requirements before adding it to the allow-list.
6. **Add or update a regression test** in `ai_service/tests/test_logging_redaction.py`. Verify that the approved message and safe metadata are retained and that unapproved or unsafe data is not emitted.
7. **Run the logging-redaction tests:**

   ```bash
   python -m pytest -q ai_service/tests/test_logging_redaction.py
   ```

A message that is not added to the allow-list will be replaced by `Generation event` if it is an ASCII string. A non-ASCII or non-string message will be replaced by `Log event omitted: invalid message`.

## 7. Observations from the current implementation

The following are observations of the inspected code, not proposed changes.

1. **Many source messages are replaced.** The inventory contains 58 `log_event()` calls and 38 distinct literal source messages. The 24-message allow-list contains messages that are not necessarily used by every call site. Only exact allow-list matches are preserved.
2. **Generic messages reduce diagnostic detail.** For example, `Lesson video uploaded`, `Subtitle upload failed; using local files`, and `D-ID avatar render completed` are emitted as `Generation event`.
3. **Some metadata arguments are not approved fields.** `correlation_id`, `failure`, and `error` are not in `SAFE_LOG_FIELDS`, so these arguments are discarded by `log_event()`.
4. **Some values do not match their validators.** The lesson pipeline supplies formatted duration strings, an audio duration string, and delivery values such as `cloud` or `local`. These do not satisfy the current numeric, boolean, and `success`/`failed` validators respectively.
5. **The `short_error()` category is not automatically retained.** Calls that pass it using the keyword `error` still lose that field because `error` is not approved.
6. **Direct logging remains outside the redaction helper.** The direct logger calls in `api.py`, the D-ID `print()` in `avatar_service.py`, and the shutdown warning in `job_shutdown.py` do not receive `log_event()` message and field validation.
7. **Operational level labels are not standard Python severity names.** Labels such as `RUN`, `OK`, `QUEUE`, `START`, `READY`, and `CLEAN` use the helper's `INFO` fallback.
8. **The logging configuration depends on the startup path.** Importing the API module alone does not invoke `configure_logging()`. The normal npm development runner launches the graceful server entry point, which does invoke it.
9. **The existing redaction tests do not cover every call site individually.** They cover representative safe-field, unsafe-field, provider-error, message, and model cases.

## 8. Verification

The existing logging-redaction test file is:

`ai_service/tests/test_logging_redaction.py`

It contains six tests covering:

- Unapproved sensitive fields.
- Safe provider metadata.
- Provider exception-message leakage.
- Non-ASCII messages.
- Unsafe approved-field values.
- Unapproved model values.

Test command:

```bash
python -m pytest -q ai_service/tests/test_logging_redaction.py
```

Verification performed for this documentation task:

```text
......                                                                   [100%]
6 passed in 4.27s
```

The tests were run using the AI service virtual environment's Python interpreter:

```powershell
.\ai_service\.venv\Scripts\python.exe -m pytest -q ai_service/tests/test_logging_redaction.py
```

No application code or tests were modified as part of this documentation work.
