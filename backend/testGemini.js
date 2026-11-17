import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Say hello",
});

console.log(response.text);



import assert from "node:assert/strict";
import { test } from "node:test";
import { askGemini, resetGeminiClientForTesting, setGeminiClientForTesting } from "../services/geminiChatService.js";

test("offline golden set test: enrolled-course rule check", async (t) => {
  const priorKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "fake-test-key";
  
  t.after(() => {
    resetGeminiClientForTesting();
    if (priorKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = priorKey;
  });

  let capturedRequest;
  setGeminiClientForTesting({
    models: {
      generateContent: async (args) => {
        capturedRequest = args;
        return { text: "Here is your answer about closures." };
      },
    },
  });

  const question = "Which enrolled course covers closures?";
  const result = await askGemini("Enrolled courses: JavaScript", question);
  
  assert.equal(result.ok, true);
  assert.equal(capturedRequest.contents, question);
  assert.match(capturedRequest.config.systemInstruction, /5\. If asked about courses, use enrolled courses\./);
});