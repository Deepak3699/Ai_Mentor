import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";
process.env.AI_SERVICE_KEY = "test-secret-service-key-999";

const { default: express } = await import("express");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: Preference } = await import("../models/Preference.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");
const { getAIServiceHeaders } = await import("../utils/aiService.js");

const VIDEOS = [
  {
    id: 10,
    courseId: 1,
    lessonId: "lesson-1",
    celebrity: "modi",
    jobId: "Intro_20260101_120000",
    videoUrl: "http://ai-service.test/video-stream/cached_video.mp4",
    transcriptName: "cached_transcript.txt",
    meta: { duration: 100 },
    save: async () => {},
    destroy: async () => {},
  },
];

const USERS = {
  1: { id: 1, purchasedCourses: [{ courseId: 1 }] },
};
const VIDEO_BYTES = Buffer.from("fake-mp4-stream");

const realFetch = globalThis.fetch;
const recordedCalls = [];
const originals = {
  findOne: AIVideo.findOne,
  findByPk: User.findByPk,
  findPreference: Preference.findOne,
};

let server;
let baseUrl;

before(async () => {
  AIVideo.findOne = async ({ where }) => {
    return VIDEOS.find((v) => {
      if (where.id !== undefined && String(v.id) !== String(where.id)) return false;
      if (where.courseId !== undefined && Number(v.courseId) !== Number(where.courseId)) return false;
      if (where.jobId !== undefined && String(v.jobId) !== String(where.jobId)) return false;
      if (where.transcriptName !== undefined && String(v.transcriptName) !== String(where.transcriptName)) return false;
      if (where.lessonId !== undefined && String(v.lessonId) !== String(where.lessonId)) return false;
      if (where.celebrity !== undefined && String(v.celebrity) !== String(where.celebrity)) return false;
      return true;
    }) ?? null;
  };

  User.findByPk = async (id) => USERS[id] ?? null;
  Preference.findOne = async () => null;

  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith(process.env.AI_SERVICE_URL)) {
      recordedCalls.push({
        url: String(url),
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body || null,
      });

      if (opts.method === "HEAD") {
        return new Response(null, { status: 200 });
      }

      if (String(url).endsWith("/voices")) {
        return new Response(JSON.stringify({ voices: ["voice-1"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (String(url).includes("/status/")) {
        return new Response(JSON.stringify({ status: "processing" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (String(url).includes("/transcript/")) {
        return new Response(JSON.stringify({ content: "test transcript" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(VIDEO_BYTES, { status: 200 });
    }
    return realFetch(url, opts);
  };

  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  AIVideo.findOne = originals.findOne;
  User.findByPk = originals.findByPk;
  Preference.findOne = originals.findPreference;
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

const authedGet = (path, userId = 1) =>
  realFetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`,
    },
  });

const authedPost = (path, body, userId = 1) =>
  realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`,
    },
    body: JSON.stringify(body),
  });

test("getAIServiceHeaders returns trimmed canonical x-service-key when configured", () => {
  const origKey = process.env.AI_SERVICE_KEY;
  try {
    process.env.AI_SERVICE_KEY = "my-key";
    assert.deepEqual(getAIServiceHeaders(), { "x-service-key": "my-key" });

    process.env.AI_SERVICE_KEY = "   trimmed-key   ";
    assert.deepEqual(getAIServiceHeaders(), { "x-service-key": "trimmed-key" });
  } finally {
    process.env.AI_SERVICE_KEY = origKey;
  }
});

test("getAIServiceHeaders fails fast with Error when AI_SERVICE_KEY is missing or empty", () => {
  const origKey = process.env.AI_SERVICE_KEY;
  const origSec = process.env.AI_SERVICE_SECRET;

  try {
    delete process.env.AI_SERVICE_KEY;
    delete process.env.AI_SERVICE_SECRET;
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );

    process.env.AI_SERVICE_KEY = "";
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );

    process.env.AI_SERVICE_KEY = "    ";
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );

    // Ensure undocumented AI_SERVICE_SECRET is NOT used as fallback
    delete process.env.AI_SERVICE_KEY;
    process.env.AI_SERVICE_SECRET = "legacy-secret";
    assert.throws(
      () => getAIServiceHeaders(),
      /AI_SERVICE_KEY is not configured in environment variables/
    );
  } finally {
    process.env.AI_SERVICE_KEY = origKey;
    if (origSec) process.env.AI_SERVICE_SECRET = origSec;
  }
});

test("GET /api/ai/voices forwards service credential to AI service", async () => {
  recordedCalls.length = 0;
  const res = await authedGet("/api/ai/voices");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/voices");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});

test("GET /api/ai/status/:jobId forwards service credential to AI service", async () => {
  recordedCalls.length = 0;
  const res = await authedGet("/api/ai/status/10");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/status/Intro_20260101_120000");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});

test("GET /api/ai/transcript/:filename forwards service credential to AI service", async () => {
  recordedCalls.length = 0;
  const res = await authedGet("/api/ai/transcript/uncached.txt");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/transcript/uncached.txt");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});

test("GET /api/ai/video/:courseId/:filename forwards service credential to AI service", async () => {
  recordedCalls.length = 0;
  const res = await authedGet("/api/ai/video/1/10.mp4");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/video-stream/Intro_20260101_120000.mp4");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});

test("POST /api/ai/generate-video cache check forwards service credential on HEAD request", async () => {
  recordedCalls.length = 0;
  const res = await authedPost("/api/ai/generate-video", {
    courseId: 1,
    lessonId: "lesson-1",
    celebrity: "modi",
  });
  assert.equal(res.status, 200);
  const headCall = recordedCalls.find((c) => c.method === "HEAD");
  assert.ok(headCall, "HEAD request for video check must be made");
  assert.equal(headCall.url, "http://ai-service.test/video-stream/cached_video.mp4");
  assert.equal(headCall.headers["x-service-key"], "test-secret-service-key-999");
});
