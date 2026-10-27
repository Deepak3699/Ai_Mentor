import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";

const { default: User } = await import("../models/User.js");
const { default: Course } = await import("../models/Course.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Notification } = await import("../models/Notification.js");
const { sequelize } = await import("../config/db.js");
const { purchaseCourse } = await import("../controllers/userController.js");

const originals = {
  userFindByPk: User.findByPk,
  courseFindByPk: Course.findByPk,
  paymentFindOne: Payment.findOne,
  notificationCreate: Notification.create,
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

const makeTransaction = () => ({
  finished: null,
  async commit() {
    this.finished = "commit";
  },
  async rollback() {
    this.finished = "rollback";
  },
});

const makeUser = (overrides = {}) => ({
  id: "user-1",
  purchasedCourses: [],
  saves: 0,
  changedFields: [],
  async save() {
    this.saves += 1;
  },
  changed(field, value) {
    this.changedFields.push([field, value]);
  },
  ...overrides,
});

const makeCourse = (overrides = {}) => ({
  id: 1,
  title: "Authoritative Course Title",
  price: "₹499",
  priceValue: 499,
  status: "published",
  ...overrides,
});

let lastTransaction;

beforeEach(() => {
  User.findByPk = async () => null;
  Course.findByPk = async () => null;
  Payment.findOne = async () => null;
  Notification.create = async () => ({});
  lastTransaction = makeTransaction();
  sequelize.transaction = async () => lastTransaction;
});

after(() => {
  User.findByPk = originals.userFindByPk;
  Course.findByPk = originals.courseFindByPk;
  Payment.findOne = originals.paymentFindOne;
  Notification.create = originals.notificationCreate;
  sequelize.transaction = originals.transaction;
});

test("rejects requests without an authenticated user", async () => {
  const { state, res } = response();
  await purchaseCourse({ body: { courseId: 1 } }, res);
  assert.equal(state.statusCode, 401);
  assert.equal(state.body.error.message, "Not authorized");
  assert.equal(state.body.error.code, "UNAUTHORIZED");
});

test("rejects a missing or non-numeric course id without hitting the database", async () => {
  let courseLookups = 0;
  Course.findByPk = async () => {
    courseLookups += 1;
    return null;
  };

  for (const courseId of [undefined, null, "", "abc", "1.5"]) {
    const { state, res } = response();
    await purchaseCourse({ user: { id: "user-1" }, body: { courseId } }, res);
    assert.equal(state.statusCode, 400);
    assert.equal(state.body.error.message, "Course ID is required");
    assert.equal(state.body.error.code, "BAD_REQUEST");
  }

  assert.equal(courseLookups, 0);
});

test("returns 404 when the course does not exist", async () => {
  User.findByPk = async () => makeUser();
  Course.findByPk = async () => null;

  const { state, res } = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: 99 } }, res);

  assert.equal(state.statusCode, 404);
  assert.equal(state.body.error.message, "Course not found");
  assert.equal(state.body.error.code, "NOT_FOUND");
});

test("treats a deleted course as not found and blocks a disabled course", async () => {
  User.findByPk = async () => makeUser();

  Course.findByPk = async () => makeCourse({ status: "deleted" });
  let outcome = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, outcome.res);
  assert.equal(outcome.state.statusCode, 404);

  Course.findByPk = async () => makeCourse({ status: "disabled" });
  ({ state: outcome.state, res: outcome.res } = response());
  const disabled = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, disabled.res);
  assert.equal(disabled.state.statusCode, 403);
});

test("enrolls in a free course using the authoritative database title", async () => {
  const user = makeUser();
  User.findByPk = async () => user;
  Course.findByPk = async () => makeCourse({ priceValue: 0, title: "Free Course" });

  const { state, res } = response();
  await purchaseCourse(
    { user: { id: "user-1" }, body: { courseId: "1", courseTitle: "Spoofed Title" } },
    res,
  );

  assert.equal(state.statusCode, 200);
  assert.equal(user.purchasedCourses.length, 1);
  assert.equal(user.purchasedCourses[0].courseId, 1);
  assert.equal(user.purchasedCourses[0].courseTitle, "Free Course");
  assert.equal(user.saves, 1);
  assert.deepEqual(user.changedFields, [["purchasedCourses", true]]);
  assert.equal(lastTransaction.finished, "commit");
});

test("locks the user row inside a transaction before enrolling", async () => {
  const user = makeUser();
  let lookupOptions;
  User.findByPk = async (_id, options) => {
    lookupOptions = options;
    return user;
  };
  Course.findByPk = async () => makeCourse({ priceValue: 0 });

  const { res } = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, res);

  assert.equal(lookupOptions.transaction, lastTransaction);
  assert.ok(lookupOptions.lock, "the user row must be locked");
});

test("blocks a paid course when no successful payment exists", async () => {
  const user = makeUser();
  User.findByPk = async () => user;
  Course.findByPk = async () => makeCourse({ priceValue: 499 });

  let paymentQuery;
  Payment.findOne = async (query) => {
    paymentQuery = query;
    return null;
  };

  const { state, res } = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: "1" } }, res);

  assert.equal(state.statusCode, 403);
  assert.match(state.body.error.message, /Payment required/i);
  assert.equal(state.body.error.code, "FORBIDDEN");
  assert.deepEqual(user.purchasedCourses, []);
  assert.equal(user.saves, 0);
  assert.equal(lastTransaction.finished, "rollback");
  assert.deepEqual(paymentQuery.where, {
    userId: "user-1",
    courseId: 1,
    status: "success",
  });
  assert.equal(paymentQuery.transaction, lastTransaction);
});

test("enrolls in a paid course once a successful payment exists", async () => {
  const user = makeUser();
  User.findByPk = async () => user;
  Course.findByPk = async () => makeCourse({ priceValue: 499, title: "Paid Course" });
  Payment.findOne = async () => ({ id: "payment-1", status: "success" });

  const { state, res } = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: "1" } }, res);

  assert.equal(state.statusCode, 200);
  assert.equal(user.purchasedCourses.length, 1);
  assert.equal(user.purchasedCourses[0].courseTitle, "Paid Course");
  assert.equal(user.saves, 1);
  assert.equal(lastTransaction.finished, "commit");
});

test("rejects duplicate enrollment without saving again", async () => {
  const user = makeUser({ purchasedCourses: [{ courseId: 1, courseTitle: "Free Course" }] });
  User.findByPk = async () => user;
  Course.findByPk = async () => makeCourse({ priceValue: 499 });

  const { state, res } = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: "1" } }, res);

  assert.equal(state.statusCode, 409);
  assert.equal(state.body.error.message, "Already enrolled");
  assert.equal(state.body.error.code, "CONFLICT");
  assert.equal(user.purchasedCourses.length, 1);
  assert.equal(user.saves, 0);
  assert.equal(lastTransaction.finished, "rollback");
});

test("returns 404 when the authenticated user no longer exists", async () => {
  Course.findByPk = async () => makeCourse({ priceValue: 0 });
  User.findByPk = async () => null;

  const { state, res } = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: "1" } }, res);

  assert.equal(state.statusCode, 404);
  assert.equal(state.body.error.message, "User not found");
  assert.equal(state.body.error.code, "NOT_FOUND");
});
