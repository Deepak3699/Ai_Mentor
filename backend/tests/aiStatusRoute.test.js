import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";

const { default: express } = await import("express");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");

const realFetch = globalThis.fetch;
const originals = {
  findOne: AIVideo.findOne,
  findByPk: User.findByPk,
};
const user = { id: 1, purchasedCourses: [{ courseId: 12 }] };
const videoId = "4f302af1-908a-4d00-a3c1-95aef52373e3";
let videoJob;
let upstreamStatus;
let upstreamCalls;
let findOneCalls;
let server;
let baseUrl;

const resetVideoJob = (overrides = {}) => {
  videoJob = {
    id: videoId,
    courseId: 12,
    lessonId: 5,
    celebrity: "srk",
    jobId: "python-job-id",
    status: "processing",
    videoUrl: "",
    transcriptName: "lesson.txt",
    meta: null,
    update: async function (values) {
      Object.assign(this, values);
    },
    destroy: async () => {},
    ...overrides,
  };
  upstreamStatus = { status: "ready", local_video_url: "/video-stream/lesson.mp4" };
  upstreamCalls = [];
  findOneCalls = [];
};

before(async () => {
  resetVideoJob();
  AIVideo.findOne = async ({ where }) => {
    findOneCalls.push(where);
    if (where.id === videoId) return videoJob;
    if (
      Number(where.courseId) === videoJob.courseId &&
      String(where.lessonId) === String(videoJob.lessonId) &&
      String(where.celebrity).toLowerCase() === videoJob.celebrity
    ) {
      return videoJob;
    }
    return null;
  };
  User.findByPk = async () => user;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.startsWith(process.env.AI_SERVICE_URL)) {
      upstreamCalls.push({ url: target, method: options.method || "GET" });
      if (target.includes("/status/")) {
        return new Response(JSON.stringify(upstreamStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (options.method === "HEAD") return new Response(null, { status: 200 });
    }
    return realFetch(url, options);
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
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

const request = (path, { method = "GET", body } = {}) =>
  realFetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test("local-only ready status persists the filename and returns a playable proxy URL", async () => {
  resetVideoJob();

  const response = await request(`/api/ai/status/${videoId}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(videoJob.status, "completed");
  assert.equal(videoJob.videoUrl, "lesson.mp4");
  assert.deepEqual(body, {
    status: "ready",
    local_video_url: `/api/ai/video/12/${videoId}.mp4`,
    jobId: videoId,
  });
  assert.equal(findOneCalls.length, 1, "status should use the already-loaded AIVideo record");
  assert.deepEqual(upstreamCalls, [
    { url: "http://ai-service.test/status/python-job-id", method: "GET" },
  ]);
});

test("completed local videos keep returning the proxy URL without polling generation again", async () => {
  resetVideoJob({ status: "completed", videoUrl: "lesson.mp4" });

  const response = await request(`/api/ai/status/${videoId}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.local_video_url, `/api/ai/video/12/${videoId}.mp4`);
  assert.equal(upstreamCalls.length, 0);
});

test("the generation cache returns the protected proxy URL for a local video", async () => {
  resetVideoJob({ status: "completed", videoUrl: "lesson.mp4" });

  const response = await request("/api/ai/generate-video", {
    method: "POST",
    body: { courseId: 12, lessonId: 5, celebrity: "SRK" },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.cached, true);
  assert.equal(body.videoUrl, `/api/ai/video/12/${videoId}.mp4`);
  assert.deepEqual(upstreamCalls, [
    {
      url: "http://ai-service.test/video-stream/lesson.mp4",
      method: "HEAD",
    },
  ]);
});

test("Cloudinary-ready status persists and returns the Cloudinary URL", async () => {
  resetVideoJob();
  upstreamStatus = {
    status: "ready",
    cloudinary_url: "https://res.cloudinary.com/example/video/upload/lesson.mp4",
  };

  const response = await request(`/api/ai/status/${videoId}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(videoJob.status, "completed");
  assert.equal(videoJob.videoUrl, upstreamStatus.cloudinary_url);
  assert.equal(body.cloudinary_url, upstreamStatus.cloudinary_url);
});
