import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { errorHandler, notFoundMiddleware } from "../middleware/errorMiddleware.js";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { default: User } = await import("../models/User.js");
const { default: Course } = await import("../models/Course.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Notification } = await import("../models/Notification.js");
const { sequelize } = await import("../config/db.js");
const { default: userRoutes } = await import("../routes/userRoutes.js");

const USER_ID = "11111111-1111-1111-1111-111111111111";

const originals = {
  userFindByPk: User.findByPk,
  courseFindByPk: Course.findByPk,
  paymentFindOne: Payment.findOne,
  notificationCreate: Notification.create,
  transaction: sequelize.transaction,
};

let server;
let baseUrl;

const makeTransaction = () => ({
  finished: null,
  async commit() {
    this.finished = "commit";
  },
  async rollback() {
    this.finished = "rollback";
  },
});

let currentUser;
let currentCourse;
let payments;

const paymentMatches = (payment, where) =>
  Object.entries(where).every(([key, value]) => payment[key] === value);

before(async () => {
  Notification.create = async (data) => ({ id: "notification-1", ...data });
  sequelize.transaction = async () => makeTransaction();

  User.findByPk = async (id) => {
    if (!currentUser || String(id) !== String(currentUser.id)) return null;
    return currentUser;
  };

  Course.findByPk = async () => currentCourse;

  Payment.findOne = async ({ where }) => payments.find((p) => paymentMatches(p, where)) ?? null;

  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findByPk = originals.userFindByPk;
  Course.findByPk = originals.courseFindByPk;
  Payment.findOne = originals.paymentFindOne;
  Notification.create = originals.notificationCreate;
  sequelize.transaction = originals.transaction;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setImmediate(resolve));
});

const tokenFor = (id = USER_ID) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });

const postPurchase = (body, token) =>
  fetch(`${baseUrl}/api/users/purchase-course`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  currentUser = {
    id: USER_ID,
    purchasedCourses: [],
    saves: 0,
    async save() {
      this.saves += 1;
    },
    changed() {},
  };
  currentCourse = {
    id: 1,
    title: "Database Title",
    priceValue: 0,
    status: "published",
  };
  payments = [];
});

test("the protected route rejects unauthenticated requests", async () => {
  const res = await postPurchase({ courseId: 1 });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error.message, /Not authorized/i);
});

test("the Zod validation middleware rejects a request without a course id", async () => {
  const res = await postPurchase({}, tokenFor());
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.message, "Validation failed");
  assert.ok(Array.isArray(body.error.details));
});

test("the Zod validation middleware rejects a blank course id", async () => {
  const res = await postPurchase({ courseId: "" }, tokenFor());
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.message, "Validation failed");
  assert.ok(Array.isArray(body.error.details));
  assert.match(body.error.details[0].message, /Course ID is required|positive integer/i);
});

test("authenticated user enrolls in a free course through the real route", async () => {
  const res = await postPurchase({ courseId: 1, courseTitle: "Spoofed Client Title" }, tokenFor());

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.message, "Course enrolled successfully");
  assert.equal(body.purchasedCourses.length, 1);
  assert.equal(body.purchasedCourses[0].courseTitle, "Database Title");
  assert.equal(currentUser.saves, 1);
});

test("authenticated user cannot enroll in a paid course without a successful payment", async () => {
  currentCourse.priceValue = 499;

  const res = await postPurchase({ courseId: 1 }, tokenFor());

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.match(body.error.message, /Payment required/i);
  assert.equal(currentUser.purchasedCourses.length, 0);
  assert.equal(currentUser.saves, 0);
});

test("a processing payment does not authorize enrollment", async () => {
  currentCourse.priceValue = 499;
  payments = [
    {
      userId: USER_ID,
      courseId: 1,
      status: "processing",
      gateway: "razorpay",
      razorpayOrderId: "order_processing",
    },
  ];

  const res = await postPurchase({ courseId: 1 }, tokenFor());
  assert.equal(res.status, 403);
  assert.equal(currentUser.saves, 0);
});

test("a Stripe successful payment record authorizes enrollment", async () => {
  currentCourse.priceValue = 499;
  payments = [
    {
      userId: USER_ID,
      courseId: 1,
      status: "success",
      gateway: "stripe",
      stripeSessionId: "cs_test_123",
      stripePaymentIntentId: "pi_test_123",
    },
  ];

  const res = await postPurchase({ courseId: 1 }, tokenFor());

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.purchasedCourses.length, 1);
  assert.equal(currentUser.saves, 1);
});

test("a Razorpay successful payment record authorizes enrollment", async () => {
  currentCourse.priceValue = 499;
  payments = [
    {
      userId: USER_ID,
      courseId: 1,
      status: "success",
      gateway: "razorpay",
      razorpayOrderId: "order_test_123",
      razorpayPaymentId: "pay_test_123",
    },
  ];

  const res = await postPurchase({ courseId: 1 }, tokenFor());

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.purchasedCourses.length, 1);
  assert.equal(currentUser.saves, 1);
});

test("a successful payment for a different user does not authorize enrollment", async () => {
  currentCourse.priceValue = 499;
  payments = [
    {
      userId: "22222222-2222-2222-2222-222222222222",
      courseId: 1,
      status: "success",
      gateway: "stripe",
    },
  ];

  const res = await postPurchase({ courseId: 1 }, tokenFor());
  assert.equal(res.status, 403);
});

test("a successful payment for a different course does not authorize enrollment", async () => {
  currentCourse.priceValue = 499;
  payments = [{ userId: USER_ID, courseId: 2, status: "success", gateway: "stripe" }];

  const res = await postPurchase({ courseId: 1 }, tokenFor());
  assert.equal(res.status, 403);
});

test("the route rejects duplicate enrollment", async () => {
  currentUser.purchasedCourses = [{ courseId: 1, courseTitle: "Database Title" }];

  const res = await postPurchase({ courseId: 1 }, tokenFor());

  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error.message, "Already enrolled");
  assert.equal(body.error.code, "CONFLICT");
  assert.equal(currentUser.purchasedCourses.length, 1);
  assert.equal(currentUser.saves, 0);
});
