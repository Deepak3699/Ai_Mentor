export const AI_GENERATION_POLL_INTERVAL_MS = 1000;
export const AI_GENERATION_TIMEOUT_MS = 120000;

export class AIGenerationError extends Error {
  constructor(type, message, { retryable = false, details } = {}) {
    super(message);
    this.name = "AIGenerationError";
    this.type = type;
    this.retryable = retryable;
    this.details = details;
  }
}

const isNetworkError = (error) =>
  error instanceof TypeError ||
  /network|fetch failed|offline|timeout|aborted/i.test(error?.message || "");

const getApiError = async (response, endpoint) => {
  try {
    const body = await response.json();
    return body?.message || `The ${endpoint} request failed.`;
  } catch {
    return `The ${endpoint} request failed.`;
  }
};

export const classifyGenerationError = (error) => {
  if (error instanceof AIGenerationError) return error;

  if (isNetworkError(error)) {
    return new AIGenerationError("connectivity", "We couldn't connect to the AI service. Please check your connection and try again.", {
      retryable: true,
      details: error,
    });
  }

  return new AIGenerationError("generation", "The AI video could not be generated. Please try again.", {
    retryable: true,
    details: error,
  });
};

export const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const pollAIVideoStatus = async ({
  jobId,
  fetchStatus,
  timeoutMs = AI_GENERATION_TIMEOUT_MS,
  pollIntervalMs = AI_GENERATION_POLL_INTERVAL_MS,
  waitForNextPoll = wait,
}) => {
  if (!jobId) {
    throw new AIGenerationError("invalid_response", "The AI service returned no job ID.", { retryable: true });
  }

  const timeoutAt = Date.now() + timeoutMs;
  let attempts = 0;

  while (attempts < Math.max(1, Math.ceil(timeoutMs / pollIntervalMs))) {
    const statusResponse = await fetchStatus(jobId);
    if (!statusResponse.ok) {
      const message = await getApiError(statusResponse, "status");
      throw new AIGenerationError("connectivity", "The AI generation status could not be checked. Please check your connection and try again.", {
        retryable: true,
        details: { message, status: statusResponse.status },
      });
    }

    const statusData = await statusResponse.json();
    if (statusData?.status === "ready") {
      const videoUrl = statusData.cloudinary_url || statusData.local_video_url || statusData.videoUrl;
      if (!videoUrl) {
        throw new AIGenerationError("invalid_response", "The AI service returned no video URL.", { retryable: true });
      }
      return {
        videoUrl,
        transcriptName: statusData.transcript_name || statusData.transcriptName || null,
      };
    }

    if (statusData?.status === "failed") {
      throw new AIGenerationError("generation", "The AI video generation failed. Please try again.", { retryable: true });
    }

    if (statusData?.status && !["queued", "processing"].includes(statusData.status)) {
      throw new AIGenerationError("invalid_response", "The AI service returned an invalid generation status.", { retryable: true });
    }

    attempts += 1;
    if (Date.now() >= timeoutAt) break;
    await waitForNextPoll(pollIntervalMs);
  }

  throw new AIGenerationError("timeout", "Video generation took too long. Please try again.", { retryable: true });
};

export const fetchTranscript = async (transcriptName, fetchTranscriptFile) => {
  if (!transcriptName) return null;
  const response = await fetchTranscriptFile(transcriptName);
  if (!response.ok) {
    throw new AIGenerationError("transcript", "The generated transcript is not available.", { retryable: false });
  }

  const data = await response.json();
  if (!data?.content) {
    throw new AIGenerationError("transcript", "The generated transcript is empty.", { retryable: false });
  }

  return data.content;
};
