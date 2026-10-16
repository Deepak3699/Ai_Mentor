import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

// Configure test environment variables before module imports
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-for-rate-limits";
process.env.AI_SERVICE_URL = "http://ai-service.test";
// Test default environment limits
process.env.AI_RATE_LIMIT_WINDOW_MS = "500";
process.env.AI_RATE_LIMIT_MAX_REQUESTS = "2";

const { default: express } = await import("express");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: Course } = await import("../models/Course.js");
const { default: Lesson } = await import("../models/Lesson.js");
const { default: Preferences } = await import("../models/Preference.js");
const { setVideoQueue, closeVideoQueue } = await import("../queues/videoQueue.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");
const { createAIRateLimiter } = await import("../middleware/aiRateLimiter.js");

const USERS = {
  1: { id: 1, purchasedCourses: [{ courseId: 1 }] },
  2: { id: 2, purchasedCourses: [{ courseId: 1 }] },
  3: { id: 3, purchasedCourses: [] }, // not enrolled
};

const queueCalls = [];

const originals = {
  findOneVideo: AIVideo.findOne,
  createVideo: AIVideo.create,
  findByPkUser: User.findByPk,
  findByPkCourse: Course.findByPk,
  findByPkLesson: Lesson.findByPk,
  findOnePreferences: Preferences.findOne,
  consoleWarn: console.warn,
};

let server;
let baseUrl;
const loggedWarnings = [];

before(async () => {
  AIVideo.findOne = async () => null; // cache miss so it proceeds to generation
  AIVideo.create = async () => ({ id: "mock-video-job-id" });
  User.findByPk = async (id) => USERS[id] ?? null;
  Course.findByPk = async (id) => ({ id: Number(id), title: `Course ${id}` });
  Lesson.findByPk = async (id) => ({ id: Number(id), title: `Lesson ${id}` });
  Preferences.findOne = async () => null;

  setVideoQueue({
    add: async (jobName, data) => {
      queueCalls.push({ jobName, data });
      return { id: `bull-job-${queueCalls.length}` };
    },
  });

  console.warn = (...args) => {
    loggedWarnings.push(args.join(" "));
  };

  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  AIVideo.findOne = originals.findOneVideo;
  AIVideo.create = originals.createVideo;
  User.findByPk = originals.findByPkUser;
  Course.findByPk = originals.findByPkCourse;
  Lesson.findByPk = originals.findByPkLesson;
  Preferences.findOne = originals.findOnePreferences;
  console.warn = originals.consoleWarn;
  await closeVideoQueue();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  queueCalls.length = 0;
  loggedWarnings.length = 0;
});

const postGenerate = (userId, body = {}) => {
  const defaultBody = {
    courseId: 1,
    lessonId: "1",
    celebrity: "salman",
    speech_rate: "1.0",
    speech_pitch: "0Hz",
  };

  const headers = { "Content-Type": "application/json" };
  if (userId) {
    headers.Authorization = `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`;
  }

  return fetch(`${baseUrl}/api/ai/generate-video`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...defaultBody, ...body }),
  });
};

test("unauthenticated request returns 401 and never touches rate limits or starts video generation", async () => {
  const res = await postGenerate(null);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.message, "Not authorized, no token");
  assert.equal(queueCalls.length, 0);
});

test("user within limit successfully triggers generation and enqueues job", async () => {
  // Wait to ensure window starts clean for user 1
  await new Promise((resolve) => setTimeout(resolve, 600));

  const res = await postGenerate(1);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "processing");
  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].data.celebrity, "salman");
});

test("enforces per-user limit with 429 response, Retry-After header, and blocks queue execution", async () => {
  // User 1 makes requests up to the max limit (2 allowed per 500ms)
  await new Promise((resolve) => setTimeout(resolve, 600));

  const res1 = await postGenerate(1);
  assert.equal(res1.status, 200);
  assert.equal(queueCalls.length, 1);

  const res2 = await postGenerate(1);
  assert.equal(res2.status, 200);
  assert.equal(queueCalls.length, 2);

  // 3rd request from User 1 exceeds the limit
  const res3 = await postGenerate(1, { sensitivePrompt: "super-secret-user-prompt-do-not-leak" });
  assert.equal(res3.status, 429);

  // Headers check
  const retryHeader = res3.headers.get("retry-after");
  assert.ok(retryHeader, "Expected Retry-After header on 429 response");
  assert.ok(Number(retryHeader) >= 1, "Retry-After should be a positive number of seconds");

  // Consistent body format check
  const data3 = await res3.json();
  assert.equal(data3.error, "Too Many Requests");
  assert.ok(
    data3.message.includes("Too many AI generation requests"),
    `Unexpected message: ${data3.message}`,
  );
  assert.ok(typeof data3.retryAfter === "number" && data3.retryAfter > 0);

  // Rejected request must NOT enqueue another job or call AI service
  assert.equal(queueCalls.length, 2, "Queue should not receive jobs for rejected 429 requests");

  // Verify sensitive payload is not leaked in the 429 response or logs
  assert.ok(!JSON.stringify(data3).includes("super-secret-user-prompt"));
  assert.ok(!loggedWarnings.some((w) => w.includes("super-secret-user-prompt")));
  assert.ok(loggedWarnings.some((w) => w.includes("User 1 exceeded rate limit")));
});

test("different users are tracked independently (user isolation)", async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Exhaust User 1 limit
  const u1_req1 = await postGenerate(1);
  assert.equal(u1_req1.status, 200);
  const u1_req2 = await postGenerate(1);
  assert.equal(u1_req2.status, 200);
  const u1_blocked = await postGenerate(1);
  assert.equal(u1_blocked.status, 429);

  // User 2 should NOT be blocked by User 1 reaching their limit
  const u2_req1 = await postGenerate(2);
  assert.equal(u2_req1.status, 200);
  const u2_data = await u2_req1.json();
  assert.equal(u2_data.status, "processing");
});

test("limit resets after the window expires", async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Exhaust User 1
  assert.equal((await postGenerate(1)).status, 200);
  assert.equal((await postGenerate(1)).status, 200);
  assert.equal((await postGenerate(1)).status, 429);

  // Wait for the window (500ms + buffer) to expire
  await new Promise((resolve) => setTimeout(resolve, 600));

  // User 1 should now be allowed again
  const resAfterExpiry = await postGenerate(1);
  assert.equal(resAfterExpiry.status, 200);
  const data = await resAfterExpiry.json();
  assert.equal(data.status, "processing");
});

test("cached video requests do not consume rate limit quota and remain accessible when quota is exhausted", async () => {
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Exhaust User 1's generation quota (2 allowed)
  assert.equal((await postGenerate(1)).status, 200);
  assert.equal((await postGenerate(1)).status, 200);

  // 3rd generation request (cache miss) is rate-limited (429)
  const blockedMiss = await postGenerate(1);
  assert.equal(blockedMiss.status, 429);

  // Mock an existing verified cached video
  AIVideo.findOne = async () => ({
    courseId: 1,
    lessonId: "1",
    celebrity: "salman",
    videoUrl: "https://res.cloudinary.com/test-cloud/video/upload/sample.mp4",
    transcriptName: "sample.vtt",
    jobId: "cached-job-123",
    meta: { provider: "gemini" },
  });

  // Cached request from the same rate-limited user must succeed (200 OK) without 429
  const cachedRes = await postGenerate(1);
  assert.equal(cachedRes.status, 200);
  const cachedData = await cachedRes.json();
  assert.equal(cachedData.cached, true);
  assert.equal(
    cachedData.videoUrl,
    "https://res.cloudinary.com/test-cloud/video/upload/sample.mp4",
  );

  // Restore cache miss mock for other tests
  AIVideo.findOne = async () => null;
});

test("createAIRateLimiter allows custom configuration and standalone usage", async () => {
  const customLimiter = createAIRateLimiter({ windowMs: 200, max: 1 });
  const app = express();
  app.use(express.json());
  app.post(
    "/test-ai",
    (req, _res, next) => {
      req.user = { id: 99 };
      next();
    },
    customLimiter,
    (_req, res) => res.json({ ok: true }),
  );

  const localServer = http.createServer(app);
  await new Promise((resolve) => localServer.listen(0, resolve));
  const url = `http://127.0.0.1:${localServer.address().port}/test-ai`;

  try {
    const first = await fetch(url, { method: "POST" });
    assert.equal(first.status, 200);

    const second = await fetch(url, { method: "POST" });
    assert.equal(second.status, 429);
    const data = await second.json();
    assert.equal(data.error, "Too Many Requests");
    assert.ok(data.retryAfter > 0);
  } finally {
    await new Promise((resolve) => localServer.close(resolve));
  }
});
