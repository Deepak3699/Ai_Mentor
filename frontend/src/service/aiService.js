import { apiFetch as fetch } from "../lib/api";
import { getErrorMessage } from "../lib/errorHandling.js";
import {
  AIGenerationError,
  AI_REQUEST_TIMEOUT_MS,
  classifyGenerationError,
  isAbortError,
  httpGenerationError,
  isVideoUrl,
  readGenerationJson,
  withDeadline,
} from "./aiGeneration";
export const getAIVideo = async (payload, { signal, timeoutMs = AI_REQUEST_TIMEOUT_MS } = {}) => {
  try {
    return await withDeadline(
      async (requestSignal) => {
        const token = localStorage.getItem("token");
        const response = await fetch("/api/ai/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
          signal: requestSignal,
        });
        if (!response.ok) throw httpGenerationError(response);
        const data = await readGenerationJson(response);
        if (data?.cached === true) {
          if (!isVideoUrl(data.videoUrl))
            throw new AIGenerationError(
              "invalid_response",
              "The AI service returned no video URL.",
              { retryable: true },
            );
        } else if (typeof data?.jobId !== "string" || !data.jobId.trim()) {
          throw new AIGenerationError("invalid_response", "The AI service returned no job ID.", {
            retryable: true,
          });
        }
        return data;
      },
      { signal, timeoutMs, type: "request_timeout" },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    const failure = classifyGenerationError(error);
    if (
      ["connectivity", "service", "invalid_response", "request_timeout", "timeout"].includes(
        failure.type,
      )
    )
      failure.details = { ...failure.details, submissionUncertain: true };
    throw failure;
  }
};
export const explainCode = async (payload) => {
  const token = localStorage.getItem("token");

  const response = await fetch("/api/ai/explain-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw {
      response: { status: response.status, data: null },
      message: "Server returned empty or invalid JSON",
    };
  }

  if (!response.ok) {
    throw {
      response: { status: response.status, data },
      message: getErrorMessage(
        { response: { status: response.status, data } },
        "Code explanation request failed",
      ),
    };
  }

  return data;
};
