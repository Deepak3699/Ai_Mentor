import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

// Env must be set before the app modules are imported.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";

const { default: express } = await import("express");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");

// In-memory stand-ins for the database.
const VIDEOS = [{ id: "test-ai-id", courseId: 1, jobId: "Intro_20260101_120000", userId: 1, status: "processing" }];
const USERS = {
  1: { id: 1, role: "user", purchasedCourses: [{ courseId: 1 }, { courseId: 2 }] },
  2: { id: 2, role: "user", purchasedCourses: [{ courseId: 2 }] },
  3: { id: 3, role: "admin", purchasedCourses: [] },
};
const VIDEO_BYTES = Buffer.from("fake-mp4-bytes");

const realFetch = globalThis.fetch;
const upstreamCalls = [];
const originals = {
  findOne: AIVideo.findOne,
  findByPk: User.findByPk,
  update: AIVideo.update,
};

let server;
let baseUrl;

before(async () => {
  AIVideo.findOne = async ({ where }) => {
    if (where.courseId !== undefined && where.id !== undefined) {
      return VIDEOS.find((v) => v.courseId === where.courseId && v.id === where.id) ?? null;
    }
    if (where.id !== undefined) {
      return VIDEOS.find((v) => v.id === where.id) ?? null;
    }
    if (where.courseId !== undefined && where.jobId !== undefined) {
      return VIDEOS.find((v) => v.courseId === where.courseId && v.jobId === where.jobId) ?? null;
    }
    if (where.jobId !== undefined) {
      return VIDEOS.find((v) => v.jobId === where.jobId) ?? null;
    }
    return null;
  };
  AIVideo.update = async () => [1];
  User.findByPk = async (id) => USERS[id] ?? null;

  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(process.env.AI_SERVICE_URL)) {
      upstreamCalls.push(String(url));
      return new Response(VIDEO_BYTES, { status: 200 });
    }
    return realFetch(url, opts);
  };

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

const get = (path, userId) =>
  realFetch(`${baseUrl}${path}`, {
    headers: userId
      ? { Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}` }
      : {},
  });

test("unauthenticated request returns 401 and never reaches the AI service", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/test-ai-id.mp4");
  assert.equal(res.status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test("enrolled user gets the video for the matching course", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/test-ai-id.mp4", 1);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), VIDEO_BYTES);
  assert.deepEqual(upstreamCalls, [
    "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
  ]);
});

test("mismatched courseId returns 404 even if the user owns that course", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/2/test-ai-id.mp4", 1);
  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("user not enrolled in the course returns 403", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/test-ai-id.mp4", 2);
  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("filename with no matching AIVideo record returns 404", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/Somebody_Elses_20260101_120000.mp4", 1);
  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("non-mp4 filenames and non-numeric courseIds return 404", async () => {
  upstreamCalls.length = 0;
  assert.equal((await get("/api/ai/video/1/test-ai-id.txt", 1)).status, 404);
  assert.equal((await get("/api/ai/video/abc/test-ai-id.mp4", 1)).status, 404);
  assert.equal(upstreamCalls.length, 0);
});
test("status route returns 404 for unknown job", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/status/UnknownJob", 1);
  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("status route allows the owner to view status and fetches upstream", async () => {
  upstreamCalls.length = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(JSON.stringify({ status: "processing" }), { status: 200 });
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", 1);
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
});

test("status route returns 403 for different user", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/status/test-ai-id", 2);
  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("status route allows admin to view any status", async () => {
  upstreamCalls.length = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(JSON.stringify({ status: "processing" }), { status: 200 });
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", 3);
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
});
