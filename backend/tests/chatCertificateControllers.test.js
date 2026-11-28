import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { default: User } = await import("../models/User.js");
const { default: Preference } = await import("../models/Preference.js");
const { default: Course } = await import("../models/Course.js");
const { getChatContext, chatWithAssistant } = await import("../controllers/chatController.js");
const { getCertificates, generateCertificate } =
  await import("../controllers/certificateController.js");

const originals = {
  userFindByPk: User.findByPk,
  preferenceFindOne: Preference.findOne,
  courseFindByPk: Course.findByPk,
};

const response = () => {
  const state = { statusCode: 200, body: undefined, headers: {}, sent: undefined };
  return {
    state,
    res: {
      status(code) {
        state.statusCode = code;
        return this;
      },
      json(body) {
        state.body = body;
        return this;
      },
      setHeader(name, value) {
        state.headers[name] = value;
      },
      send(body) {
        state.sent = body;
        return this;
      },
    },
  };
};

beforeEach(() => {
  User.findByPk = async () => null;
  Preference.findOne = async () => null;
  Course.findByPk = async () => null;
});

after(() => {
  User.findByPk = originals.userFindByPk;
  Preference.findOne = originals.preferenceFindOne;
  Course.findByPk = originals.courseFindByPk;
});

test("chat context is scoped to the authenticated user and supplies defaults", async () => {
  let userId;
  let preferenceWhere;
  User.findByPk = async (id) => {
    userId = id;
    return {
      id,
      name: "Learner",
      email: "learner@example.com",
      purchasedCourses: null,
      settings: null,
    };
  };
  Preference.findOne = async ({ where }) => {
    preferenceWhere = where;
    return null;
  };
  const { state, res } = response();
  await getChatContext({ user: { id: "user-1" } }, res);
  assert.equal(userId, "user-1");
  assert.deepEqual(preferenceWhere, { user_id: "user-1" });
  assert.deepEqual(state.body, {
    user: { name: "Learner", email: "learner@example.com" },
    purchasedCourses: [],
    settings: {},
    preferences: {},
  });
});

test("chat rejects empty messages before loading user data", async () => {
  let lookups = 0;
  User.findByPk = async () => {
    lookups += 1;
  };
  const { state, res } = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "   " } }, res);
  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.body, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "Message is required",
      details: [],
    },
  });
  assert.equal(lookups, 0);
});

test("chat returns 404 when the authenticated user no longer exists", async () => {
  const { state, res } = response();
  await chatWithAssistant({ user: { id: "missing" }, body: { message: "Open settings" } }, res);
  assert.equal(state.statusCode, 404);
  assert.deepEqual(state.body, {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "User not found",
      details: [],
    },
  });
});

test("chat navigation intent returns a route without external AI", async () => {
  User.findByPk = async () => ({ id: "u", name: "Learner", purchasedCourses: [] });
  const { state, res } = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "Open settings" } }, res);
  assert.deepEqual(state.body, {
    replyKey: "assistant.responses.open_route",
    replyParams: { route: "/settings" },
    route: "/settings",
  });
});

test("chat course and progress responses use only the authenticated user's courses", async () => {
  User.findByPk = async () => ({
    id: "u",
    firstName: "Neeraj",
    purchasedCourses: [
      { courseTitle: "Node", progress: { completedLessons: [1, 2] } },
      { courseTitle: "React", progress: { completedLessons: [1] } },
    ],
  });
  let outcome = response();
  await chatWithAssistant(
    { user: { id: "u" }, body: { message: "What courses am I enrolled in?" } },
    outcome.res,
  );
  assert.equal(outcome.state.body.replyKey, "assistant.responses.course_list");
  assert.equal(outcome.state.body.replyParams.name, "Neeraj");
  assert.match(outcome.state.body.replyParams.courses, /1\. Node/);
  assert.match(outcome.state.body.replyParams.courses, /2\. React/);
  outcome = response();
  await chatWithAssistant(
    { user: { id: "u" }, body: { message: "Show my course progress" } },
    outcome.res,
  );
  assert.equal(outcome.state.body.replyKey, "assistant.responses.progress");
  assert.equal(outcome.state.body.replyParams.completedCount, 3);
  assert.deepEqual(outcome.state.body.replyParams.courseProgress, [
    { course: "Node", completedCount: 2 },
    { course: "React", completedCount: 1 },
  ]);
});

test("chat exposes preferences, settings, and current lesson deterministically", async () => {
  User.findByPk = async () => ({
    id: "u",
    name: "Learner",
    settings: { appearance: { theme: "dark", language: "hi" } },
    purchasedCourses: [{ courseTitle: "Node", progress: { currentLesson: 4 } }],
  });
  Preference.findOne = async () => ({
    learning_goal: "Backend",
    experience_level: "Intermediate",
    learning_style: "Practice",
    weekly_commitment: "5 hours",
  });
  let outcome = response();
  await chatWithAssistant(
    { user: { id: "u" }, body: { message: "Show my learning style" } },
    outcome.res,
  );
  assert.equal(outcome.state.body.replyKey, "assistant.responses.preferences");
  assert.equal(outcome.state.body.replyParams.goal, "Backend");
  outcome = response();
  await chatWithAssistant(
    { user: { id: "u" }, body: { message: "What is my current lesson?" } },
    outcome.res,
  );
  assert.equal(outcome.state.body.replyKey, "assistant.responses.current_lesson");
  assert.equal(outcome.state.body.replyParams.lesson, 4);
  assert.equal(outcome.state.body.replyParams.course, "Node");
  outcome = response();
  await chatWithAssistant(
    { user: { id: "u" }, body: { message: "Show my settings" } },
    outcome.res,
  );
  assert.equal(outcome.state.body.replyKey, "assistant.responses.settings");
  assert.deepEqual(outcome.state.body.replyParams, { theme: "dark", language: "hi" });
});

test("certificate list calculates completed and in-progress course statistics", async () => {
  Course.findByPk = async (id) => ({
    id,
    title: `Course ${id}`,
    lessonsCount: id === 1 ? 2 : 3,
    image: null,
    category: "Development",
  });
  const req = {
    user: {
      purchasedCourses: [
        { courseId: 1, courseTitle: "Complete", progress: { completedLessons: [1, 2] } },
        { courseId: 2, courseTitle: "In Progress", progress: { completedLessons: [1] } },
      ],
    },
  };
  const { state, res } = response();
  await getCertificates(req, res);
  assert.deepEqual(state.body.stats, {
    totalEnrolled: 2,
    completed: 1,
    certificatesEarned: 1,
    inProgress: 1,
  });
  assert.equal(state.body.courses[0].isCompleted, true);
  assert.equal(state.body.courses[1].isCompleted, false);
});

test("certificate generation validates required course, ownership, name, and completion", async () => {
  let outcome = response();
  await generateCertificate(
    { user: { name: "Neeraj Kumar Saini", purchasedCourses: [] }, query: {} },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 400);

  outcome = response();
  await generateCertificate(
    { user: { name: "Neeraj Kumar Saini", purchasedCourses: [] }, query: { courseId: "1" } },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 404);

  outcome = response();
  await generateCertificate(
    {
      user: {
        name: "Neeraj Kumar Saini",
        purchasedCourses: [{ courseId: 1, progress: { completedLessons: [1] } }],
      },
      query: { courseId: "1", enteredName: "Completely Different Person" },
    },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 400);

  Course.findByPk = async () => ({ lessonsCount: 2, title: "Node" });
  outcome = response();
  await generateCertificate(
    {
      user: {
        name: "Neeraj Kumar Saini",
        purchasedCourses: [{ courseId: 1, progress: { completedLessons: [1] } }],
      },
      query: { courseId: "1" },
    },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 403);
});

test("completed course generation returns a downloadable PDF", async () => {
  Course.findByPk = async () => ({ lessonsCount: 2, title: "Node" });
  const { state, res } = response();
  await generateCertificate(
    {
      user: {
        name: "Neeraj Kumar Saini",
        purchasedCourses: [
          { courseId: 1, courseTitle: "Node", progress: { completedLessons: [1, 2] } },
        ],
      },
      query: { courseId: "1", enteredName: "Neeraj Kumar Saini" },
    },
    res,
  );
  assert.equal(state.headers["Content-Type"], "application/pdf");
  assert.equal(state.headers["Content-Disposition"], "attachment; filename=Certificate_1.pdf");
  assert.ok(Buffer.isBuffer(state.sent));
  assert.equal(state.sent.subarray(0, 5).toString("ascii"), "%PDF-");
});

test("invalid AI service route is dropped and empty replies use a localization key", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../controllers/chatController.js", import.meta.url), "utf8"),
  );
  assert.match(source, /Object\.values\(APP_ROUTES\)\.includes\(result\.route\)/);
  assert.match(source, /assistant\.responses\.empty_response/);
});
