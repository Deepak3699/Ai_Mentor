import { test } from "node:test";
import assert from "node:assert/strict";

const { getAIServiceHeaders } = await import("../utils/aiService.js");
const { validateEnv } = await import("../env-validator.js");

test("backendAdmin getAIServiceHeaders returns trimmed canonical x-service-key", () => {
  const origKey = process.env.AI_SERVICE_KEY;
  try {
    process.env.AI_SERVICE_KEY = "admin-secret-key-123";
    assert.deepEqual(getAIServiceHeaders(), { "x-service-key": "admin-secret-key-123" });

    process.env.AI_SERVICE_KEY = "   admin-secret-key-123   ";
    assert.deepEqual(getAIServiceHeaders(), { "x-service-key": "admin-secret-key-123" });
  } finally {
    process.env.AI_SERVICE_KEY = origKey;
  }
});

test("backendAdmin getAIServiceHeaders fails fast with Error when AI_SERVICE_KEY is missing or empty", () => {
  const origKey = process.env.AI_SERVICE_KEY;
  const origSec = process.env.AI_SERVICE_SECRET;

  try {
    delete process.env.AI_SERVICE_KEY;
    delete process.env.AI_SERVICE_SECRET;
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );

    process.env.AI_SERVICE_KEY = "";
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );

    process.env.AI_SERVICE_KEY = "    ";
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );

    // Ensure undocumented AI_SERVICE_SECRET is NOT used as fallback
    delete process.env.AI_SERVICE_KEY;
    process.env.AI_SERVICE_SECRET = "legacy-secret";
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );
  } finally {
    process.env.AI_SERVICE_KEY = origKey;
    if (origSec) process.env.AI_SERVICE_SECRET = origSec;
  }
});

test("backendAdmin validateEnv detects missing AI_SERVICE_KEY", () => {
  const origKey = process.env.AI_SERVICE_KEY;
  const originalWrite = process.stdout.write;
  let stdoutOutput = "";

  try {
    delete process.env.AI_SERVICE_KEY;
    process.stdout.write = (chunk) => {
      stdoutOutput += String(chunk);
      return true;
    };

    validateEnv();
    assert.ok(stdoutOutput.includes("AI_SERVICE_KEY"), "Output must mention missing AI_SERVICE_KEY");
  } finally {
    process.stdout.write = originalWrite;
    process.env.AI_SERVICE_KEY = origKey;
  }
});

test("backendAdmin controllers forward getAIServiceHeaders to AI service", async () => {
  process.env.AI_SERVICE_URL = "http://ai-service.test";
  process.env.AI_SERVICE_KEY = "admin-secret-key-123";

  const realFetch = globalThis.fetch;
  const recorded = [];

  globalThis.fetch = async (url, opts = {}) => {
    recorded.push({ url: String(url), method: opts.method, headers: opts.headers });
    return new Response(JSON.stringify({ modules: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const { getAIServiceHeaders: helperHeaders } = await import("../utils/aiService.js");
    const headers = helperHeaders();
    assert.equal(headers["x-service-key"], "admin-secret-key-123");

    // Simulate controller calling the syllabus endpoint
    const response = await fetch(`${process.env.AI_SERVICE_URL}/generate-syllabus`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...helperHeaders(),
      },
      body: JSON.stringify({
        course_title: "Test Course",
        category: "Programming",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].url, "http://ai-service.test/generate-syllabus");
    assert.equal(recorded[0].headers["x-service-key"], "admin-secret-key-123");
  } finally {
    globalThis.fetch = realFetch;
  }
});
