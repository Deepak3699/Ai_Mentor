import { test } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
delete process.env.GEMINI_API_KEY;
const { askGemini, getGeminiText } = await import("../services/geminiChatService.js");
test("Gemini service imports without requiring an API key", () => {
  assert.equal(typeof askGemini, "function");
});
test("Gemini service returns a config failure when its key is absent", async () => {
  const result = await askGemini("context", "message");
  assert.deepEqual(result, {
    ok: false,
    category: "config",
    message:
      "The AI Assistant is currently offline due to missing API configuration. Please try again later.",
  });
});

test("blocked Gemini responses return safe visible text without reading response.text", () => {
  const response = {
    candidates: [{ finishReason: "SAFETY" }],
    get text() {
      throw new Error("blocked text getter");
    },
  };
  const result = getGeminiText(response);
  assert.equal(result.moderated, true);
  assert.match(result.text, /safe, educational way/i);
});

test("empty Gemini responses return visible fallback text", () => {
  const result = getGeminiText({ candidates: [] });
  assert.equal(result.moderated, false);
  assert.ok(result.text.trim().length > 0);
});
