import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";
process.env.AI_SERVICE_TIMEOUT_MS = "25";

const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");
const { AI_SERVICE_TIMEOUT_MESSAGE } = await import("../utils/fetchWithTimeout.js");

const realFetch = globalThis.fetch;
const originals = {
  findOne: AIVideo.findOne,
  findByPk: User.findByPk,
};

let server;
let baseUrl;

before(async () => {
  AIVideo.findOne = async ({ where }) => ({
    id: where.id,
    courseId: where.courseId,
    jobId: "Intro_20260101_120000",
    transcript: null,
  });
  User.findByPk = async () => ({ id: 1, purchasedCourses: [{ courseId: 1 }] });

  // Simulates an unresponsive AI service: the request never settles until the
  // helper's timeout signal aborts it.
  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason));
    });

  const app = express();
  app.use("/api/ai", aiRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  AIVideo.findOne = originals.findOne;
  User.findByPk = originals.findByPk;
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

test("video proxy returns 503 with a clear message when the AI service hangs", async () => {
  const response = await realFetch(`${baseUrl}/api/ai/video/1/video-1.mp4`, {
    headers: {
      Authorization: `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`,
    },
  });

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, AI_SERVICE_TIMEOUT_MESSAGE);
});
