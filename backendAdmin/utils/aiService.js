/**
 * Returns authorization headers for calling the AI service.
 * Uses AI_SERVICE_KEY from environment variables.
 * Fails fast by throwing an Error if the service credential is missing.
 *
 * @returns {Record<string, string>}
 */
export function getAIServiceHeaders() {
  const key = process.env.AI_SERVICE_KEY;
  if (!key || !key.trim()) {
    throw new Error("AI_SERVICE_KEY is not configured in environment variables");
  }
  return {
    "x-service-key": key.trim(),
  };
}
