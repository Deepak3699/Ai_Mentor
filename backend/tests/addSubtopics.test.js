import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { Course, Module, Lesson, LessonContent } = await import("../models/modelAssociations.js");
const { sequelize } = await import("../config/db.js");
const { addSubtopics } = await import("../controllers/courseController.js");
const { addSubtopicsSchema } = await import("../schemas/courseSchema.js");

const originals = {
  findCourse: Course.findByPk,
  findModule: Module.findOne,
  max: Lesson.max,
  createLesson: Lesson.create,
  createContent: LessonContent.create,
  transaction: sequelize.transaction,
  consoleError: console.error,
};

afterEach(() => {
  Course.findByPk = originals.findCourse;
  Module.findOne = originals.findModule;
  Lesson.max = originals.max;
  Lesson.create = originals.createLesson;
  LessonContent.create = originals.createContent;
  sequelize.transaction = originals.transaction;
  console.error = originals.consoleError;
});

const run = async (body) => {
  const req = { params: { courseId: "1" }, body };
  const result = { statusCode: 200, body: undefined };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
  };
  await addSubtopics(req, res);
  return result;
};

const validBody = {
  moduleId: 5,
  subtopics: [
    {
      title: "Intro",
      goal: "Learn basics",
      topics: ["Variables"],
      tools: ["VS Code"],
      activities: ["Practice"],
    },
    { title: "Loops", goal: "Repeat things" },
  ],
};

const stubHappyPath = () => {
  Course.findByPk = async () => ({ id: 1 });
  Module.findOne = async () => ({ id: 5, courseId: 1 });
  Lesson.max = async () => 2;
  sequelize.transaction = async (callback) => callback({});
};

test("creates all subtopics with content and continues lesson order", async () => {
  stubHappyPath();
  const lessons = [];
  const contents = [];
  let nextId = 100;
  Lesson.create = async (data) => {
    lessons.push(data);
    return { id: nextId++, ...data };
  };
  LessonContent.create = async (data) => {
    contents.push(data);
    return data;
  };

  const { statusCode, body } = await run(validBody);

  assert.equal(statusCode, 201);
  assert.equal(body.length, 2);
  assert.deepEqual(
    lessons.map((l) => l.order),
    [3, 4],
  );
  assert.equal(contents[0].introduction, "Learn basics");
  assert.deepEqual(contents[0].keyConcepts, {
    topics: ["Variables"],
    tools: ["VS Code"],
    activities: ["Practice"],
  });
  assert.deepEqual(contents[1].keyConcepts, { topics: [], tools: [], activities: [] });
});

test("missing course returns 404 and writes nothing", async () => {
  Course.findByPk = async () => null;
  let writes = 0;
  Lesson.create = async () => {
    writes += 1;
  };

  const { statusCode } = await run(validBody);

  assert.equal(statusCode, 404);
  assert.equal(writes, 0);
});

test("module from another course returns 404", async () => {
  Course.findByPk = async () => ({ id: 1 });
  Module.findOne = async () => null;

  const { statusCode, body } = await run(validBody);

  assert.equal(statusCode, 404);
  assert.equal(body.message, "Module not found for this course");
});

test("a failure mid-way fails the whole transaction with a safe 500", async () => {
  stubHappyPath();
  let calls = 0;
  Lesson.create = async (data) => {
    calls += 1;
    if (calls === 2) throw new Error("db down");
    return { id: calls, ...data };
  };
  LessonContent.create = async (data) => data;
  const logs = [];
  console.error = (...args) => logs.push(args);

  const { statusCode, body } = await run(validBody);

  assert.equal(statusCode, 500);
  assert.deepEqual(body, { message: "Failed to add subtopics" });
  assert.equal(JSON.stringify(logs).includes("db down"), false);
});

test("schema accepts a valid payload and applies list defaults", () => {
  const parsed = addSubtopicsSchema.parse({
    moduleId: "5",
    subtopics: [{ title: "Intro" }],
  });
  assert.equal(parsed.moduleId, 5);
  assert.deepEqual(parsed.subtopics[0].topics, []);
});

test("schema rejects invalid subtopic data", () => {
  for (const body of [
    { moduleId: 5, subtopics: [] },
    { moduleId: 5, subtopics: [{ title: "" }] },
    { subtopics: [{ title: "Intro" }] },
    { moduleId: 5, subtopics: ["Intro"] },
  ]) {
    assert.equal(addSubtopicsSchema.safeParse(body).success, false);
  }
});
