import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import { Course } from "../models/index.js";
import { createCourse, getAllCourses } from "../controllers/courseController.js";

const makeResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const makeRequest = (body = {}) => ({
  body,
  id: "test-request",
  query: {},
  method: "GET",
  originalUrl: "/api/admin/courses",
});

describe("admin course API", () => {
  beforeEach(() => {
    mock.method(Course, "findAll", async () => []);
    mock.method(Course, "create", async (values) => ({ id: 1, ...values }));
  });

  afterEach(() => mock.restoreAll());

  test("returns the fields required by the Courses page", async () => {
    const row = {
      id: 1,
      title: "React",
      category: "Web",
      categoryColor: "#14b8a6",
      lessons: "12",
      lessonsCount: 12,
      level: "Beginner",
      price: "499",
      priceValue: 499,
      currency: "INR",
      rating: 4.5,
      students: "150",
      studentsCount: 150,
      image: "/uploads/courses/react.png",
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    Course.findAll.mock.mockImplementation(async () => [row]);

    const res = makeResponse();
    await getAllCourses(makeRequest(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, data: [row] });

    const options = Course.findAll.mock.calls[0].arguments[0];
    for (const field of [
      "image",
      "level",
      "rating",
      "students",
      "studentsCount",
      "lessons",
      "lessonsCount",
    ]) {
      assert.ok(options.attributes.includes(field), `missing ${field} from admin course query`);
    }
  });

  test("rejects missing title, missing category and invalid prices", async () => {
    const cases = [
      [{ category: "Web" }, "Title is required"],
      [{ title: "React" }, "Category is required"],
      [{ title: "React", category: "Web", priceValue: -1 }, "non-negative number"],
      [{ title: "React", category: "Web", priceValue: Infinity }, "non-negative number"],
    ];

    for (const [body, message] of cases) {
      const res = makeResponse();
      await createCourse(makeRequest(body), res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, new RegExp(message));
    }

    assert.equal(Course.create.mock.calls.length, 0);
  });

  test("creates a course without accepting client-owned statistics", async () => {
    Course.create.mock.mockImplementation(async (values) => ({ id: 7, ...values }));

    const res = makeResponse();
    await createCourse(
      makeRequest({
        title: "  React  ",
        category: "  Web  ",
        level: "Beginner",
        price: "499",
        priceValue: "499",
        image: "/uploads/courses/react.png",
        rating: 5,
        students: "9999",
        studentsCount: 9999,
        lessons: "100",
        lessonsCount: 100,
        categoryColor: "#000000",
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    const values = Course.create.mock.calls[0].arguments[0];
    assert.deepEqual(values, {
      title: "React",
      category: "Web",
      level: "Beginner",
      price: "499",
      priceValue: 499,
      currency: "INR",
      image: "/uploads/courses/react.png",
      status: "published",
    });
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, 7);
  });
});
