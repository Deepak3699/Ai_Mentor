import { test } from "node:test";
import assert from "node:assert/strict";
import fetchWithTimeout, {
  DEFAULT_AI_SERVICE_TIMEOUT_MS,
  isTimeoutError,
  getAiServiceTimeoutMs,
} from "../utils/fetchWithTimeout.js";

const restoreEnv = (original) => {
  if (original === undefined) delete process.env.AI_SERVICE_TIMEOUT_MS;
  else process.env.AI_SERVICE_TIMEOUT_MS = original;
};

test("getAiServiceTimeoutMs falls back to the default and parses the env", () => {
  const original = process.env.AI_SERVICE_TIMEOUT_MS;
  try {
    delete process.env.AI_SERVICE_TIMEOUT_MS;
    assert.equal(getAiServiceTimeoutMs(), DEFAULT_AI_SERVICE_TIMEOUT_MS);

    process.env.AI_SERVICE_TIMEOUT_MS = "1500";
    assert.equal(getAiServiceTimeoutMs(), 1500);

    process.env.AI_SERVICE_TIMEOUT_MS = "not-a-number";
    assert.equal(getAiServiceTimeoutMs(), DEFAULT_AI_SERVICE_TIMEOUT_MS);

    process.env.AI_SERVICE_TIMEOUT_MS = "0";
    assert.equal(getAiServiceTimeoutMs(), DEFAULT_AI_SERVICE_TIMEOUT_MS);

    process.env.AI_SERVICE_TIMEOUT_MS = "-5";
    assert.equal(getAiServiceTimeoutMs(), DEFAULT_AI_SERVICE_TIMEOUT_MS);
  } finally {
    restoreEnv(original);
  }
});

test("isTimeoutError recognises timeout/abort errors only", () => {
  assert.equal(isTimeoutError({ name: "TimeoutError" }), true);
  assert.equal(isTimeoutError({ name: "AbortError" }), true);
  assert.equal(isTimeoutError(new Error("boom")), false);
  assert.equal(isTimeoutError(undefined), false);
});

test("fetchWithTimeout resolves normally and forwards options", async () => {
  const realFetch = globalThis.fetch;
  let received;
  globalThis.fetch = (url, options) => {
    received = { url, options };
    return Promise.resolve(new Response("ok", { status: 200 }));
  };

  try {
    const response = await fetchWithTimeout(
      "http://ai-service.test/fast",
      { method: "POST" },
      {
        timeoutMs: 1000,
      },
    );
    assert.equal(response.status, 200);
    assert.equal(received.url, "http://ai-service.test/fast");
    assert.equal(received.options.method, "POST");
    assert.ok(received.options.signal, "a timeout signal is attached");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchWithTimeout aborts a hanging request and rejects with a timeout error", async () => {
  const realFetch = globalThis.fetch;
  let seenSignal;
  globalThis.fetch = (_url, options) => {
    seenSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    });
  };

  try {
    await assert.rejects(
      fetchWithTimeout("http://ai-service.test/hang", {}, { timeoutMs: 20 }),
      (error) => isTimeoutError(error),
    );
    assert.equal(seenSignal.aborted, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchWithTimeout uses AI_SERVICE_TIMEOUT_MS when no override is given", async () => {
  const original = process.env.AI_SERVICE_TIMEOUT_MS;
  process.env.AI_SERVICE_TIMEOUT_MS = "15";

  const realFetch = globalThis.fetch;
  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    });

  try {
    const startedAt = Date.now();
    await assert.rejects(fetchWithTimeout("http://ai-service.test/hang"), (error) =>
      isTimeoutError(error),
    );
    assert.ok(Date.now() - startedAt < 5000, "aborted promptly, not after the 30s default");
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv(original);
  }
});
