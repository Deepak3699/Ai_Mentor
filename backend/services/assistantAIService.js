import buildLogger from "../utils/logger.js";

const logger = buildLogger("ASSISTANT_AI");

const TIMEOUT_MS = 20000;

export const askAssistantAI = async ({ context, message, history = [], requestId }) => {
  const url = process.env.AI_SERVICE_URL;
  const key = process.env.AI_SERVICE_KEY;

  if (!url || !key) {
    return {
      ok: false,
      category: "config",
      message: null,
    };
  }

  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/assistant/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-key": key,
      },
      body: JSON.stringify({ message, history, context }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const category =
        response.status === 429
          ? "rate_limited"
          : [408, 504].includes(response.status)
            ? "timeout"
            : response.status >= 500
              ? "unavailable"
              : "generic";

      logger.warn({ requestId, category, status: response.status }, "Assistant AI request failed");

      return {
        ok: false,
        category,
        message: null,
      };
    }

    let data;

    try {
      data = await response.json();
    } catch {
      return {
        ok: false,
        category: "malformed_response",
        message: null,
      };
    }

    if (data?.error) {
      return {
        ok: false,
        category: data.error,
        message: null,
      };
    }

    if (!data || typeof data.reply !== "string" || !data.reply.trim()) {
      return {
        ok: false,
        category: "malformed_response",
        message: null,
      };
    }

    return {
      ok: true,
      text: data.reply,
      route: data.route,
    };
  } catch (error) {
    const category =
      error.name === "TimeoutError" || error.name === "AbortError" ? "timeout" : "network";

    logger.warn({ requestId, category }, "Assistant AI request failed");

    return {
      ok: false,
      category,
      message: null,
    };
  }
};
