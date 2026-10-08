import test from "node:test";
import assert from "node:assert/strict";

import {
  AIGenerationError,
  classifyGenerationError,
  pollAIVideoStatus,
  fetchTranscript,
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
