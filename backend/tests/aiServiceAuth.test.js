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

const VIDEOS = [{ courseId: 1, jobId: "Intro_20260101_120000", save: async () => {} }];
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
  AIVideo.findOne = async ({ where }) =>
    VIDEOS.find((v) => (!where.courseId || v.courseId === where.courseId) && (!where.jobId || v.jobId === where.jobId)) ?? null;
  User.findByPk = async (id) => USERS[id] ?? null;
  Preference.findOne = async () => null;

  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).startsWith(process.env.AI_SERVICE_URL)) {
      recordedCalls.push({
        url: String(url),
        method: opts.method || "GET",
        headers: opts.headers || {},
      });
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

test("getAIServiceHeaders returns x-service-key when configured", () => {
  const origKey = process.env.AI_SERVICE_KEY;
  const origSec = process.env.AI_SERVICE_SECRET;

  try {
    process.env.AI_SERVICE_KEY = "my-key";
    delete process.env.AI_SERVICE_SECRET;
    assert.deepEqual(getAIServiceHeaders(), { "x-service-key": "my-key" });

    delete process.env.AI_SERVICE_KEY;
    process.env.AI_SERVICE_SECRET = "my-secret";
    assert.deepEqual(getAIServiceHeaders(), { "x-service-key": "my-secret" });

    delete process.env.AI_SERVICE_KEY;
    delete process.env.AI_SERVICE_SECRET;
    assert.deepEqual(getAIServiceHeaders(), {});
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
  const res = await authedGet("/api/ai/status/job-123");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/status/job-123");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});

test("GET /api/ai/transcript/:filename forwards service credential to AI service", async () => {
  recordedCalls.length = 0;
  const res = await authedGet("/api/ai/transcript/intro.txt");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/transcript/intro.txt");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});

test("GET /api/ai/video/:courseId/:filename forwards service credential to AI service", async () => {
  recordedCalls.length = 0;
  const res = await authedGet("/api/ai/video/1/Intro_20260101_120000.mp4");
  assert.equal(res.status, 200);
  assert.equal(recordedCalls.length, 1);
  assert.equal(recordedCalls[0].url, "http://ai-service.test/video-stream/Intro_20260101_120000.mp4");
  assert.equal(recordedCalls[0].headers["x-service-key"], "test-secret-service-key-999");
});
