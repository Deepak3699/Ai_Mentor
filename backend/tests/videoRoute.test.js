import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

// Env must be set before the app modules are imported.
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";

const { default: express } = await import("express");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");

// In-memory stand-ins for the database.
const VIDEOS = [{ courseId: 1, jobId: "Intro_20260101_120000" }];
const USERS = {
  1: { id: 1, purchasedCourses: [{ courseId: 1 }, { courseId: 2 }] },
  2: { id: 2, purchasedCourses: [{ courseId: 2 }] },
};
const VIDEO_BYTES = Buffer.from("fake-mp4-bytes");

const realFetch = globalThis.fetch;
const upstreamCalls = [];
const originals = {
  findOne: AIVideo.findOne,
  findByPk: User.findByPk,
};

let server;
let baseUrl;

before(async () => {
  AIVideo.findOne = async ({ where }) =>
    VIDEOS.find((v) => v.courseId === where.courseId && v.jobId === where.jobId) ?? null;
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
  const res = await get("/api/ai/video/1/Intro_20260101_120000.mp4");
  assert.equal(res.status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test("enrolled user gets the video for the matching course", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/Intro_20260101_120000.mp4", 1);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), VIDEO_BYTES);
  assert.deepEqual(upstreamCalls, [
    "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
  ]);
});

test("mismatched courseId returns 404 even if the user owns that course", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/2/Intro_20260101_120000.mp4", 1);
  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("user not enrolled in the course returns 403", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/Intro_20260101_120000.mp4", 2);
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
  assert.equal((await get("/api/ai/video/1/Intro_20260101_120000.txt", 1)).status, 404);
  assert.equal((await get("/api/ai/video/abc/Intro_20260101_120000.mp4", 1)).status, 404);
  assert.equal(upstreamCalls.length, 0);
});
