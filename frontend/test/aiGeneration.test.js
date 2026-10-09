import test, { mock } from "node:test";
import assert from "node:assert/strict";

import {
  AIGenerationError,
  classifyGenerationError,
  pollAIVideoStatus,
  fetchTranscript,
  isAbortError,
  wait,
} from "../src/service/aiGeneration.js";

const response = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("failed jobs produce a retryable generation error", async () => {
  const fetchStatus = async () => response(200, { status: "failed" });

  await assert.rejects(
    pollAIVideoStatus({ jobId: "job-1", fetchStatus, timeoutMs: 1000, pollIntervalMs: 1, waitForNextPoll: async () => {} }),
    (error) => error.type === "generation" && error.retryable,
  );
});

test("polling past the timeout produces a distinct timeout error", async () => {
  const fetchStatus = async () => response(200, { status: "processing" });

  await assert.rejects(
    pollAIVideoStatus({ jobId: "job-1", fetchStatus, timeoutMs: 1, pollIntervalMs: 1, waitForNextPoll: async () => {} }),
    (error) => error.type === "timeout" && error.message.includes("too long"),
  );
});

test("invalid status responses are rejected instead of being treated as ready", async () => {
  const fetchStatus = async () => response(200, { status: "ready", cloudinary_url: "" });

  await assert.rejects(
    pollAIVideoStatus({ jobId: "job-1", fetchStatus, timeoutMs: 1000, pollIntervalMs: 1, waitForNextPoll: async () => {} }),
    (error) => error.type === "invalid_response",
  );
});

test("local video URLs are accepted as ready responses", async () => {
  const fetchStatus = async () => response(200, {
    status: "ready",
    local_video_url: "/videos/local.mp4",
  });

  const result = await pollAIVideoStatus({
    jobId: "job-1",
    fetchStatus,
    timeoutMs: 1000,
    pollIntervalMs: 1,
    waitForNextPoll: async () => {},
  });

  assert.equal(result.videoUrl, "/videos/local.mp4");
});

test("retrying a generation error resets the failure category", () => {
  const error = classifyGenerationError(new TypeError("Failed to fetch"));

  assert.equal(error.type, "connectivity");
  assert.equal(error.retryable, true);
  assert.equal(error.details instanceof TypeError, true);
});

test("missing transcript content is reported as unavailable", async () => {
  const fetchTranscriptFile = async () => response(200, { content: "" });

  await assert.rejects(
    fetchTranscript("transcript-1", fetchTranscriptFile),
    (error) => error.type === "transcript" && !error.retryable,
  );
});

test("an existing transcript is returned unchanged", async () => {
  const fetchTranscriptFile = async () => response(200, { content: "Lesson transcript" });

  assert.equal(await fetchTranscript("transcript-1", fetchTranscriptFile), "Lesson transcript");
});

test("generation errors can be identified without changing their safe message", () => {
  const error = new AIGenerationError("timeout", "Video generation took too long. Please try again.", { retryable: true });

  assert.equal(classifyGenerationError(error), error);
});

test("wait resolves after the delay when no signal is given", async () => {
  await wait(1);
});

test("wait rejects with an AbortError and clears its timer when aborted", async () => {
  const clear = mock.method(globalThis, "clearTimeout");
  try {
    const controller = new AbortController();
    const pending = wait(60_000, controller.signal);
    controller.abort();

    await assert.rejects(pending, isAbortError);
    assert.equal(clear.mock.callCount(), 1);
  } finally {
    clear.mock.restore();
  }
});

test("wait rejects immediately when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(wait(60_000, controller.signal), isAbortError);
});

test("polling stops with an AbortError when aborted during the wait between polls", async () => {
  const controller = new AbortController();
  let polls = 0;
  const fetchStatus = async () => {
    polls += 1;
    return response(200, { status: "processing" });
  };

  const polling = pollAIVideoStatus({
    jobId: "job-1",
    fetchStatus,
    timeoutMs: 600_000,
    pollIntervalMs: 60_000,
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  await assert.rejects(polling, isAbortError);
  assert.equal(polls, 1);
});

test("polling does not issue a request when already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  let polls = 0;

  await assert.rejects(
    pollAIVideoStatus({
      jobId: "job-1",
      fetchStatus: async () => {
        polls += 1;
        return response(200, { status: "ready", cloudinary_url: "/v.mp4" });
      },
      signal: controller.signal,
    }),
    isAbortError,
  );
  assert.equal(polls, 0);
});

test("polling ignores a response that arrives after the signal aborted", async () => {
  const controller = new AbortController();
  const fetchStatus = async () => {
    controller.abort();
    return response(200, { status: "ready", cloudinary_url: "/v.mp4" });
  };

  await assert.rejects(
    pollAIVideoStatus({ jobId: "job-1", fetchStatus, signal: controller.signal }),
    isAbortError,
  );
});

test("the abort signal is handed to the wait between polls", async () => {
  const controller = new AbortController();
  const seen = [];
  let calls = 0;
  const fetchStatus = async () =>
    response(200, calls++ === 0 ? { status: "processing" } : { status: "ready", cloudinary_url: "/v.mp4" });

  await pollAIVideoStatus({
    jobId: "job-1",
    fetchStatus,
    timeoutMs: 1000,
    pollIntervalMs: 1,
    signal: controller.signal,
    waitForNextPoll: async (ms, signal) => seen.push([ms, signal]),
  });

  assert.deepEqual(seen, [[1, controller.signal]]);
});
