import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const associations = await import("../models/modelAssociations.js");
const { Course, Module, Lesson, LessonContent } = associations;
const {
  addCourse,
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
  courseCount: Course.count,
  courseCreate: Course.create,
  courseDestroy: Course.destroy,
  moduleFindAll: Module.findAll,
  lessonFindAll: Lesson.findAll,
};

const response = () => {
  const state = { statusCode: 200, body: undefined };
  return {
    state,
    res: {
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return this; },
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
});

after(() => {
  Course.findAndCountAll = originals.courseFindAndCountAll;
  Course.findByPk = originals.courseFindByPk;
  Course.findAll = originals.courseFindAll;
  Course.count = originals.courseCount;
  Course.create = originals.courseCreate;
  Course.destroy = originals.courseDestroy;
  Module.findAll = originals.moduleFindAll;
  Lesson.findAll = originals.lessonFindAll;
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
  Course.findByPk = async (id) => { assert.equal(id, "1"); return course(); };
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
  Course.findAll = async (options) => { query = options; return [course({ id: "2" })]; };
  outcome = response();
  await getMyCourses({ user: { purchasedCourses: [{ courseId: 2 }] } }, outcome.res);
  assert.deepEqual(query.where, { id: ["2"], status: "published" });
  assert.equal(outcome.state.body[0].id, "2");
  assert.equal("priceValue" in outcome.state.body[0], false);
});

test("learning data blocks missing, disabled, deleted, and unowned paid courses", async () => {
  let outcome = response();
  await getCourseLearningData({ params: { id: "1" }, user: { role: "user", purchasedCourses: [] } }, outcome.res);
  assert.equal(outcome.state.statusCode, 404);

  for (const [status, expected] of [["disabled", 403], ["deleted", 404]]) {
    Course.findByPk = async () => course({ status });
    outcome = response();
    await getCourseLearningData({ params: { id: "1" }, user: { role: "user", purchasedCourses: [] } }, outcome.res);
    assert.equal(outcome.state.statusCode, expected);
  }

  Course.findByPk = async () => course({ priceValue: 499 });
  outcome = response();
  await getCourseLearningData({ params: { id: "1" }, user: { role: "user", purchasedCourses: [] } }, outcome.res);
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
    assert.deepEqual(options.order, [["order", "ASC"], ["createdAt", "ASC"]]);
    return [{ id: 10, title: "Module One" }];
  };
  Lesson.findAll = async (options) => {
    assert.equal(options.where.moduleId, 10);
    assert.equal(options.include[0].model, LessonContent);
    return [{ id: 20, title: "Lesson One", duration: "5 mins", type: "video", content: { introduction: "Intro", keyConcepts: ["A"] } }];
  };
  const { state, res } = response();
  await getCourseLearningData({ params: { id: "1" }, user: { role: "user", purchasedCourses: [{ courseId: 1 }] } }, res);
  assert.equal(state.body.modules[0].lessons[0].content.introduction, "Intro");
  assert.equal(state.body.currentLesson.module, "Module One");
  assert.equal(state.body.currentLesson.id, 20);
});

test("getStatsCards returns the published course count", async () => {
  Course.count = async (options) => { assert.deepEqual(options, { where: { status: "published" } }); return 7; };
  const { state, res } = response();
  await getStatsCards({}, res);
  assert.deepEqual(state.body, { totalCourses: 7, completedCourses: 0, hoursLearned: 0, certificates: 0 });
});

test("addCourse forces published status and deleteCourse handles missing and deleted courses", async () => {
  let created;
  Course.create = async (data) => { created = data; return { id: 5, ...data }; };
  let outcome = response();
  await addCourse({ body: { title: "New", category: "Dev", priceValue: 20, status: "disabled" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 201);
  assert.equal(created.status, "published");

  outcome = response();
  await deleteCourse({ params: { id: "5" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 404);

  Course.destroy = async ({ where }) => { assert.deepEqual(where, { id: "5" }); return 1; };
  outcome = response();
  await deleteCourse({ params: { id: "5" } }, outcome.res);
  assert.deepEqual(outcome.state.body, { message: "Course deleted successfully" });
});
