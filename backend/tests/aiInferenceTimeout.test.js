import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";

const { default: express } = await import("express");
const { default: User } = await import("../models/User.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");

const realFetch = globalThis.fetch;
const originalFindByPk = User.findByPk;
let server;
let baseUrl;

before(async () => {
  User.findByPk = async () => ({ id: 1 });
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findByPk = originalFindByPk;
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

const postExplainCode = () =>
  realFetch(`${baseUrl}/api/ai/explain-code`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: "print('hi')", language: "python", mode: "explain" }),
  });

test("backend grants the AI service enough time for primary and fallback inference", async () => {
  let timeoutMs;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (duration) => {
    timeoutMs = duration;
    return originalTimeout(duration);
  };
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ summary: "ok" }), { status: 200 });
  };

  try {
    const response = await postExplainCode();
    assert.equal(response.status, 200);
    const configuredTimeout = Number(process.env.AI_INFERENCE_TIMEOUT_MS);
    const expectedTimeout =
      Number.isSafeInteger(configuredTimeout) &&
      configuredTimeout >= 1000 &&
      configuredTimeout <= 600000
        ? configuredTimeout
        : 130000;
    assert.equal(timeoutMs, expectedTimeout);
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
});

test("backend maps an AI service timeout to a clear 504 response", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "provider diagnostic" }), { status: 504 });

  const response = await postExplainCode();
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "GATEWAY_TIMEOUT",
      message: "AI inference timed out. Please retry the request.",
      details: [],
    },
  });
});

test("backend maps its own upstream timeout to a clear 504 response", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("deadline exceeded", "TimeoutError");
  };

  const response = await postExplainCode();
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "GATEWAY_TIMEOUT",
      message: "AI inference timed out. Please retry the request.",
      details: [],
    },
  });
});
