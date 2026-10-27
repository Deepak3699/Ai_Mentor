import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "ai-auth-test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";

const { default: express } = await import("express");
const { default: AIVideo } = await import("../models/AIVideo.js");
const { default: User } = await import("../models/User.js");
const { default: Course } = await import("../models/Course.js");
const { default: Module } = await import("../models/Module.js");
const { default: Lesson } = await import("../models/Lesson.js");
const { default: aiRoutes } = await import("../routes/aiRoutes.js");
const { getCourseAndLessonTitles } = await import("../controllers/courseController.js");

const VIDEOS = [
  {
    id: "video-100",
    courseId: 1,
    lessonId: 10,
    jobId: "job-100",
    status: "completed",
    videoUrl: "https://res.cloudinary.com/test/video.mp4",
    transcriptName: "transcript-100.json",
    transcript: "Hello world transcript",
  },
];

const USERS = {
  1: { id: 1, role: "user", purchasedCourses: [{ courseId: 1 }] },
  2: { id: 2, role: "user", purchasedCourses: [{ courseId: 2 }] },
  3: { id: 3, role: "admin", purchasedCourses: [] },
};

const originals = {
  aivideoFindOne: AIVideo.findOne,
  userFindByPk: User.findByPk,
  courseFindByPk: Course.findByPk,
  moduleFindOne: Module.findOne,
  lessonFindByPk: Lesson.findByPk,
};

let server;
let baseUrl;
let originalLog;
let originalErr;

before(async () => {
  originalLog = console.log;
  originalErr = console.error;
  console.log = () => {};
  console.error = () => {};

  AIVideo.findOne = async ({ where }) => {
    if (where.transcriptName) {
      return VIDEOS.find((v) => v.transcriptName === where.transcriptName) || null;
    }
    if (where.id) {
      return VIDEOS.find((v) => String(v.id) === String(where.id)) || null;
    }
    return null;
  };

  User.findByPk = async (id) => USERS[id] || null;

  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  console.log = originalLog;
  console.error = originalErr;
  AIVideo.findOne = originals.aivideoFindOne;
  User.findByPk = originals.userFindByPk;
  Course.findByPk = originals.courseFindByPk;
  Module.findOne = originals.moduleFindOne;
  Lesson.findByPk = originals.lessonFindByPk;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

const req = (path, userId) =>
  fetch(`${baseUrl}${path}`, {
    headers: {
      Connection: "close",
      ...(userId
        ? { Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}` }
        : {}),
    },
  });

test("transcript endpoint requires authentication", async () => {
  const res = await req("/api/ai/transcript/transcript-100.json");
  assert.equal(res.status, 401);
});

test("transcript endpoint forbids non-enrolled user", async () => {
  const res = await req("/api/ai/transcript/transcript-100.json", 2);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.deepEqual(data, {
    success: false,
    error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
  });
});

test("transcript endpoint permits enrolled user and admin", async () => {
  const resEnrolled = await req("/api/ai/transcript/transcript-100.json", 1);
  assert.equal(resEnrolled.status, 200);
  const data = await resEnrolled.json();
  assert.equal(data.content, "Hello world transcript");

  const resAdmin = await req("/api/ai/transcript/transcript-100.json", 3);
  assert.equal(resAdmin.status, 200);
});

test("status endpoint forbids non-enrolled user", async () => {
  const res = await req("/api/ai/status/video-100", 2);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.deepEqual(data, {
    success: false,
    error: { code: "FORBIDDEN", message: "Course not purchased", details: [] },
  });
});

test("status endpoint permits enrolled user and returns ready status", async () => {
  const res = await req("/api/ai/status/video-100", 1);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ready");
  assert.equal(data.cloudinary_url, "https://res.cloudinary.com/test/video.mp4");
});

test("getCourseAndLessonTitles rejects cross-course lesson", async () => {
  Course.findByPk = async (id) => ({ id: Number(id), title: "Course 1" });
  Lesson.findByPk = async (id) => ({ id: Number(id), moduleId: 99, title: "Lesson 5" });
  Module.findOne = async () => null; // Module 99 does not belong to Course 1

  const result = await getCourseAndLessonTitles(1, 5);
  assert.equal(result, null);
});

test("getCourseAndLessonTitles accepts valid lesson belonging to course", async () => {
  Course.findByPk = async (id) => ({ id: Number(id), title: "Course 1" });
  Lesson.findByPk = async (id) => ({ id: Number(id), moduleId: 10, title: "Lesson 5" });
  Module.findOne = async () => ({ id: 10, courseId: 1 });

  const result = await getCourseAndLessonTitles(1, 5);
  assert.deepEqual(result, {
    courseTitle: "Course 1",
    lessonTitle: "Lesson 5",
  });
});
