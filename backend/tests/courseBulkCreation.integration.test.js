import { after, before, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { sequelize } = await import("../config/db.js");

const { Course, Module, Lesson } = await import(
  "../models/modelAssociations.js"
);

const { addModules, addLessons } = await import(
  "../controllers/courseController.js"
);

const createdCourseIds = [];

const createCourse = async (suffix) => {
  const course = await Course.create({
    title: `Bulk integration ${process.pid} ${Date.now()} ${suffix}`,
    category: "Testing",
    priceValue: 0,
  });

  createdCourseIds.push(course.id);
  return course;
};

const createResponse = () => ({
  statusCode: null,
  body: null,

  status(code) {
    this.statusCode = code;
    return this;
  },

  json(body) {
    this.body = body;
    return this;
  },
});

before(async () => {
  await sequelize.authenticate();

  // Creates missing tables without dropping existing tables.
  await sequelize.sync();
});

after(async () => {
  try {
    if (createdCourseIds.length > 0) {
      const modules = await Module.findAll({
        where: { courseId: createdCourseIds },
        attributes: ["id"],
      });

      const moduleIds = modules.map((module) => module.id);

      if (moduleIds.length > 0) {
        await Lesson.destroy({
          where: { moduleId: moduleIds },
        });
      }

      await Module.destroy({
        where: { courseId: createdCourseIds },
      });

      await Course.destroy({
        where: { id: createdCourseIds },
      });
    }
  } finally {
    await sequelize.close();
  }
});

test("addModules rolls back real database inserts when a later insert fails", async () => {
  const course = await createCourse("module-rollback");
  const originalCreate = Module.create;
  let calls = 0;

  Module.create = async function (values, options) {
    calls += 1;

    if (calls === 2) {
      throw new Error("Intentional integration test failure");
    }

    return originalCreate.call(this, values, options);
  };

  const res = createResponse();

  try {
    await addModules(
      {
        params: { courseId: course.id },
        body: {
          modules: [
            { title: "Rollback module A" },
            { title: "Rollback module B" },
          ],
        },
      },
      res,
    );
  } finally {
    Module.create = originalCreate;
  }

  assert.equal(calls, 2);
  assert.equal(res.statusCode, 500);

  const count = await Module.count({
    where: { courseId: course.id },
  });

  assert.equal(count, 0);
});

test("addLessons rolls back real database inserts when a later insert fails", async () => {
  const course = await createCourse("lesson-rollback");

  const module = await Module.create({
    courseId: course.id,
    title: "Rollback parent module",
    order: 1,
  });

  const originalCreate = Lesson.create;
  let calls = 0;

  Lesson.create = async function (values, options) {
    calls += 1;

    if (calls === 2) {
      throw new Error("Intentional integration test failure");
    }

    return originalCreate.call(this, values, options);
  };

  const res = createResponse();

  try {
    await addLessons(
      {
        params: {
          courseId: course.id,
          moduleId: module.id,
        },
        body: {
          lessons: [
            { title: "Rollback lesson A" },
            { title: "Rollback lesson B" },
          ],
        },
      },
      res,
    );
  } finally {
    Lesson.create = originalCreate;
  }

  assert.equal(calls, 2);
  assert.equal(res.statusCode, 500);

  const count = await Lesson.count({
    where: { moduleId: module.id },
  });

  assert.equal(count, 0);
});

test("concurrent module batches receive unique sequential order values", async () => {
  const course = await createCourse("concurrent-modules");

  const sendModuleBatch = (modules) => {
    const res = createResponse();

    return addModules(
      {
        params: { courseId: course.id },
        body: { modules },
      },
      res,
    ).then(() => res);
  };

  const [firstResponse, secondResponse] = await Promise.all([
    sendModuleBatch([
      { title: "Concurrent module A" },
      { title: "Concurrent module B" },
    ]),
    sendModuleBatch([
      { title: "Concurrent module C" },
      { title: "Concurrent module D" },
    ]),
  ]);

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 201);

  const modules = await Module.findAll({
    where: { courseId: course.id },
    order: [["order", "ASC"]],
  });

  assert.deepEqual(
    modules.map((module) => module.order),
    [1, 2, 3, 4],
  );
});

test("concurrent lesson batches receive unique sequential order values", async () => {
  const course = await createCourse("concurrent-lessons");

  const module = await Module.create({
    courseId: course.id,
    title: "Concurrent lesson parent",
    order: 1,
  });

  const sendLessonBatch = (lessons) => {
    const res = createResponse();

    return addLessons(
      {
        params: {
          courseId: course.id,
          moduleId: module.id,
        },
        body: { lessons },
      },
      res,
    ).then(() => res);
  };

  const [firstResponse, secondResponse] = await Promise.all([
    sendLessonBatch([
      { title: "Concurrent lesson A" },
      { title: "Concurrent lesson B" },
    ]),
    sendLessonBatch([
      { title: "Concurrent lesson C" },
      { title: "Concurrent lesson D" },
    ]),
  ]);

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 201);

  const lessons = await Lesson.findAll({
    where: { moduleId: module.id },
    order: [["order", "ASC"]],
  });

  assert.deepEqual(
    lessons.map((lesson) => lesson.order),
    [1, 2, 3, 4],
  );
});