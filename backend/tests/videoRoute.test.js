import { test, before, after, beforeEach } from "node:test";
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
// Production-like UUIDs
const ownerId = "11111111-1111-1111-1111-111111111111";
const otherId = "22222222-2222-2222-2222-222222222222";
const learnerBId = "55555555-5555-5555-5555-555555555555";
const adminId = "33333333-3333-3333-3333-333333333333";
const superAdminId = "44444444-4444-4444-4444-444444444444";

const INITIAL_VIDEOS = [
  {
    id: "test-ai-id",
    courseId: 1,
    lessonId: 1,
    celebrity: "einstein",
    jobId: "Intro_20260101_120000",
    userId: ownerId,
    status: "processing",
  },
  {
    id: "ownerless-ai-id",
    courseId: 1,
    lessonId: 2,
    celebrity: "newton",
    jobId: "Ownerless_20260101_120000",
    userId: null,
    status: "processing",
  },
];
const VIDEOS = [];
const resetVideos = () => {
  VIDEOS.length = 0;
  for (const v of INITIAL_VIDEOS) {
    VIDEOS.push({ ...v });
  }
};
resetVideos();

const USERS = {
  [ownerId]: { id: ownerId, role: "user", purchasedCourses: [{ courseId: 1 }, { courseId: 2 }] },
  [otherId]: { id: otherId, role: "user", purchasedCourses: [{ courseId: 2 }] },
  [learnerBId]: { id: learnerBId, role: "user", purchasedCourses: [{ courseId: 1 }] },
  [adminId]: { id: adminId, role: "admin", purchasedCourses: [] },
  [superAdminId]: { id: superAdminId, role: "superadmin", purchasedCourses: [] },
};
const VIDEO_BYTES = Buffer.from("fake-mp4-bytes");

const realFetch = globalThis.fetch;
const upstreamCalls = [];
const updateCalls = [];
const originals = {
  findOne: AIVideo.findOne,
  findByPk: User.findByPk,
  update: AIVideo.update,
};

let server;
let baseUrl;

const mockFindOne = async ({ where }) => {
  let target = null;
  if (
    where.courseId !== undefined &&
    where.lessonId !== undefined &&
    where.celebrity !== undefined
  ) {
    target =
      VIDEOS.find(
        (v) =>
          v.courseId === where.courseId &&
          v.lessonId === where.lessonId &&
          v.celebrity === where.celebrity,
      ) ?? null;
  } else if (where.courseId !== undefined && where.id !== undefined) {
    target = VIDEOS.find((v) => v.courseId === where.courseId && v.id === where.id) ?? null;
  } else if (where.id !== undefined) {
    target = VIDEOS.find((v) => v.id === where.id) ?? null;
  } else if (where.courseId !== undefined && where.jobId !== undefined) {
    target = VIDEOS.find((v) => v.courseId === where.courseId && v.jobId === where.jobId) ?? null;
  } else if (where.jobId !== undefined) {
    target = VIDEOS.find((v) => v.jobId === where.jobId) ?? null;
  }
  if (target && !target.reload) {
    target.reload = async () => target;
  }
  return target;
};

const mockUpdate = async (values, options = {}) => {
  updateCalls.push({ values, options, where: options?.where });
  const where = options?.where;
  if (!where || !where.id) {
    return [0];
  }
  const target = VIDEOS.find((v) => {
    if (v.id !== where.id) return false;
    if (where.userId !== undefined && v.userId !== where.userId) return false;
    return true;
  });
  if (!target) {
    return [0];
  }
  Object.assign(target, values);
  if (!target.reload) {
    target.reload = async () => target;
  }
  return [1];
};

const mockFindByPk = async (id) => USERS[id] ?? null;

before(async () => {
  AIVideo.findOne = mockFindOne;
  AIVideo.update = mockUpdate;
  User.findByPk = mockFindByPk;

  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith(process.env.AI_SERVICE_URL)) {
      upstreamCalls.push(String(url));
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
  AIVideo.update = originals.update;
  User.findByPk = originals.findByPk;
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetVideos();
  AIVideo.findOne = mockFindOne;
  AIVideo.update = mockUpdate;
  User.findByPk = mockFindByPk;
  upstreamCalls.length = 0;
  updateCalls.length = 0;
});

const get = (path, userId) =>
  realFetch(`${baseUrl}${path}`, {
    headers: userId
      ? { Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}` }
      : {},
  });

const post = (path, body, userId) =>
  realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId
        ? { Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}` }
        : {}),
    },
    body: JSON.stringify(body),
  });

test("unauthenticated request returns 401 and never reaches the AI service", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/test-ai-id.mp4");
  assert.equal(res.status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test("enrolled user gets the video for the matching course", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/test-ai-id.mp4", ownerId);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), VIDEO_BYTES);
  assert.deepEqual(upstreamCalls, [
    "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
  ]);
});

test("mismatched courseId returns 404 even if the user owns that course", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/2/test-ai-id.mp4", ownerId);
  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("user not enrolled in the course returns 403", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/test-ai-id.mp4", otherId);
  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("filename with no matching AIVideo record returns 404", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/video/1/Somebody_Elses_20260101_120000.mp4", ownerId);
  assert.equal(res.status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("non-mp4 filenames and non-numeric courseIds return 404", async () => {
  upstreamCalls.length = 0;
  assert.equal((await get("/api/ai/video/1/test-ai-id.txt", ownerId)).status, 404);
  assert.equal((await get("/api/ai/video/abc/test-ai-id.mp4", ownerId)).status, 404);
  assert.equal(upstreamCalls.length, 0);
});

test("status route returns 404 for unknown job", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/status/UnknownJob", ownerId);
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
  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
});

test("status route returns 403 for different user", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/status/test-ai-id", otherId);
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
  const res = await get("/api/ai/status/test-ai-id", adminId);
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
});

test("status route allows superadmin to view any status", async () => {
  upstreamCalls.length = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(JSON.stringify({ status: "processing" }), { status: 200 });
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", superAdminId);
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
});

test("status route fails closed for ownerless jobs accessed by normal users", async () => {
  upstreamCalls.length = 0;
  const res = await get("/api/ai/status/ownerless-ai-id", otherId);
  assert.equal(res.status, 403);
  assert.equal(upstreamCalls.length, 0);
});

test("status route allows admin to view ownerless jobs", async () => {
  upstreamCalls.length = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Ownerless_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(JSON.stringify({ status: "processing" }), { status: 200 });
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/ownerless-ai-id", adminId);
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
});

test("status route updates completed status with owner boundary for normal user", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          cloudinary_url: "https://res.cloudinary.com/demo/video/upload/sample.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ready");
  assert.equal(data.jobId, "test-ai-id");
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].where, { id: "test-ai-id", userId: ownerId });
  assert.equal(updateCalls[0].values.status, "completed");
  assert.equal(
    updateCalls[0].values.videoUrl,
    "https://res.cloudinary.com/demo/video/upload/sample.mp4",
  );
});

test("status route updates failed status with owner boundary for normal user", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(JSON.stringify({ status: "failed" }), { status: 200 });
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "failed");
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].where, { id: "test-ai-id", userId: ownerId });
  assert.equal(updateCalls[0].values.status, "failed");
});

test("status route allows admin update via administrative path without constraining by admin userId", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          cloudinary_url: "https://res.cloudinary.com/demo/video/upload/admin_sample.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", adminId);
  assert.equal(res.status, 200);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].where, { id: "test-ai-id" });
  assert.equal(updateCalls[0].values.status, "completed");
});

test("status route allows admin update on ownerless job via administrative path", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Ownerless_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          cloudinary_url: "https://res.cloudinary.com/demo/video/upload/ownerless_sample.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/ownerless-ai-id", adminId);
  assert.equal(res.status, 200);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].where, { id: "ownerless-ai-id" });
  assert.equal(updateCalls[0].values.status, "completed");
});

test("status route formats local_video_url using loaded videoJob record", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          local_video_url: "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };
  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ready");
  assert.equal(data.local_video_url, "/api/ai/video/1/Intro_20260101_120000.mp4");
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].where, { id: "test-ai-id", userId: ownerId });
});

test("update mock validates where clause and returns 0 when record or owner does not match", async () => {
  const mismatchedOwnerResult = await AIVideo.update(
    { status: "completed" },
    { where: { id: "test-ai-id", userId: otherId } },
  );
  assert.deepEqual(mismatchedOwnerResult, [0]);

  const nonExistentIdResult = await AIVideo.update(
    { status: "completed" },
    { where: { id: "non-existent-id" } },
  );
  assert.deepEqual(nonExistentIdResult, [0]);
});

test("status route returns 403 when update affected-row count is 0", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          cloudinary_url: "https://res.cloudinary.com/demo/video/upload/sample.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };

  AIVideo.update = async () => [0];

  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, "Failed to update status: unauthorized or record not found");
});

test("status route persists cloudinary_url when only remote URL is provided", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          cloudinary_url: "https://res.cloudinary.com/remote/video.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };

  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 200);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].values.videoUrl, "https://res.cloudinary.com/remote/video.mp4");
});

test("status route persists local_video_url and does not write undefined cloudinary_url when local-only", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
          local_video_url: "http://ai-service.test/video-stream/Intro_20260101_120000.mp4",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };

  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 200);
  assert.equal(updateCalls.length, 1);
  assert.notEqual(updateCalls[0].values.videoUrl, undefined);
  assert.equal(updateCalls[0].values.videoUrl, "/api/ai/video/1/Intro_20260101_120000.mp4");
});

test("status route returns 502 when AI service reports ready without any video output", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/status/Intro_20260101_120000")) {
      upstreamCalls.push(String(url));
      return new Response(
        JSON.stringify({
          status: "ready",
        }),
        { status: 200 },
      );
    }
    return realFetch(url);
  };

  const res = await get("/api/ai/status/test-ai-id", ownerId);
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.equal(data.error, "AI service reported ready without video output");
  assert.equal(updateCalls.length, 0);
});

test("completed cached video is accessible to another enrolled learner without transferring ownership", async () => {
  const completedVideo = VIDEOS.find((v) => v.id === "test-ai-id");
  completedVideo.status = "completed";
  completedVideo.videoUrl = "https://res.cloudinary.com/demo/video/upload/cached.mp4";
  completedVideo.userId = ownerId;

  const res = await get("/api/ai/status/test-ai-id", learnerBId);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ready");
  assert.equal(data.cloudinary_url, "https://res.cloudinary.com/demo/video/upload/cached.mp4");
  assert.equal(completedVideo.userId, ownerId);
  assert.equal(updateCalls.length, 0);
});

test("in-flight job status is private to the requester and denied to other enrolled learners", async () => {
  const processingVideo = VIDEOS.find((v) => v.id === "test-ai-id");
  processingVideo.status = "processing";
  processingVideo.userId = ownerId;

  const res = await get("/api/ai/status/test-ai-id", learnerBId);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, "Access denied");
  assert.equal(upstreamCalls.length, 0);
});

test("user not enrolled in the course is denied access to completed video cache", async () => {
  const completedVideo = VIDEOS.find((v) => v.id === "test-ai-id");
  completedVideo.status = "completed";
  completedVideo.videoUrl = "https://res.cloudinary.com/demo/video/upload/cached.mp4";
  completedVideo.userId = ownerId;

  const res = await get("/api/ai/status/test-ai-id", otherId);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, "Access denied");
});

test("generate-video returns cached artifact to another authorized learner without reassigning userId", async () => {
  const completedVideo = VIDEOS.find((v) => v.id === "test-ai-id");
  completedVideo.status = "completed";
  completedVideo.videoUrl = "https://res.cloudinary.com/demo/video/upload/cached.mp4";
  completedVideo.userId = ownerId;

  const res = await post(
    "/api/ai/generate-video",
    { courseId: 1, lessonId: 1, celebrity: "einstein" },
    learnerBId,
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.cached, true);
  assert.equal(data.videoUrl, "https://res.cloudinary.com/demo/video/upload/cached.mp4");
  assert.equal(completedVideo.userId, ownerId);
});

test("generate-video informs another authorized learner of in-progress generation without reassigning userId", async () => {
  const processingVideo = VIDEOS.find((v) => v.id === "test-ai-id");
  processingVideo.status = "processing";
  processingVideo.userId = ownerId;

  const res = await post(
    "/api/ai/generate-video",
    { courseId: 1, lessonId: 1, celebrity: "einstein" },
    learnerBId,
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "processing");
  assert.equal(data.message, "Video generation is already in progress");
  assert.equal(processingVideo.userId, ownerId);
});

test("concurrent generate requests from different authorized learners preserve original generation record", async () => {
  const completedVideo = VIDEOS.find((v) => v.id === "test-ai-id");
  completedVideo.status = "completed";
  completedVideo.videoUrl = "https://res.cloudinary.com/demo/video/upload/cached.mp4";
  completedVideo.userId = ownerId;

  const [resA, resB] = await Promise.all([
    post("/api/ai/generate-video", { courseId: 1, lessonId: 1, celebrity: "einstein" }, ownerId),
    post("/api/ai/generate-video", { courseId: 1, lessonId: 1, celebrity: "einstein" }, learnerBId),
  ]);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  const dataA = await resA.json();
  const dataB = await resB.json();
  assert.equal(dataA.cached, true);
  assert.equal(dataB.cached, true);
  assert.equal(completedVideo.userId, ownerId);
});
