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
const { default: Course } = await import("../models/Course.js");
const { default: Lesson } = await import("../models/Lesson.js");
const { default: Preferences } = await import("../models/Preference.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");

// In-memory stand-ins for the database.
const VIDEOS = [
  {
    courseId: 1,
    lessonId: 1,
    celebrity: "intro",
    jobId: "Intro_20260101_120000",
    userId: 1,
    videoUrl:
      "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
  },
];

const USERS = {
  1: {
    id: 1,
    role: "user",
    purchasedCourses: [{ courseId: 1 }, { courseId: 2 }],
  },
  2: {
    id: 2,
    role: "user",
    purchasedCourses: [{ courseId: 2 }],
  },
  3: {
    id: 3,
    role: "admin",
    purchasedCourses: [],
  },
  4: {
    id: 4,
    role: "superadmin",
    purchasedCourses: [],
  },
};

const VIDEO_BYTES = Buffer.from("fake-mp4-bytes");
const upstreamCalls = [];
const realFetch = globalThis.fetch;

const originals = {
  videoFindOne: AIVideo.findOne,
  videoFindOrCreate: AIVideo.findOrCreate,
  videoUpdate: AIVideo.update,
  userFindByPk: User.findByPk,
  courseFindByPk: Course.findByPk,
  lessonFindByPk: Lesson.findByPk,
  preferencesFindOne: Preferences.findOne,
};

let server;
let baseUrl;
let nextJobNumber = 1;

before(async () => {
  AIVideo.findOne = async ({ where }) =>
    VIDEOS.find((video) =>
      Object.entries(where).every(
        ([key, value]) => String(video[key]) === String(value)
      )
    ) ?? null;

  AIVideo.findOrCreate = async ({ where, defaults }) => {
    const existing = VIDEOS.find((video) =>
      Object.entries(where).every(
        ([key, value]) => String(video[key]) === String(value)
      )
    );

    if (existing) {
      return [existing, false];
    }

    const created = {
      ...defaults,
      async save() {},
      async destroy() {
        const index = VIDEOS.indexOf(this);
        if (index !== -1) {
          VIDEOS.splice(index, 1);
        }
      },
    };

    VIDEOS.push(created);
    return [created, true];
  };

  AIVideo.update = async (values, { where }) => {
    const matchingVideos = VIDEOS.filter((video) =>
      Object.entries(where).every(
        ([key, value]) => String(video[key]) === String(value)
      )
    );

    matchingVideos.forEach((video) => Object.assign(video, values));
    return [matchingVideos.length];
  };

  User.findByPk = async (id) => USERS[id] ?? null;

  Course.findByPk = async (id) =>
    String(id) === "1" || String(id) === "999"
      ? { id: Number(id), title: `Course ${id}` }
      : null;

  Lesson.findByPk = async (id) =>
    String(id) === "1"
      ? { id: 1, title: "Introduction lesson" }
      : null;

  Preferences.findOne = async () => null;

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);

    if (requestUrl.startsWith(process.env.AI_SERVICE_URL)) {
      upstreamCalls.push(requestUrl);

      if (requestUrl.endsWith("/generate")) {
        return Response.json({
          status: "Processing",
          jobId: `test-job-${nextJobNumber++}`,
          text_file: "test-transcript.txt",
        });
      }

      if (requestUrl.includes("/status/")) {
        return Response.json({ status: "processing" });
      }

      if (options.method === "HEAD") {
        return new Response(null, { status: 200 });
      }

      if (requestUrl.includes("/video-stream/")) {
        return new Response(VIDEO_BYTES, { status: 200 });
      }

      return Response.json({});
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
  AIVideo.findOne = originals.videoFindOne;
  AIVideo.findOrCreate = originals.videoFindOrCreate;
  AIVideo.update = originals.videoUpdate;
  User.findByPk = originals.userFindByPk;
  Course.findByPk = originals.courseFindByPk;
  Lesson.findByPk = originals.lessonFindByPk;
  Preferences.findOne = originals.preferencesFindOne;
  globalThis.fetch = realFetch;

  await new Promise((resolve) => server.close(resolve));
});

const authHeaders = (userId) => ({
  Authorization: `Bearer ${jwt.sign(
    { id: userId },
    process.env.JWT_SECRET
  )}`,
});

const get = (path, userId) =>
  realFetch(`${baseUrl}${path}`, {
    headers: userId ? authHeaders(userId) : {},
  });

const post = (path, body, userId) =>
  realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? authHeaders(userId) : {}),
    },
    body: JSON.stringify(body),
  });

const generationBody = (courseId = 1, lessonId = 1) => ({
  courseId,
  lessonId,
  celebrity: "Test Celebrity",
});

// Existing video-stream tests.

test("unauthenticated request returns 401 and never reaches the AI service", async () => {
  upstreamCalls.length = 0;

  const res = await get("/api/ai/video/1/Intro_20260101_120000.mp4");

  assert.equal(res.status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test("enrolled user gets the video for the matching course", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/video/1/Intro_20260101_120000.mp4",
    1
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), VIDEO_BYTES);
  assert.deepEqual(upstreamCalls, [
    "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
  ]);
});

test("mismatched courseId returns 404 even if the user owns that course", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/video/2/Intro_20260101_120000.mp4",
    1
  );

  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("user not enrolled in the course returns 403", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/video/1/Intro_20260101_120000.mp4",
    2
  );

  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("filename with no matching AIVideo record returns 404", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/video/1/Somebody_Elses_20260101_120000.mp4",
    1
  );

  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("non-mp4 filenames and non-numeric courseIds return 404", async () => {
  upstreamCalls.length = 0;

  assert.equal(
    (await get("/api/ai/video/1/Intro_20260101_120000.txt", 1)).status,
    404
  );

  assert.equal(
    (await get("/api/ai/video/abc/Intro_20260101_120000.mp4", 1)).status,
    404
  );

  assert.equal(upstreamCalls.length, 0);
});

// Course access and generation tests.

test("non-buyer receives 403 and cannot trigger video generation", async () => {
  upstreamCalls.length = 0;

  const res = await post(
    "/api/ai/generate-video",
    generationBody(1, 1),
    2
  );

  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("enrolled buyer can request video generation", async () => {
  upstreamCalls.length = 0;

  const res = await post(
    "/api/ai/generate-video",
    generationBody(1, 1),
    1
  );

  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.jobId);
  assert.ok(
    upstreamCalls.some((url) => url.endsWith("/generate"))
  );

  const record = VIDEOS.find(
    (video) => video.jobId === data.jobId
  );

  assert.ok(record);
  assert.equal(String(record.userId), "1");
});

test("admin can request video generation for a course they have not purchased", async () => {
  upstreamCalls.length = 0;

  const res = await post(
    "/api/ai/generate-video",
    generationBody(999, 1),
    3
  );

  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.jobId);
  assert.ok(
    upstreamCalls.some((url) => url.endsWith("/generate"))
  );
});

test("superadmin can request video generation for a course they have not purchased", async () => {
  upstreamCalls.length = 0;

  const res = await post(
    "/api/ai/generate-video",
    generationBody(999, 1),
    4
  );

  assert.equal(res.status, 200);

  const data = await res.json();
  assert.ok(data.jobId);
});

// Job-status ownership tests.

test("video job owner can check job status", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/status/Intro_20260101_120000",
    1
  );

  assert.equal(res.status, 200);
  assert.ok(
    upstreamCalls.includes(
      "http://ai-service.test/status/Intro_20260101_120000"
    )
  );
});

test("another user cannot check someone else's job status", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/status/Intro_20260101_120000",
    2
  );

  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("admin can check a video job status", async () => {
  upstreamCalls.length = 0;

  const res = await get(
    "/api/ai/status/Intro_20260101_120000",
    3
  );

  assert.equal(res.status, 200);
  assert.ok(
    upstreamCalls.includes(
      "http://ai-service.test/status/Intro_20260101_120000"
    )
  );
});

test("unknown job ID returns 404 without contacting the AI service", async () => {
  upstreamCalls.length = 0;

  const res = await get("/api/ai/status/unknown-job", 1);

  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});
