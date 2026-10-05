import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { default: User } = await import("../models/User.js");
const { default: Preference } = await import("../models/Preference.js");
const { default: Course } = await import("../models/Course.js");
const { getChatContext, chatWithAssistant } = await import("../controllers/chatController.js");
const { getCertificates, generateCertificate } = await import("../controllers/certificateController.js");

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
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return this; },
      setHeader(name, value) { state.headers[name] = value; },
      send(body) { state.sent = body; return this; },
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
    return { id, name: "Learner", email: "learner@example.com", purchasedCourses: null, settings: null };
  };
  Preference.findOne = async ({ where }) => { preferenceWhere = where; return null; };
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
  User.findByPk = async () => { lookups += 1; };
  const { state, res } = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "   " } }, res);
  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.body, { message: "Message is required" });
  assert.equal(lookups, 0);
});

test("chat returns 404 when the authenticated user no longer exists", async () => {
  const { state, res } = response();
  await chatWithAssistant({ user: { id: "missing" }, body: { message: "Open settings" } }, res);
  assert.equal(state.statusCode, 404);
  assert.deepEqual(state.body, { message: "User not found" });
});

test("chat navigation intent returns a route without external AI", async () => {
  User.findByPk = async () => ({ id: "u", name: "Learner", purchasedCourses: [] });
  const { state, res } = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "Open settings" } }, res);
  assert.deepEqual(state.body, { reply: "You can open /settings", route: "/settings" });
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
  await chatWithAssistant({ user: { id: "u" }, body: { message: "What courses am I enrolled in?" } }, outcome.res);
  assert.match(outcome.state.body.reply, /1\. Node/);
  assert.match(outcome.state.body.reply, /2\. React/);
  outcome = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "Show my course progress" } }, outcome.res);
  assert.match(outcome.state.body.reply, /Total completed lessons: 3/);
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
  await chatWithAssistant({ user: { id: "u" }, body: { message: "Show my learning style" } }, outcome.res);
  assert.match(outcome.state.body.reply, /Learning Goal: Backend/);
  outcome = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "What is my current lesson?" } }, outcome.res);
  assert.match(outcome.state.body.reply, /lesson 4 in Node/);
  outcome = response();
  await chatWithAssistant({ user: { id: "u" }, body: { message: "Show my settings" } }, outcome.res);
  assert.match(outcome.state.body.reply, /Theme: dark/);
  assert.match(outcome.state.body.reply, /Language: hi/);
});

test("certificate list calculates completed and in-progress course statistics", async () => {
  Course.findByPk = async (id) => ({ id, title: `Course ${id}`, lessonsCount: id === 1 ? 2 : 3, image: null, category: "Development" });
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
  assert.deepEqual(state.body.stats, { totalEnrolled: 2, completed: 1, certificatesEarned: 1, inProgress: 1 });
  assert.equal(state.body.courses[0].isCompleted, true);
  assert.equal(state.body.courses[1].isCompleted, false);
});

test("certificate generation validates required course, ownership, name, and completion", async () => {
  let outcome = response();
  await generateCertificate({ user: { name: "Neeraj Kumar Saini", purchasedCourses: [] }, query: {} }, outcome.res);
  assert.equal(outcome.state.statusCode, 400);

  outcome = response();
  await generateCertificate({ user: { name: "Neeraj Kumar Saini", purchasedCourses: [] }, query: { courseId: "1" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 404);

  outcome = response();
  await generateCertificate({
    user: { name: "Neeraj Kumar Saini", purchasedCourses: [{ courseId: 1, progress: { completedLessons: [1] } }] },
    query: { courseId: "1", enteredName: "Completely Different Person" },
  }, outcome.res);
  assert.equal(outcome.state.statusCode, 400);

  Course.findByPk = async () => ({ lessonsCount: 2, title: "Node" });
  outcome = response();
  await generateCertificate({
    user: { name: "Neeraj Kumar Saini", purchasedCourses: [{ courseId: 1, progress: { completedLessons: [1] } }] },
    query: { courseId: "1" },
  }, outcome.res);
  assert.equal(outcome.state.statusCode, 403);
});

test("completed course generation returns a downloadable PDF", async () => {
  Course.findByPk = async () => ({ lessonsCount: 2, title: "Node" });
  const { state, res } = response();
  await generateCertificate({
    user: {
      name: "Neeraj Kumar Saini",
      purchasedCourses: [{ courseId: 1, courseTitle: "Node", progress: { completedLessons: [1, 2] } }],
    },
    query: { courseId: "1", enteredName: "Neeraj Kumar Saini" },
  }, res);
  assert.equal(state.headers["Content-Type"], "application/pdf");
  assert.equal(state.headers["Content-Disposition"], "attachment; filename=Certificate_1.pdf");
  assert.ok(Buffer.isBuffer(state.sent));
  assert.equal(state.sent.subarray(0, 5).toString("ascii"), "%PDF-");
});
