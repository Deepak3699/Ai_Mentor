import test from "node:test";
import assert from "node:assert/strict";
import {
  pollAIVideoStatus,
  withDeadline,
  fetchTranscript,
  httpGenerationError,
  isAbortError,
} from "../src/service/aiGeneration.js";
const response = (status, body, retryAfter) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => retryAfter },
  json: async () => body,
});
test("deadline rejects an unresponsive transport and aborts its child signal", async () => {
  let child;
  await assert.rejects(
    withDeadline(
      (signal) => {
        child = signal;
        return new Promise(() => {});
      },
      { timeoutMs: 15 },
    ),
    (error) => error.type === "timeout",
  );
  assert.equal(child.aborted, true);
});
test("polling deadline covers a response body that never resolves", async () => {
  await assert.rejects(
    pollAIVideoStatus({
      jobId: "j",
      timeoutMs: 15,
      fetchStatus: async () => ({ ok: true, json: () => new Promise(() => {}) }),
    }),
    (error) => error.type === "timeout" && error.details.jobId === "j",
  );
});
test("deadline propagates parent cancellation without a generation error", async () => {
  const parent = new AbortController();
  let child;
  const promise = withDeadline(
    (signal) => {
      child = signal;
      return new Promise(() => {});
    },
    { signal: parent.signal },
  );
  parent.abort();
  await assert.rejects(promise, isAbortError);
  assert.equal(child.aborted, true);
});
for (const [status, type, retryable] of [
  [401, "authentication", false],
  [403, "permission", false],
  [429, "rate_limit", true],
  [500, "service", true],
  [404, "not_found", false],
  [400, "invalid_request", false],
]) {
  test(`HTTP ${status} has a distinct safe category`, () => {
    const error = httpGenerationError(response(status, { message: "private diagnostic" }, "2"));
    assert.equal(error.type, type);
    assert.equal(error.retryable, retryable);
    assert.equal(error.message.includes("private diagnostic"), false);
    if (status === 429) assert.equal(error.details.retryAfterMs, 2000);
  });
}
test("temporary status failure recovers without submitting another job", async () => {
  let calls = 0;
  const result = await pollAIVideoStatus({
    jobId: "existing",
    timeoutMs: 1000,
    pollIntervalMs: 1,
    waitForNextPoll: async () => {},
    fetchStatus: async (job, options) => {
      assert.equal(job, "existing");
      assert.ok(options.signal instanceof AbortSignal);
      return ++calls === 1
        ? response(503, {})
        : response(200, { status: "ready", videoUrl: "/v.mp4" });
    },
  });
  assert.equal(result.videoUrl, "/v.mp4");
  assert.equal(calls, 2);
});
test("status retries are bounded and preserve the existing job for manual recovery", async () => {
  let calls = 0;
  await assert.rejects(
    pollAIVideoStatus({
      jobId: "existing",
      timeoutMs: 1000,
      pollIntervalMs: 1,
      waitForNextPoll: async () => {},
      fetchStatus: async () => {
        calls++;
        throw new TypeError("offline");
      },
    }),
    (error) => error.type === "connectivity" && error.details.jobId === "existing",
  );
  assert.equal(calls, 3);
});
test("expired authentication is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    pollAIVideoStatus({
      jobId: "j",
      fetchStatus: async () => {
        calls++;
        return response(401, {});
      },
    }),
    (error) => error.type === "authentication" && !error.retryable,
  );
  assert.equal(calls, 1);
});
test("Retry-After is honored by status polling", async () => {
  const delays = [];
  let calls = 0;
  await pollAIVideoStatus({
    jobId: "j",
    timeoutMs: 5000,
    pollIntervalMs: 1,
    waitForNextPoll: async (ms) => delays.push(ms),
    fetchStatus: async () =>
      ++calls === 1
        ? response(429, {}, "2")
        : response(200, { status: "ready", videoUrl: "/v.mp4" }),
  });
  assert.deepEqual(delays, [2000]);
});
for (const body of [
  {},
  null,
  { status: "unexpected" },
  { status: "ready", videoUrl: "javascript:bad" },
]) {
  test(`malformed status rejected: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(
      pollAIVideoStatus({ jobId: "j", fetchStatus: async () => response(200, body) }),
      (error) => error.type === "invalid_response",
    );
  });
}
test("invalid status JSON has its own category", async () => {
  await assert.rejects(
    pollAIVideoStatus({
      jobId: "j",
      fetchStatus: async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError();
        },
      }),
    }),
    (error) => error.type === "invalid_response",
  );
});
for (const content of ["   ", {}, [], 1]) {
  test(`transcript rejects non-text/blank content: ${JSON.stringify(content)}`, async () => {
    await assert.rejects(
      fetchTranscript("t", async () => response(200, { content })),
      (error) => error.type === "transcript",
    );
  });
}
test("terminal failed jobs do not offer resuming the failed job", async () => {
  await assert.rejects(
    pollAIVideoStatus({ jobId: "j", fetchStatus: async () => response(200, { status: "failed" }) }),
    (error) => error.details.jobFailed && !error.details.jobId,
  );
});
