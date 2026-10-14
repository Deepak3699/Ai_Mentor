import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const associations = await import("../models/modelAssociations.js");
const { Course, Module, Lesson, LessonContent } = associations;
const { sequelize } = await import("../config/db.js");
const { addLessonsSchema } = await import("../schemas/courseSchema.js");
const validate = (await import("../middleware/validate.js")).default;
const {
  addCourse,
  addLessons,
  deleteCourse,
  getCourseById,
  getCourseLearningData,
  getCourses,
  getMyCourses,
  getStatsCards,
} = await import("../controllers/courseController.js");

const originals = {
  courseFindAndCountAll: Course.findAndCountAll,
  courseFindByPk: Course.findByPk,
  courseFindAll: Course.findAll,
  moduleFindOne: Module.findOne,
  courseCount: Course.count,
  courseCreate: Course.create,
  courseDestroy: Course.destroy,
  moduleFindAll: Module.findAll,
  lessonFindAll: Lesson.findAll,
  lessonMax: Lesson.max,
  lessonCreate: Lesson.create,
  transaction: sequelize.transaction,
};

const response = () => {
  const state = { statusCode: 200, body: undefined };
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
    },
  };
};

const course = (overrides = {}) => ({
  id: 1,
  title: "Testing Course",
  category: "Development",
  categoryColor: "blue",
  level: "Beginner",
  lessons: "2 lessons",
  lessonsCount: null,
  price: "₹499",
  priceValue: 499,
  currency: "INR",
  rating: 4.5,
  students: "10 students",
  studentsCount: 10,
  image: "/course.png",
  isBookmarked: false,
  status: "published",
  ...overrides,
});

beforeEach(() => {
  Course.findAndCountAll = async () => ({ rows: [], count: 0 });
  Course.findByPk = async () => null;
  Course.findAll = async () => [];
  Course.count = async () => 0;
  Course.create = async (data) => ({ id: 1, ...data });
  Course.destroy = async () => 0;
  Module.findAll = async () => [];
  Lesson.findAll = async () => [];
  Lesson.max = async () => 0;
  Lesson.create = async (data) => ({ id: 1, ...data });
});

after(() => {
  Course.findAndCountAll = originals.courseFindAndCountAll;
  Course.findByPk = originals.courseFindByPk;
  Course.findAll = originals.courseFindAll;
  Course.count = originals.courseCount;
  Course.create = originals.courseCreate;
  Course.destroy = originals.courseDestroy;
  Module.findAll = originals.moduleFindAll;
  Module.findOne = originals.moduleFindOne;
  Lesson.findAll = originals.lessonFindAll;
  Lesson.max = originals.lessonMax;
  Lesson.create = originals.lessonCreate;
  sequelize.transaction = originals.transaction;
});

test("getCourses sanitizes pagination and returns only formatted published courses", async () => {
  let query;
  Course.findAndCountAll = async (options) => {
    query = options;
    return { rows: [course()], count: 1 };
  };
  const { state, res } = response();
  await getCourses({ query: { page: "-4", limit: "0" } }, res);
  assert.deepEqual(query, {
    where: { status: "published" },
    order: [["createdAt", "ASC"]],
    limit: 10,
    offset: 0,
  });
  assert.equal(state.body.length, 1);
  assert.equal(state.body[0].lessonsCount, 2);
  assert.equal("status" in state.body[0], false);
});

test("getCourseById returns 404 for missing and 403 for unpublished courses", async () => {
  let outcome = response();
  await getCourseById({ params: { id: "99" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 404);
  assert.deepEqual(outcome.state.body, { message: "Course not found" });

  Course.findByPk = async () => course({ status: "disabled" });
  outcome = response();
  await getCourseById({ params: { id: "1" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 403);
});

test("getCourseById returns a formatted published course", async () => {
  Course.findByPk = async (id) => {
    assert.equal(id, "1");
    return course();
  };
  const { state, res } = response();
  await getCourseById({ params: { id: 1 } }, res);
  assert.equal(state.statusCode, 200);
  assert.equal(state.body.id, 1);
  assert.equal(state.body.lessonsCount, 2);
});

test("getMyCourses returns empty without purchases and queries only owned published IDs", async () => {
  let outcome = response();
  await getMyCourses({ user: { purchasedCourses: [] } }, outcome.res);
  assert.deepEqual(outcome.state.body, []);

  let query;
  Course.findAll = async (options) => {
    query = options;
    return [course({ id: "2" })];
  };
  outcome = response();
  await getMyCourses({ user: { purchasedCourses: [{ courseId: 2 }] } }, outcome.res);
  assert.deepEqual(query.where, { id: ["2"], status: "published" });
  assert.equal(outcome.state.body[0].id, "2");
  assert.equal("priceValue" in outcome.state.body[0], false);
});

test("learning data blocks missing, disabled, deleted, and unowned paid courses", async () => {
  let outcome = response();
  await getCourseLearningData(
    { params: { id: "1" }, user: { role: "user", purchasedCourses: [] } },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 404);

  for (const [status, expected] of [
    ["disabled", 403],
    ["deleted", 404],
  ]) {
    Course.findByPk = async () => course({ status });
    outcome = response();
    await getCourseLearningData(
      { params: { id: "1" }, user: { role: "user", purchasedCourses: [] } },
      outcome.res,
    );
    assert.equal(outcome.state.statusCode, expected);
  }

  Course.findByPk = async () => course({ priceValue: 499 });
  outcome = response();
  await getCourseLearningData(
    { params: { id: "1" }, user: { role: "user", purchasedCourses: [] } },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 403);
  assert.match(outcome.state.body.message, /purchase\/enroll/);
});

test("learning data permits an owner, admin, and free course", async () => {
  const scenarios = [
    { user: { role: "user", purchasedCourses: [{ courseId: 1 }] }, priceValue: 499 },
    { user: { role: "admin", purchasedCourses: [] }, priceValue: 499 },
    { user: { role: "user", purchasedCourses: [] }, priceValue: 1 },
  ];
  for (const scenario of scenarios) {
    Course.findByPk = async () => course({ priceValue: scenario.priceValue });
    Module.findAll = async () => [];
    const { state, res } = response();
    await getCourseLearningData({ params: { id: "1" }, user: scenario.user }, res);
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body.modules, []);
    assert.equal(state.body.currentLesson, null);
  }
});

test("learning data returns ordered modules, lessons, content, and first current lesson", async () => {
  Course.findByPk = async () => course();
  Module.findAll = async (options) => {
    assert.deepEqual(options.order, [
      ["order", "ASC"],
      ["createdAt", "ASC"],
    ]);
    Module.findOne = async () => ({ id: 10, courseId: 1 });
    return [{ id: 10, title: "Module One" }];
  };
  Lesson.findAll = async (options) => {
    assert.equal(options.where.moduleId, 10);
    assert.equal(options.include[0].model, LessonContent);
    return [
      {
        id: 20,
        title: "Lesson One",
        duration: "5 mins",
        type: "video",
        content: { introduction: "Intro", keyConcepts: ["A"] },
      },
    ];
  };
  const { state, res } = response();
  await getCourseLearningData(
    { params: { id: "1" }, user: { role: "user", purchasedCourses: [{ courseId: 1 }] } },
    res,
  );
  assert.equal(state.body.modules[0].lessons[0].content.introduction, "Intro");
  assert.equal(state.body.currentLesson.module, "Module One");
  assert.equal(state.body.currentLesson.id, 20);
});

test("getStatsCards returns the published course count", async () => {
  Course.count = async (options) => {
    assert.deepEqual(options, { where: { status: "published" } });
    return 7;
  };
  const { state, res } = response();
  await getStatsCards({}, res);
  assert.deepEqual(state.body, {
    totalCourses: 7,
    completedCourses: 0,
    hoursLearned: 0,
    certificates: 0,
  });
});

test("addCourse forces published status and deleteCourse handles missing and deleted courses", async () => {
  let created;
  Course.create = async (data) => {
    created = data;
    return { id: 5, ...data };
  };
  let outcome = response();
  await addCourse(
    { body: { title: "New", category: "Dev", priceValue: 20, status: "disabled" } },
    outcome.res,
  );
  assert.equal(outcome.state.statusCode, 201);
  assert.equal(created.status, "published");

  outcome = response();
  await deleteCourse({ params: { id: "5" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 404);

  Course.destroy = async ({ where }) => {
    assert.deepEqual(where, { id: "5" });
    return 1;
  };
  outcome = response();
  await deleteCourse({ params: { id: "5" } }, outcome.res);
  assert.deepEqual(outcome.state.body, { message: "Course deleted successfully" });
});

test("addLessons creates all lessons in one transaction", async () => {
  const pending = [];
  const saved = [];
  const transaction = { pending };
  let transactionCompleted = false;

  sequelize.transaction = async (work) => {
    const result = await work(transaction);
    saved.push(...pending);
    transactionCompleted = true;
    return result;
  };
  Lesson.max = async (field, options) => {
    assert.equal(field, "order");
    assert.equal(options.transaction, transaction);
    return 2;
  };
  Lesson.create = async (data, options) => {
    assert.equal(options.transaction, transaction);
    pending.push(data);
    return { id: pending.length, ...data };
  };

  const { state, res } = response();
  await addLessons(
    {
      params: { courseId: "1", moduleId: "10" },
      body: { lessons: [{ title: "Lesson One" }, { title: "Lesson Two", duration: "10 mins" }] },
    },
    res,
  );

  assert.equal(state.statusCode, 201);
  assert.equal(transactionCompleted, true);
  assert.equal(saved.length, 2);
  assert.deepEqual(
    state.body.map(({ order }) => order),
    [3, 4],
  );
  assert.equal(state.body[0].duration, "5 mins");
  assert.equal(state.body[1].duration, "10 mins");
});

test("addLessons rolls back earlier inserts when a later lesson fails", async () => {
  const pending = [];
  const saved = [];
  const transaction = { pending };
  let transactionRolledBack = false;
  let createCalls = 0;

  sequelize.transaction = async (work) => {
    try {
      const result = await work(transaction);
      saved.push(...pending);
      return result;
    } catch (error) {
      pending.length = 0;
      transactionRolledBack = true;
      throw error;
    }
  };
  Lesson.max = async () => 0;
  Lesson.create = async (data, options) => {
    assert.equal(options.transaction, transaction);
    createCalls += 1;
    if (createCalls === 3) throw new Error("Lesson creation failed");
    pending.push(data);
    return { id: createCalls, ...data };
  };

  const { state, res } = response();
  await addLessons(
    {
      params: { courseId: "1", moduleId: "10" },
      body: {
        lessons: [{ title: "Lesson One" }, { title: "Lesson Two" }, { title: "Lesson Three" }],
      },
    },
    res,
  );

  assert.equal(state.statusCode, 500);
  assert.deepEqual(state.body, { message: "Failed to add lessons" });
  assert.equal(transactionRolledBack, true);
  assert.deepEqual(saved, []);
  assert.equal(createCalls, 3);
});

test("addLessons rolls back when the order lookup fails", async () => {
  let transactionRolledBack = false;
  let createCalls = 0;
  sequelize.transaction = async (work) => {
    try {
      return await work({});
    } catch (error) {
      transactionRolledBack = true;
      throw error;
    }
  };
  Lesson.max = async () => {
    throw new Error("Order lookup failed");
  };
  Lesson.create = async () => {
    createCalls += 1;
    return {};
  };

  const { state, res } = response();
  await addLessons(
    {
      params: { courseId: "1", moduleId: "10" },
      body: { lessons: [{ title: "Lesson One" }] },
    },
    res,
  );

  assert.equal(state.statusCode, 500);
  assert.deepEqual(state.body, { message: "Failed to add lessons" });
  assert.equal(transactionRolledBack, true);
  assert.equal(createCalls, 0);
});

test("addLessons preserves the empty-list success behavior", async () => {
  const transaction = {};
  let transactionCompleted = false;
  let createCalls = 0;
  sequelize.transaction = async (work) => {
    const result = await work(transaction);
    transactionCompleted = true;
    return result;
  };
  Lesson.max = async (_field, options) => {
    assert.equal(options.transaction, transaction);
    return null;
  };
  Lesson.create = async () => {
    createCalls += 1;
    return {};
  };

  const { state, res } = response();
  await addLessons(
    {
      params: { courseId: "1", moduleId: "10" },
      body: { lessons: [] },
    },
    res,
  );

  assert.equal(state.statusCode, 201);
  assert.deepEqual(state.body, []);
  assert.equal(transactionCompleted, true);
  assert.equal(createCalls, 0);
});

test("addLessons route validation rejects invalid input before the controller runs", () => {
  const { state, res } = response();
  let nextCalled = false;
  const req = { body: { lessons: [{ id: "lesson-1", title: "" }] } };

  validate(addLessonsSchema)(req, res, () => {
    nextCalled = true;
  });

  assert.equal(state.statusCode, 400);
  assert.equal(state.body.message, "Validation failed");
  assert.equal(nextCalled, false);
});


test("addLessons accepts a module belonging to the requested course", async () => {
  const { res, state } = response();
  const created = [];

  Module.findOne = async (options) => {
    assert.deepEqual(options.where, { id: "10", courseId: "1" });
    return { id: 10, courseId: 1 };
  };
  Lesson.max = async () => 2;
  Lesson.create = async (data) => {
    created.push(data);
    return { id: created.length, ...data };
  };

  await addLessons(
    {
      params: { courseId: "1", moduleId: "10" },
      body: {
        lessons: [
          { title: "Lesson One" },
          { title: "Lesson Two" },
        ],
      },
    },
    res,
  );

  assert.equal(state.statusCode, 201);
  assert.equal(created.length, 2);
  assert.equal(created[0].order, 3);
  assert.equal(created[1].order, 4);
});

test("addLessons rejects a module belonging to another course", async () => {
  const { res, state } = response();
  let createCalled = false;
  let maxCalled = false;

  Module.findOne = async () => null;
  Lesson.max = async () => {
    maxCalled = true;
    return 0;
  };
  Lesson.create = async () => {
    createCalled = true;
    return {};
  };

  await addLessons(
    {
      params: { courseId: "1", moduleId: "10" },
      body: { lessons: [{ title: "Lesson One" }] },
    },
    res,
  );

  assert.equal(state.statusCode, 404);
  assert.equal(
    state.body.message,
    "Module not found for the specified course",
  );
  assert.equal(maxCalled, false);
  assert.equal(createCalled, false);
});
