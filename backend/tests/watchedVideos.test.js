import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";

const { default: User } = await import("../models/User.js");
const { getWatchedVideos } = await import("../controllers/userController.js");

const originalFindByPk = User.findByPk;

const buildLesson = (currentTime, overrides = {}) => ({
  watchHistory: {
    currentTime,
    duration: 7200,
    progressPercent: 50,
    status: "in-progress",
    ...overrides,
  },
});

const runHandler = async (purchasedCourses) => {
  User.findByPk = async () => ({ purchasedCourses });
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await getWatchedVideos({ user: { id: 1 } }, response);
  return response;
};

before(() => {
  User.findByPk = originalFindByPk;
});

after(() => {
  User.findByPk = originalFindByPk;
});

test("watched-video totalHours converts seconds to hours", async () => {
  const response = await runHandler([
    {
      courseId: 1,
      courseTitle: "Python for AI",
      progress: { lessonData: { lesson1: buildLesson(7200) } },
    },
  ]);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.metrics.totalHours, "2.0");
});

test("watched-video course options contain unique IDs and human-readable titles", async () => {
  const response = await runHandler([
    {
      courseId: 1,
      courseTitle: "Python for AI",
      progress: {
        lessonData: {
          lesson1: buildLesson(120),
          lesson2: buildLesson(180),
        },
      },
    },
    {
      courseId: 2,
      courseTitle: "Data Science",
      progress: { lessonData: { lesson3: buildLesson(60) } },
    },
  ]);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.courses, [
    { id: 1, title: "Python for AI" },
    { id: 2, title: "Data Science" },
  ]);
  assert.ok(response.body.videos.every((video) => typeof video.course === "string"));
});
