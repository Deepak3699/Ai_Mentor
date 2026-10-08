import { test } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
delete process.env.GEMINI_API_KEY;
const { askGemini } = await import("../services/geminiChatService.js");
test("Gemini service imports without requiring an API key", () => {
  assert.equal(typeof askGemini, "function");
});
test("Gemini service returns an offline message when its key is absent", async () => {
  const result = await askGemini("context", "message");
  assert.equal(result, "The AI Assistant is currently offline due to missing API configuration. Please try again later.");
});
