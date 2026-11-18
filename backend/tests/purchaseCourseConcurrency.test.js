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

// Minimal async mutex. It models the database serializing access to a row via
// SELECT ... FOR UPDATE: the first caller holds the lock until it releases it.
const createMutex = () => {
  let tail = Promise.resolve();
  return () => {
    let release;
    const acquired = new Promise((resolve) => {
      release = resolve;
    });
    const previous = tail;
    tail = previous.then(() => acquired);
    return previous.then(() => release);
  };
};

// In-memory user store backed by a row lock, so the test fails if the
// controller ever drops the transaction/lock and reads stale state.
const createFakeDatabase = () => {
  const lockUser = createMutex();
  let purchasedCourses = [];
  let writes = 0;

  const transaction = async () => {
    const heldLocks = [];
    return {
      finished: null,
      heldLocks,
      async commit() {
        this.finished = "commit";
        heldLocks.splice(0).forEach((release) => release());
      },
      async rollback() {
        this.finished = "rollback";
        heldLocks.splice(0).forEach((release) => release());
      },
    };
  };

  const makeUser = () => ({
    id: "user-1",
    purchasedCourses: [...purchasedCourses],
    changed() {},
    async save() {
      writes += 1;
      purchasedCourses = this.purchasedCourses.map((course) => ({ ...course }));
    },
  });

  const findByPk = async (id, options = {}) => {
    if (id !== "user-1") return null;

    // A plain read (e.g. auth middleware) does not take the row lock, so it can
    // observe stale state — modelling a read-modify-write without FOR UPDATE.
    if (!options.lock) {
      return makeUser();
    }

    const release = await lockUser();
    options.transaction.heldLocks.push(release);

    // Re-read after the lock is held so the caller sees committed writes.
    return makeUser();
  };

  return {
    transaction,
    findByPk,
    snapshot: () => purchasedCourses,
    writeCount: () => writes,
  };
};

let db;

beforeEach(() => {
  db = createFakeDatabase();

  User.findByPk = db.findByPk;
  Course.findByPk = async () => ({
    id: 1,
    title: "Concurrency Course",
    priceValue: 0,
    status: "published",
  });
  Payment.findOne = async () => null;
  Notification.create = async () => ({});
  sequelize.transaction = db.transaction;
});

after(() => {
  User.findByPk = originals.userFindByPk;
  Course.findByPk = originals.courseFindByPk;
  Payment.findOne = originals.paymentFindOne;
  Notification.create = originals.notificationCreate;
  sequelize.transaction = originals.transaction;
});

test("simultaneous enrollments create exactly one access record", async () => {
  const first = response();
  const second = response();

  await Promise.all([
    purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, first.res),
    purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, second.res),
  ]);

  const statuses = [first.state.statusCode, second.state.statusCode].sort();

  assert.deepEqual(statuses, [200, 409]);
  assert.equal(db.snapshot().length, 1);
  assert.equal(db.snapshot().filter((c) => c.courseId === 1).length, 1);
  assert.equal(db.writeCount(), 1);
});

test("simultaneous enrollments for a paid course also stay unique", async () => {
  Course.findByPk = async () => ({
    id: 1,
    title: "Paid Concurrency Course",
    priceValue: 499,
    status: "published",
  });
  Payment.findOne = async ({ where }) =>
    where.status === "success" ? { id: "payment-1", status: "success" } : null;

  const first = response();
  const second = response();

  await Promise.all([
    purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, first.res),
    purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, second.res),
  ]);

  const statuses = [first.state.statusCode, second.state.statusCode].sort();

  assert.deepEqual(statuses, [200, 409]);
  assert.equal(db.snapshot().length, 1);
  assert.equal(db.writeCount(), 1);
});

test("sequential enrollments remain idempotent", async () => {
  const first = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, first.res);
  assert.equal(first.state.statusCode, 200);

  const second = response();
  await purchaseCourse({ user: { id: "user-1" }, body: { courseId: 1 } }, second.res);

  assert.equal(second.state.statusCode, 409);
  assert.equal(second.state.body.error.message, "Already enrolled");
  assert.equal(second.state.body.error.code, "CONFLICT");
  assert.equal(db.snapshot().length, 1);
  assert.equal(db.writeCount(), 1);
});
