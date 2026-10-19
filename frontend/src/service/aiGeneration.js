export const AI_GENERATION_POLL_INTERVAL_MS = 1000;
export const AI_GENERATION_TIMEOUT_MS = 120000;
export const AI_REQUEST_TIMEOUT_MS = 30000;
export class AIGenerationError extends Error {
  constructor(type, message, { retryable = false, details } = {}) {
    super(message);
    this.name = "AIGenerationError";
    this.type = type;
    this.retryable = retryable;
    this.details = details;
  }
}
export const isAbortError = (error) => error?.name === "AbortError" || error?.code === "ABORT_ERR";
export const createAbortError = () => {
  if (typeof DOMException === "function")
    return new DOMException("The operation was aborted.", "AbortError");
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};
export const classifyGenerationError = (error) => {
  if (error instanceof AIGenerationError) return error;
  if (isAbortError(error)) return error;
  if (error instanceof TypeError || /network|fetch failed|offline/i.test(error?.message || "")) {
    return new AIGenerationError(
      "connectivity",
      "We couldn't connect to the AI service. Check your connection and try again.",
      { retryable: true, details: error },
    );
  }
  return new AIGenerationError(
    "generation",
    "The AI video could not be generated. Please try again.",
    { retryable: true },
  );
};
export const wait = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
// The deadline covers both fetch and body consumption, even if a transport ignores abort.
export const withDeadline = async (
  operation,
  { signal, timeoutMs = AI_REQUEST_TIMEOUT_MS, type = "timeout" } = {},
) => {
  if (signal?.aborted) throw createAbortError();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new AIGenerationError("timeout", "Video generation took too long. Please try again.", {
      retryable: true,
    });
  const controller = new AbortController();
  const requestSignal =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
  let timer, onAbort;
  const stopped = new Promise((resolve, reject) => {
    onAbort = () => {
      reject(createAbortError());
      controller.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      reject(
        new AIGenerationError(
          type,
          type === "request_timeout"
            ? "The request timed out before its result could be confirmed."
            : "Video generation took too long. Please try again.",
          {
            retryable: true,
            details: type === "request_timeout" ? { submissionUncertain: true } : undefined,
          },
        ),
      );
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([stopped, Promise.resolve(operation(requestSignal))]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
};
export const isVideoUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  return /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[^\s]+$/.test(value);
};
export const httpGenerationError = (response) => {
  const status = response.status;
  let retryAfterMs = 0;
  const header = response.headers?.get?.("Retry-After");
  if (header) {
    const seconds = Number(header);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(delay)) retryAfterMs = Math.max(0, delay);
  }
  const details = { status, retryAfterMs, retryAt: Date.now() + retryAfterMs };
  if (status === 401)
    return new AIGenerationError(
      "authentication",
      "Your session has expired. Sign in again to continue.",
      { details },
    );
  if (status === 403)
    return new AIGenerationError(
      "permission",
      "You do not have permission to generate this lesson.",
      { details },
    );
  if (status === 429)
    return new AIGenerationError(
      "rate_limit",
      "The AI service is receiving too many requests. Please try again shortly.",
      { retryable: true, details },
    );
  if (status === 408 || status === 504)
    return new AIGenerationError(
      "timeout",
      "The AI service took too long to respond. Please try again.",
      { retryable: true, details },
    );
  if (status >= 500)
    return new AIGenerationError(
      "service",
      "The AI service is temporarily unavailable. Please try again.",
      { retryable: true, details },
    );
  if (status === 404)
    return new AIGenerationError(
      "not_found",
      "This generation job or lesson is no longer available.",
      { details },
    );
  return new AIGenerationError("invalid_request", "The AI service could not accept this request.", {
    details,
  });
};
export const readGenerationJson = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new AIGenerationError("invalid_response", "Server returned empty or invalid JSON", {
      retryable: true,
    });
  }
};
export const pollAIVideoStatus = async ({
  jobId,
  fetchStatus,
  timeoutMs = AI_GENERATION_TIMEOUT_MS,
  pollIntervalMs = AI_GENERATION_POLL_INTERVAL_MS,
  waitForNextPoll = wait,
  signal,
}) => {
  if (typeof jobId !== "string" || !jobId.trim())
    throw new AIGenerationError("invalid_response", "The AI service returned no job ID.", {
      retryable: true,
    });
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0)
    throw new AIGenerationError("invalid_request", "The polling interval is invalid.");
  try {
    return await withDeadline(
      async (requestSignal) => {
        const timeoutAt = Date.now() + timeoutMs;
        let failures = 0;
        const limit = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));
        for (let attempt = 0; attempt < limit; attempt++) {
          if (requestSignal.aborted) throw createAbortError();
          let response;
          try {
            response = await fetchStatus(jobId, { signal: requestSignal });
            if (requestSignal.aborted) throw createAbortError();
            if (!response.ok) throw httpGenerationError(response);
          } catch (error) {
            if (isAbortError(error)) throw error;
            const failure = classifyGenerationError(error);
            if (
              !failure.retryable ||
              !["connectivity", "service", "timeout", "rate_limit"].includes(failure.type) ||
              failures >= 2
            )
              throw failure;
            failures += 1;
            const delay = Math.max(pollIntervalMs, failure.details?.retryAfterMs || 0);
            if (Date.now() + delay >= timeoutAt) throw failure;
            await waitForNextPoll(delay, requestSignal);
            continue;
          }
          const data = await readGenerationJson(response);
          if (requestSignal.aborted) throw createAbortError();
          failures = 0;
          if (
            !data ||
            typeof data !== "object" ||
            !["queued", "processing", "ready", "failed"].includes(data.status)
          )
            throw new AIGenerationError(
              "invalid_response",
              "The AI service returned an invalid generation status.",
              { retryable: true },
            );
          if (data.status === "ready") {
            const videoUrl = data.cloudinary_url || data.local_video_url || data.videoUrl;
            if (!isVideoUrl(videoUrl))
              throw new AIGenerationError(
                "invalid_response",
                "The AI service returned no video URL.",
                { retryable: true },
              );
            const name = data.transcript_name || data.transcriptName;
            return {
              videoUrl,
              transcriptName: typeof name === "string" && name.trim() ? name : null,
            };
          }
          if (data.status === "failed")
            throw new AIGenerationError(
              "generation",
              "The AI video generation failed. Please try again.",
              { retryable: true, details: { jobFailed: true } },
            );
          if (Date.now() >= timeoutAt) break;
          await waitForNextPoll(pollIntervalMs, requestSignal);
        }
        throw new AIGenerationError(
          "timeout",
          "Video generation took too long. Please try again.",
          { retryable: true },
        );
      },
      { signal, timeoutMs },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    const failure = classifyGenerationError(error);
    // A terminal failed job needs a new explicit submission; other failures resume status checks.
    if (!failure.details?.jobFailed) failure.details = { ...failure.details, jobId };
    throw failure;
  }
};
export const fetchTranscript = async (
  transcriptName,
  fetchTranscriptFile,
  { signal, timeoutMs = AI_REQUEST_TIMEOUT_MS } = {},
) => {
  if (!transcriptName) return null;
  return withDeadline(
    async (requestSignal) => {
      const response = await fetchTranscriptFile(transcriptName, { signal: requestSignal });
      if (!response.ok)
        throw new AIGenerationError("transcript", "The generated transcript is not available.");
      const data = await readGenerationJson(response);
      if (typeof data?.content !== "string" || !data.content.trim())
        throw new AIGenerationError("transcript", "The generated transcript is empty.");
      return data.content;
    },
    { signal, timeoutMs, type: "transcript" },
  );
};
