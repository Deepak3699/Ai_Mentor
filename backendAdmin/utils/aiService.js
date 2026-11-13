export function getAIServiceHeaders(serviceKey = process.env.AI_SERVICE_KEY) {
  if (typeof serviceKey !== "string" || !serviceKey.trim()) {
    throw new Error("Syllabus provider credential is not configured");
  }

  return { "x-service-key": serviceKey.trim() };
}
