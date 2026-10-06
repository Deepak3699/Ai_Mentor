/**
 * Returns authorization headers for calling the AI service.
 * Uses AI_SERVICE_KEY (or AI_SERVICE_SECRET as fallback) from environment variables.
 *
 * @returns {Record<string, string>}
 */
export function getAIServiceHeaders() {
  const key = process.env.AI_SERVICE_KEY || process.env.AI_SERVICE_SECRET;
  if (!key) {
    return {};
  }
  return {
    "x-service-key": key,
  };
}
