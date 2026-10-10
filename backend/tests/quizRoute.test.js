import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai-service.test";

const { default: express } = await import("express");
const { default: Course } = await import("../models/Course.js");
const { default: User } = await import("../models/User.js");
const { default: Lesson } = await import("../models/Lesson.js");
const { default: LessonContent } = await import("../models/LessonContent.js");
const { default: QuizSession } = await import("../models/QuizSession.js");
const { mock } = await import("node:test");

mock.module("../queues/videoQueue.js", {
  exports: {
    videoQueue: {
      add: async () => ({ id: "mock-video-job" }),
    },
  },
});

const { default: aiRoutes } = await import("../routes/aiRoutes.js");

const USERS = {
  2: {
    id: 2,
    role: "user",
    purchasedCourses: [],
    set(key, value) { this[key] = value; },
    changed() {},
    async save() {},
  },
  1: {
    id: 1,
    role: "user",
    purchasedCourses: [
      {
        courseId: 1,
        progress: {
          quizHistory: [],
        },
      },
    ],
    set(key, value) {
      this[key] = value;
    },
    changed() {},
    async save() {},
  },
};

const QUIZ = {
  questions: [
    {
      question: "What is a variable?",
      options: ["A value", "A loop", "A function", "A class"],
      correct_index: 0,
      explanation: "A variable stores a value.",
      topic: "variables",
    },
    {
      question: "Which keyword defines a function?",
      options: ["def", "loop", "func", "define"],
      correct_index: 0,
      explanation: "Python uses def to define functions.",
      topic: "functions",
    },
    {
      question: "Which loop repeats over items?",
      options: ["for", "if", "try", "class"],
      correct_index: 0,
      explanation: "A for loop iterates over items.",
      topic: "loops",
    },
    {
      question: "What stores multiple values?",
      options: ["list", "int", "bool", "None"],
      correct_index: 0,
      explanation: "A list stores multiple values.",
      topic: "lists",
    },
  ],
};

const realFetch = globalThis.fetch;
const originals = {
  userFindByPk: User.findByPk,
  courseFindByPk: Course.findByPk,
  lessonFindByPk: Lesson.findByPk,
  sessionCreate: QuizSession.create,
  sessionFindOne: QuizSession.findOne,
  sessionUpdate: QuizSession.update,
};

let server;
let baseUrl;
let createdSession;
let lastSessionLookup;

before(async () => {
  User.findByPk = async (id) => USERS[id] ?? null;

  Course.findByPk = async () => ({
    id: 1,
    priceValue: 0,
    status: "published",
  });

  Lesson.findByPk = async () => ({
    id: 10,
    title: "Python Basics",
    content: {
      introduction: "Learn Python basics.",
      keyConcepts: ["variables", "functions", "loops"],
    },
  });

  LessonContent.findByPk = async () => null;

  QuizSession.create = async (data) => {
    createdSession = {
      id: "quiz-session-1",
      ...data,
      save: async function () {},
    };
    return createdSession;
  };

  QuizSession.findOne = async ({ where } = {}) => {
    lastSessionLookup = where;
    if (!createdSession || !where) return null;
    const matches =
      String(createdSession.id) === String(where.id) &&
      String(createdSession.userId) === String(where.userId) &&
      Number(createdSession.courseId) === Number(where.courseId) &&
      Number(createdSession.lessonId) === Number(where.lessonId) &&
      where.submittedAt === null &&
      createdSession.submittedAt === null;
    return matches ? createdSession : null;
  };

  QuizSession.update = async (values, options = {}) => {
    const where = options.where ?? {};
    const matches =
      createdSession !== null &&
      createdSession !== undefined &&
      String(createdSession.id) === String(where.id) &&
      String(createdSession.userId) === String(where.userId) &&
      Number(createdSession.courseId) === Number(where.courseId) &&
      Number(createdSession.lessonId) === Number(where.lessonId) &&
      createdSession.submittedAt === null;

    if (!matches) return [0];

    Object.assign(createdSession, values);
    createdSession.saved = true;
    return [1];
  };

  globalThis.fetch = async (url, options) => {
    if (String(url) === `${process.env.AI_SERVICE_URL}/generate-quiz`) {
      const body = JSON.parse(options.body);

      assert.equal(body.difficulty, "intermediate");
      assert.deepEqual(body.weak_topics, []);

      return new Response(JSON.stringify(QUIZ), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
  User.findByPk = originals.userFindByPk;
  Course.findByPk = originals.courseFindByPk;
  Lesson.findByPk = originals.lessonFindByPk;
  QuizSession.create = originals.sessionCreate;
  QuizSession.findOne = originals.sessionFindOne;
  QuizSession.update = originals.sessionUpdate;
  globalThis.fetch = realFetch;

  await new Promise((resolve) => server.close(resolve));
});

const authHeaders = (userId = 1) => ({
  Authorization: `Bearer ${jwt.sign(
    { id: userId },
    process.env.JWT_SECRET
  )}`,
  "Content-Type": "application/json",
});

test("generate-quiz requires authentication", async () => {
  const response = await realFetch(`${baseUrl}/api/ai/generate-quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
    }),
  });

  assert.equal(response.status, 401);
});

test("generate-quiz creates an adaptive quiz without exposing correct answers", async () => {
  USERS[1].purchasedCourses[0].progress.quizHistory = [];

  const response = await realFetch(`${baseUrl}/api/ai/generate-quiz`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
    }),
  });

  assert.equal(response.status, 200);

  const data = await response.json();

  assert.equal(data.quizSessionId, "quiz-session-1");
  assert.equal(data.lessonId, 10);
  assert.equal(data.difficulty, "intermediate");
  assert.equal(data.questions.length, 4);

  for (const question of data.questions) {
    assert.equal(question.options.length, 4);
    assert.equal("correct_index" in question, false);
    assert.equal("explanation" in question, false);
  }

  assert.equal(createdSession.difficulty, "intermediate");
  assert.equal(createdSession.questions.length, 4);
});

test("submit-quiz calculates score and records weak topics", async () => {
  createdSession = {
    id: "quiz-session-submit",
    userId: 1,
    courseId: 1,
    lessonId: 10,
    difficulty: "intermediate",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    submittedAt: null,
    questions: QUIZ.questions,
    save: async function () {
      this.saved = true;
    },
  };

  USERS[1].purchasedCourses[0].progress.quizHistory = [];

  const response = await realFetch(`${baseUrl}/api/ai/submit-quiz`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
      quizSessionId: "quiz-session-submit",
      answers: [0, 1, 2, 0],
    }),
  });

  assert.equal(response.status, 200);

  const data = await response.json();

  assert.equal(data.success, true);
  assert.equal(data.score, 50);
  assert.equal(data.correctAnswers, 2);
  assert.equal(data.totalQuestions, 4);
  assert.deepEqual(data.weakTopics, ["functions", "loops"]);
  assert.equal(createdSession.saved, true);

  const history =
    USERS[1].purchasedCourses[0].progress.quizHistory;

  assert.equal(history.length, 1);
  assert.equal(history[0].score, 50);
  assert.deepEqual(history[0].weakTopics, ["functions", "loops"]);
});

test("submit-quiz rejects an expired quiz session", async () => {
  createdSession = {
    id: "expired-session",
    userId: 1,
    courseId: 1,
    lessonId: 10,
    difficulty: "intermediate",
    expiresAt: new Date(Date.now() - 1000),
    submittedAt: null,
    questions: QUIZ.questions,
    save: async function () {},
  };

  const response = await realFetch(`${baseUrl}/api/ai/submit-quiz`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
      quizSessionId: "expired-session",
      answers: [0, 0, 0, 0],
    }),
  });

  assert.equal(response.status, 410);
});

test("submit-quiz rejects an already submitted session", async () => {
  createdSession = null;

  const response = await realFetch(`${baseUrl}/api/ai/submit-quiz`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
      quizSessionId: "already-submitted",
      answers: [0, 0, 0, 0],
    }),
  });

  assert.equal(response.status, 404);
});


test("submit-quiz scopes session lookup to owner, course, lesson, and unused status", async () => {
  createdSession = {
    id: "ownership-session",
    userId: 1,
    courseId: 1,
    lessonId: 10,
    difficulty: "intermediate",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    submittedAt: null,
    questions: QUIZ.questions,
  };

  const response = await realFetch(`${baseUrl}/api/ai/submit-quiz`, {
    method: "POST",
    headers: authHeaders(2),
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
      quizSessionId: "ownership-session",
      answers: [0, 0, 0, 0],
    }),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(lastSessionLookup, {
    id: "ownership-session",
    userId: 2,
    courseId: 1,
    lessonId: 10,
    submittedAt: null,
  });
  assert.equal(createdSession.submittedAt, null);
});

test("submit-quiz prevents concurrent submissions of the same session", async () => {
  createdSession = {
    id: "concurrent-session",
    userId: 1,
    courseId: 1,
    lessonId: 10,
    difficulty: "intermediate",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    submittedAt: null,
    questions: QUIZ.questions,
  };
  USERS[1].purchasedCourses[0].progress.quizHistory = [];

  const submit = () => realFetch(`${baseUrl}/api/ai/submit-quiz`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      courseId: 1,
      lessonId: 10,
      quizSessionId: "concurrent-session",
      answers: [0, 1, 2, 0],
    }),
  });

  const responses = await Promise.all([submit(), submit()]);
  const statuses = responses.map((response) => response.status).sort();

  assert.deepEqual(statuses, [200, 404]);
  assert.ok(createdSession.submittedAt instanceof Date);
  assert.equal(
    USERS[1].purchasedCourses[0].progress.quizHistory.length,
    1
  );
});
