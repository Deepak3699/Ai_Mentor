import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = "fake-test-key";

const { askGemini, classifyGeminiError, deps } = await import("../services/geminiChatService.js");

const MESSAGES = {
  rateLimited: "I am receiving too many requests right now. Please wait a moment and ask me again!",
  unavailable: "The AI service is temporarily unavailable. Please try again shortly.",
  timeout: "The AI service took too long to respond. Please try again shortly.",
  generic: "The AI Assistant is currently unavailable. Please try again later.",
};

const SECRET = "SECRET-PROMPT-TEXT-123";
const originalFetch = globalThis.fetch;
const originalTimeout = deps.timeoutMs;
const originalLogger = deps.logger;
let fetchCalls;
let logs;

const stubFetch = (handler) => {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return handler(url, init);
  };
};

const stubGemini = (status, body) =>
  stubFetch(
    () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );

const errorBody = (code, status, message = SECRET) => ({ error: { code, status, message } });

beforeEach(() => {
  fetchCalls = [];
  logs = [];
  deps.logger = { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  deps.timeoutMs = originalTimeout;
  deps.logger = originalLogger;
});

test("successful response returns ok with the text, via the real client request path", async () => {
  stubGemini(200, {
    candidates: [{ content: { role: "model", parts: [{ text: "Hello learner" }] } }],
  });

  const result = await askGemini("context", "hi");

  assert.deepEqual(result, { ok: true, text: "Hello learner" });
  assert.equal(fetchCalls.length, 1);
  assert.match(
    fetchCalls[0].url,
    /generativelanguage\.googleapis\.com.*gemini-2\.5-flash:generateContent/,
  );
  assert.equal(logs.length, 0);
});

const cases = [
  [429, "RESOURCE_EXHAUSTED", "rate_limited", MESSAGES.rateLimited],
  [500, "INTERNAL", "unavailable", MESSAGES.unavailable],
  [503, "UNAVAILABLE", "unavailable", MESSAGES.unavailable],
  [502, "BAD_GATEWAY", "gateway", MESSAGES.unavailable],
  [504, "DEADLINE_EXCEEDED", "timeout", MESSAGES.timeout],
  [401, "UNAUTHENTICATED", "auth", MESSAGES.generic],
  [403, "PERMISSION_DENIED", "auth", MESSAGES.generic],
  [501, "UNIMPLEMENTED", "provider_error", MESSAGES.generic],
  [400, "INVALID_ARGUMENT", "unknown", MESSAGES.generic],
];

for (const [status, id, category, message] of cases) {
  test(`HTTP ${status} (${id}) is classified as ${category}`, async () => {
    stubGemini(status, errorBody(status, id));

    const result = await askGemini("context", "hi", { requestId: "req-1" });

    assert.deepEqual(result, { ok: false, category, message });
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][0], { category, status, providerStatus: id, requestId: "req-1" });
  });
}

test("logs never include the raw provider message or request content", async () => {
  stubGemini(503, errorBody(503, "UNAVAILABLE"));

  await askGemini("context", SECRET);

  assert.ok(!JSON.stringify(logs).includes(SECRET));
});

test("the word quota in a non-429 error does not trigger rate limiting", async () => {
  stubGemini(500, errorBody(500, "INTERNAL", "quota"));

  const result = await askGemini("context", "hi");

  assert.equal(result.category, "unavailable");
});

test("a 429 is rate limited even without a provider identifier", async () => {
  stubGemini(429, { error: { code: 429, message: "slow down" } });

  const result = await askGemini("context", "hi");

  assert.equal(result.category, "rate_limited");
});

test("network failure is classified as network", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  const result = await askGemini("context", "hi");

  assert.deepEqual(result, { ok: false, category: "network", message: MESSAGES.generic });
  assert.equal(logs[0][0].category, "network");
});

test("a request that exceeds the timeout is aborted and classified as timeout", async () => {
  deps.timeoutMs = 20;
  let aborted = false;
  stubFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        // The SDK unrefs its timer, so keep the test process alive until it fires.
        const keepAlive = setInterval(() => {}, 1000);
        init.signal.addEventListener("abort", () => {
          clearInterval(keepAlive);
          aborted = true;
          reject(new DOMException("This operation was aborted", "AbortError"));
        });
      }),
  );

  const result = await askGemini("context", "hi");

  assert.equal(aborted, true);
  assert.deepEqual(result, { ok: false, category: "timeout", message: MESSAGES.timeout });
});

test("an empty response is classified as malformed_response", async () => {
  stubGemini(200, { candidates: [{ content: { role: "model", parts: [{ text: "  " }] } }] });

  const result = await askGemini("context", "hi");

  assert.equal(result.ok, false);
  assert.equal(result.category, "malformed_response");
});

test("classifyGeminiError handles errors with no usable fields", () => {
  assert.equal(classifyGeminiError(undefined).category, "network");
  assert.equal(classifyGeminiError({ status: 418 }).category, "unknown");
});
