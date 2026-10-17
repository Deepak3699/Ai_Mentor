import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = "fake-test-key";

const { askGemini } = await import("../services/geminiChatService.js");

const RATE_LIMIT_MESSAGE =
  "I am receiving too many requests right now. Please wait a moment and ask me again!";
const UNAVAILABLE_MESSAGE =
  "The AI service is temporarily unavailable. Please try again shortly.";
const GENERIC_MESSAGE =
  "The AI Assistant is currently unavailable. Please try again later.";

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
let logged;

const stubGemini = (status, body) => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
};

const errorBody = (code, status, message) => ({
  error: { code, status, message },
});

beforeEach(() => {
  logged = [];
  console.error = (...args) => logged.push(args.join(" "));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

test("successful Gemini response is returned unchanged", async () => {
  stubGemini(200, {
    candidates: [{ content: { role: "model", parts: [{ text: "Hello learner" }] } }],
  });

  const reply = await askGemini("context", "hi");

  assert.equal(reply, "Hello learner");
  assert.equal(logged.length, 0);
});

test("HTTP 429 returns the rate-limit message and logs the status", async () => {
  stubGemini(429, errorBody(429, "RESOURCE_EXHAUSTED", "Too many requests"));

  const reply = await askGemini("context", "hi");

  assert.equal(reply, RATE_LIMIT_MESSAGE);
  assert.ok(logged.some((line) => line.includes("GEMINI ERROR [status: 429]")));
});

test("quota error returns the rate-limit message", async () => {
  stubGemini(429, errorBody(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota"));

  const reply = await askGemini("context", "hi");

  assert.equal(reply, RATE_LIMIT_MESSAGE);
});

test("HTTP 503 returns the service-unavailable message and logs the status", async () => {
  stubGemini(503, errorBody(503, "UNAVAILABLE", "The model is overloaded"));

  const reply = await askGemini("context", "hi");

  assert.equal(reply, UNAVAILABLE_MESSAGE);
  assert.ok(logged.some((line) => line.includes("GEMINI ERROR [status: 503]")));
});

test("HTTP 500 returns the service-unavailable message", async () => {
  stubGemini(500, errorBody(500, "INTERNAL", "Internal error"));

  const reply = await askGemini("context", "hi");

  assert.equal(reply, UNAVAILABLE_MESSAGE);
  assert.ok(logged.some((line) => line.includes("GEMINI ERROR [status: 500]")));
});

test("unrecognized errors (HTTP 401) keep the generic message", async () => {
  stubGemini(401, errorBody(401, "UNAUTHENTICATED", "API key not valid"));

  const reply = await askGemini("context", "hi");

  assert.equal(reply, GENERIC_MESSAGE);
  assert.ok(logged.some((line) => line.includes("GEMINI ERROR [status: 401]")));
});

test("network failure without a status keeps the generic message", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  const reply = await askGemini("context", "hi");

  assert.equal(reply, GENERIC_MESSAGE);
  assert.ok(logged.some((line) => line.includes("GEMINI ERROR")));
});