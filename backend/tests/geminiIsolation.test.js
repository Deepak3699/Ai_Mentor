import { test } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
delete process.env.GEMINI_API_KEY;
const { askGemini, getGeminiReply } = await import("../services/geminiChatService.js");
test("Gemini service imports without requiring an API key", () => {
  assert.equal(typeof askGemini, "function");
});
test("Gemini service returns an offline message when its key is absent", async () => {
  const result = await askGemini("context", "message");
  assert.equal(
    result,
    "The AI Assistant is currently offline due to missing API configuration. Please try again later.",
  );
});

test("Gemini safety blocks return a safe educational message without reading response text", () => {
  const response = {
    candidates: [{ finishReason: "SAFETY" }],
    get text() {
      throw new Error("Text is unavailable for blocked responses");
    },
  };

  assert.match(getGeminiReply(response), /safe, educational way/i);
});

test("Gemini recitation blocks return a safe educational message", () => {
  assert.match(
    getGeminiReply({ candidates: [{ finishReason: "RECITATION" }] }),
    /safe, educational way/i,
  );
});

test("Gemini response extraction preserves normal text", () => {
  assert.equal(
    getGeminiReply({ candidates: [{ finishReason: "STOP" }], text: "Hello, learner!" }),
    "Hello, learner!",
  );
});

test("Gemini empty responses return a non-empty fallback", () => {
  assert.ok(getGeminiReply({ candidates: [] }).trim().length > 0);
});
