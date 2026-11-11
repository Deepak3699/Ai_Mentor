import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "payment-route-test-secret";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.FRONTEND_URL = "http://frontend.test";
process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET = "razorpay-test-secret";

const { default: express } = await import("express");
const { default: User } = await import("../models/User.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: Course } = await import("../models/Course.js");
const { default: Notification } = await import("../models/Notification.js");
const { sequelize } = await import("../config/db.js");
const { paymentGatewayServices } = await import("../services/paymentGatewayServices.js");
const { default: paymentRoutes } = await import("../routes/payment.js");
const { default: razorpayRoutes } = await import("../routes/razorpay.js");

const originals = {
  userFindByPk: User.findByPk,
  paymentFindOne: Payment.findOne,
  paymentFindByPk: Payment.findByPk,
  paymentCreate: Payment.create,
  courseFindByPk: Course.findByPk,
  createStripeCheckoutSession: paymentGatewayServices.createStripeCheckoutSession,
  createRazorpayOrder: paymentGatewayServices.createRazorpayOrder,
  notificationCreate: Notification.create,
  transaction: sequelize.transaction,
};

let server;
let baseUrl;

// Payment ids are UUIDs, and the status route rejects anything else.
const PAYMENT_UUID = crypto.randomUUID();

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/payment", paymentRoutes);
  app.use("/api/payment/razorpay", razorpayRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  User.findByPk = async (id) => ({ id, isBlocked: false, passwordChangedAt: null });
  Course.findByPk = async (id) => {
    const numId = Number(id);
    if (numId === 9) {
      return {
        id: 9,
        title: "Razorpay Course",
        priceValue: 250,
        currency: "INR",
        status: "published",
      };
    }
    return {
      id: numId,
      title: "Secure Course",
      priceValue: 499,
      currency: "inr",
      status: "published",
    };
  };
  Payment.findOne = async () => null;
  Payment.findByPk = async () => null;
  Payment.create = async () => {
    throw new Error("unexpected Payment.create");
  };
  paymentGatewayServices.createStripeCheckoutSession = async () => {
    throw new Error("unexpected Stripe call");
  };
  paymentGatewayServices.createRazorpayOrder = async () => {
    throw new Error("unexpected Razorpay call");
  };
  Notification.create = async (data) => ({ id: "notification", ...data });
  sequelize.transaction = async () => ({
    finished: undefined,
    async commit() {
      this.finished = "commit";
    },
    async rollback() {
      this.finished = "rollback";
    },
  });
});

after(async () => {
  User.findByPk = originals.userFindByPk;
  Payment.findOne = originals.paymentFindOne;
  Payment.findByPk = originals.paymentFindByPk;
  Payment.create = originals.paymentCreate;
  Course.findByPk = originals.courseFindByPk;
  paymentGatewayServices.createStripeCheckoutSession = originals.createStripeCheckoutSession;
  paymentGatewayServices.createRazorpayOrder = originals.createRazorpayOrder;
  Notification.create = originals.notificationCreate;
  sequelize.transaction = originals.transaction;
  await new Promise((resolve) => server.close(resolve));
});

const request = (path, { userId = "user-1", method = "GET", body } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

// Asserts the shared validation error shape. `expected` is a list of
// { location, path } entries that must appear in error.details.
const expectValidationError = async (res, expected = []) => {
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(body.error.details));
  for (const { location, path } of expected) {
    assert.ok(
      body.error.details.some((d) => d.location === location && d.path === path),
      `expected ${location}.${path} in ${JSON.stringify(body.error.details)}`,
    );
  }
  return body;
};

test("payment status returns 404 when the payment does not exist", async () => {
  const res = await request(`/api/payment/status/${PAYMENT_UUID}`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Payment not found", details: [] },
  });
});

test("payment status prevents one user from viewing another user's payment", async () => {
  Payment.findByPk = async () => ({ id: PAYMENT_UUID, userId: "owner" });
  const res = await request(`/api/payment/status/${PAYMENT_UUID}`, { userId: "attacker" });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "FORBIDDEN", message: "Unauthorized", details: [] },
  });
});

test("payment status returns only the expected fields to the owner", async () => {
  Payment.findByPk = async (id) => ({
    id,
    userId: "owner",
    status: "processing",
    courseId: 7,
    courseTitle: "Secure Payments",
    amount: 49900,
    currency: "inr",
    gateway: "stripe",
    createdAt: "2026-10-05T00:00:00.000Z",
    secretInternalField: "must-not-leak",
  });
  const res = await request(`/api/payment/status/${PAYMENT_UUID}`, { userId: "owner" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.paymentId, PAYMENT_UUID);
  assert.equal(data.amount, 49900);
  assert.equal("secretInternalField" in data, false);
});

test("Stripe checkout rejects invalid course data, missing idempotency keys, and unpublished courses", async () => {
  let res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: {}, idempotencyKey: "key" },
  });
  await expectValidationError(res, [{ location: "body", path: "course.id" }]);

  res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 } },
  });
  await expectValidationError(res, [{ location: "body", path: "idempotencyKey" }]);

  Course.findByPk = async () => null;
  res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 999 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Course not found or unavailable", details: [] },
  });

  Course.findByPk = async () => ({ id: 1, status: "disabled", priceValue: 100 });
  res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Course not found or unavailable", details: [] },
  });

  Course.findByPk = async () => ({ id: 1, status: "published", priceValue: 0 });
  res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "BAD_REQUEST", message: "Invalid course price", details: [] },
  });
});

test("Stripe checkout returns a non-expired cached idempotent response for matching user, rejects other users", async () => {
  let createCalls = 0;
  Payment.findOne = async ({ where }) => {
    assert.deepEqual(where, { idempotencyKey: "stable-key" });
    return {
      userId: "user-1",
      cachedResponse: { url: "https://checkout.test/session", paymentId: "pay-1" },
      cacheExpiresAt: new Date(Date.now() + 60_000),
    };
  };
  Payment.create = async () => {
    createCalls += 1;
  };
  let res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 }, idempotencyKey: "stable-key" },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: "https://checkout.test/session", paymentId: "pay-1" });
  assert.equal(createCalls, 0);

  // Cross-user idempotency key reuse is rejected
  Payment.findOne = async () => ({
    userId: "other-user",
    cachedResponse: { url: "https://checkout.test/session", paymentId: "pay-1" },
    cacheExpiresAt: new Date(Date.now() + 60_000),
  });
  res = await request("/api/payment/create-checkout-session", {
    userId: "user-1",
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 }, idempotencyKey: "stable-key" },
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "FORBIDDEN", message: "Unauthorized idempotency key", details: [] },
  });
});

test("Razorpay order rejects invalid course data, missing idempotency keys, and unpublished courses", async () => {
  let res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { course: {}, idempotencyKey: "key" },
  });
  await expectValidationError(res, [{ location: "body", path: "course.id" }]);

  res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1, priceValue: 100 } },
  });
  await expectValidationError(res, [{ location: "body", path: "idempotencyKey" }]);

  Course.findByPk = async () => null;
  res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 999 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Course not found or unavailable", details: [] },
  });

  Course.findByPk = async () => ({ id: 1, status: "disabled", priceValue: 100 });
  res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Course not found or unavailable", details: [] },
  });

  Course.findByPk = async () => ({ id: 1, status: "published", priceValue: 0 });
  res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "BAD_REQUEST", message: "Invalid course price", details: [] },
  });
});

test("Razorpay order returns a cached idempotent response for matching user, rejects other users", async () => {
  let createCalls = 0;
  Payment.findOne = async () => ({
    userId: "user-1",
    cachedResponse: { orderId: "order-1", amount: 10000, currency: "INR", paymentId: "payment-1" },
  });
  Payment.create = async () => {
    createCalls += 1;
  };
  let res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 }, idempotencyKey: "stable-key" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).orderId, "order-1");
  assert.equal(createCalls, 0);

  // Cross-user idempotency key reuse is rejected
  Payment.findOne = async () => ({
    userId: "other-user",
    cachedResponse: { orderId: "order-1", amount: 10000, currency: "INR", paymentId: "payment-1" },
  });
  res = await request("/api/payment/razorpay/create-order", {
    userId: "user-1",
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 }, idempotencyKey: "stable-key" },
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "FORBIDDEN", message: "Unauthorized idempotency key", details: [] },
  });
});

test("Razorpay verification rejects missing parameters and invalid signatures before any transaction", async () => {
  let res = await request("/api/payment/razorpay/verify", { method: "POST", body: {} });
  await expectValidationError(res, [
    { location: "body", path: "razorpay_order_id" },
    { location: "body", path: "razorpay_payment_id" },
    { location: "body", path: "razorpay_signature" },
    { location: "body", path: "courseId" },
  ]);

  // Passes the schema (it is a string), then fails the HMAC signature check
  res = await request("/api/payment/razorpay/verify", {
    method: "POST",
    body: {
      razorpay_order_id: "order-1",
      razorpay_payment_id: "pay-1",
      razorpay_signature: "invalid",
      courseId: 7,
      courseTitle: "Course",
    },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "BAD_REQUEST", message: "Invalid signature", details: [] },
  });
});

test("Stripe checkout creates and updates a payment using the authenticated user", async () => {
  let createdData;
  let updatedData;
  let stripeOptions;
  Payment.create = async (data) => {
    createdData = data;
    return {
      id: "payment-1",
      async update(update) {
        updatedData = update;
      },
    };
  };
  paymentGatewayServices.createStripeCheckoutSession = async (options) => {
    stripeOptions = options;
    return { id: "session-1", url: "https://checkout.test/session-1" };
  };
  const res = await request("/api/payment/create-checkout-session", {
    userId: "owner-1",
    method: "POST",
    body: {
      course: { id: 7, title: "Secure Course", priceValue: 499 },
      idempotencyKey: "stripe-new",
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    url: "https://checkout.test/session-1",
    paymentId: "payment-1",
  });
  assert.equal(createdData.userId, "owner-1");
  assert.equal(createdData.amount, 49900);
  assert.equal(createdData.gateway, "stripe");
  assert.equal(stripeOptions.metadata.userId, "owner-1");
  assert.equal(stripeOptions.metadata.paymentId, "payment-1");
  assert.equal(updatedData.status, "processing");
  assert.equal(updatedData.stripeSessionId, "session-1");
});

test("Stripe gateway failure returns 500 after payment creation and marks payment failed", async () => {
  let created = 0;
  let update;
  Payment.create = async () => {
    created += 1;
    return {
      id: "payment-1",
      status: "initiated",
      async update(data) {
        update = data;
        this.status = data.status;
      },
    };
  };
  paymentGatewayServices.createStripeCheckoutSession = async () => {
    throw new Error("Stripe unavailable");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await request("/api/payment/create-checkout-session", {
      method: "POST",
      body: { course: { id: 7, title: "Course", priceValue: 100 }, idempotencyKey: "stripe-fail" },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
    assert.equal(created, 1);
    assert.deepEqual(update, { status: "failed" });
  } finally {
    console.error = originalError;
  }
});

test("Stale payment reconciliation moves expired initiated or processing payments to failed", async () => {
  let updateArgs;
  Payment.update = async (values, options) => {
    updateArgs = { values, options };
    return [3];
  };

  const reconciledCount = await Payment.reconcileStalePayments({
    timeoutMs: 15 * 60 * 1000,
    now: new Date("2026-10-26T12:00:00.000Z"),
  });

  assert.equal(reconciledCount, 3);
  assert.deepEqual(updateArgs.values, { status: "failed" });

  // Verify GET /api/payment/status/:paymentId reconciles an expired non-terminal payment
  let statusUpdated = null;
  Payment.findByPk = async (id) => ({
    id,
    userId: "owner",
    status: "initiated",
    courseId: 7,
    courseTitle: "Course",
    amount: 49900,
    currency: "inr",
    gateway: "stripe",
    createdAt: "2026-10-05T00:00:00.000Z",
    cacheExpiresAt: new Date(Date.now() - 60_000),
    async update(data) {
      statusUpdated = data;
      Object.assign(this, data);
    },
  });

  const res = await request(`/api/payment/status/${PAYMENT_UUID}`, { userId: "owner" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "failed");
  assert.deepEqual(statusUpdated, { status: "failed" });
});

test("Regression: failed payment row with empty cachedResponse is not served as cached success and can be retried", async () => {
  const failedRow = {
    id: "pay-retry-1",
    userId: "user-1",
    courseId: 7,
    courseTitle: "Course",
    amount: 10000,
    currency: "inr",
    status: "failed",
    gateway: "stripe",
    cachedResponse: {},
    cacheExpiresAt: new Date(Date.now() + 60_000),
    transitions: [],
    async update(data) {
      if (data.status) {
        this.transitions.push(data.status);
      }
      Object.assign(this, data);
    },
  };

  Payment.findOne = async () => failedRow;
  paymentGatewayServices.createStripeCheckoutSession = async () => ({
    id: "sess-retry-1",
    url: "https://checkout.test/sess-retry-1",
  });

  const res = await request("/api/payment/create-checkout-session", {
    userId: "user-1",
    method: "POST",
    body: {
      course: { id: 7, title: "Course", priceValue: 100 },
      idempotencyKey: "retry-key-1",
    },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    url: "https://checkout.test/sess-retry-1",
    paymentId: "pay-retry-1",
  });
  assert.deepEqual(failedRow.transitions, ["initiated", "processing"]);
  assert.equal(failedRow.status, "processing");
});

test("Payment state machine enforces valid lifecycle transitions across Stripe and Razorpay", () => {
  assert.equal(Payment.canTransition("initiated", "processing"), true);
  assert.equal(Payment.canTransition("initiated", "failed"), true);
  assert.equal(Payment.canTransition("processing", "success"), true);
  assert.equal(Payment.canTransition("processing", "failed"), true);
  assert.equal(Payment.canTransition("failed", "initiated"), true);
  assert.equal(Payment.canTransition("success", "failed"), false);
  assert.equal(Payment.canTransition("success", "processing"), false);
});

test("Razorpay order creates, caches, and updates a payment", async () => {
  let createdData;
  let updatedData;
  let gatewayOptions;
  Payment.create = async (data) => {
    createdData = data;
    return {
      id: "payment-rzp",
      async update(update) {
        updatedData = update;
      },
    };
  };
  paymentGatewayServices.createRazorpayOrder = async (options) => {
    gatewayOptions = options;
    return { id: "order-rzp", amount: options.amount, currency: options.currency };
  };
  const res = await request("/api/payment/razorpay/create-order", {
    userId: "owner-rzp",
    method: "POST",
    body: {
      course: { id: 9, title: "Razorpay Course", priceValue: 250 },
      idempotencyKey: "rzp-new",
    },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.orderId, "order-rzp");
  assert.equal(data.paymentId, "payment-rzp");
  assert.equal(createdData.userId, "owner-rzp");
  assert.equal(createdData.amount, 25000);
  assert.equal(gatewayOptions.amount, 25000);
  assert.deepEqual(gatewayOptions.notes, {
    courseId: "9",
    courseTitle: "Razorpay Course",
  });
  assert.equal(updatedData.status, "processing");
  assert.equal(updatedData.razorpayOrderId, "order-rzp");
});

test("Razorpay gateway failure marks the initiated payment failed", async () => {
  let update;
  Payment.create = async () => ({
    id: "payment-rzp",
    async update(data) {
      update = data;
    },
  });
  paymentGatewayServices.createRazorpayOrder = async () => {
    throw new Error("Razorpay unavailable");
  };
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    const res = await request("/api/payment/razorpay/create-order", {
      method: "POST",
      body: { course: { id: 9, title: "Course", priceValue: 250 }, idempotencyKey: "rzp-fail" },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(update, { status: "failed" });
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});

test("Razorpay verification requires a payment owned by the authenticated user", async () => {
  let transaction;
  let paymentQuery;
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() {
        this.finished = "commit";
      },
      async rollback() {
        this.finished = "rollback";
      },
    };
    return transaction;
  };
  Payment.findOne = async (options) => {
    paymentQuery = options;
    return null;
  };
  const orderId = "order-owned";
  const paymentId = "payment-owned";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const res = await request("/api/payment/razorpay/verify", {
    userId: "owner-1",
    method: "POST",
    body: {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      courseId: 7,
      courseTitle: "Owned Course",
    },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Payment not found", details: [] },
  });
  assert.deepEqual(paymentQuery.where, { razorpayOrderId: orderId, userId: "owner-1" });
  assert.equal(transaction.finished, "rollback");
});

test("Razorpay verification marks payment successful, enrolls once, and commits", async () => {
  let transaction;
  let paymentUpdate;
  let saves = 0;
  const payment = {
    async update(data, options) {
      paymentUpdate = [data, options];
    },
  };
  const user = {
    id: "owner-1",
    purchasedCourses: [],
    changed() {},
    async save(options) {
      saves += 1;
      assert.equal(options.transaction, transaction);
    },
  };
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() {
        this.finished = "commit";
      },
      async rollback() {
        this.finished = "rollback";
      },
    };
    return transaction;
  };
  Payment.findOne = async ({ where, transaction: tx }) => {
    assert.deepEqual(where, { razorpayOrderId: "order-success", userId: "owner-1" });
    assert.equal(tx, transaction);
    return payment;
  };
  User.findByPk = async () => user;
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order-success|payment-success")
    .digest("hex");
  const res = await request("/api/payment/razorpay/verify", {
    userId: "owner-1",
    method: "POST",
    body: {
      razorpay_order_id: "order-success",
      razorpay_payment_id: "payment-success",
      razorpay_signature: signature,
      courseId: 7,
      courseTitle: "Owned Course",
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, message: "Payment verified successfully" });
  assert.equal(transaction.finished, "commit");
  assert.deepEqual(paymentUpdate[0], { status: "success", razorpayPaymentId: "payment-success" });
  assert.equal(user.purchasedCourses.length, 1);
  assert.equal(saves, 1);
});

test("Razorpay verification does not duplicate an existing course enrollment", async () => {
  let transaction;
  let saves = 0;
  const payment = { async update() {} };
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() {
        this.finished = "commit";
      },
      async rollback() {
        this.finished = "rollback";
      },
    };
    return transaction;
  };
  Payment.findOne = async () => payment;
  User.findByPk = async () => ({
    id: "owner-1",
    purchasedCourses: [{ courseId: 7, courseTitle: "Existing Course" }],
    changed() {
      throw new Error("existing enrollment must not be changed");
    },
    async save() {
      saves += 1;
    },
  });
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order-existing|payment-existing")
    .digest("hex");
  const res = await request("/api/payment/razorpay/verify", {
    userId: "owner-1",
    method: "POST",
    body: {
      razorpay_order_id: "order-existing",
      razorpay_payment_id: "payment-existing",
      razorpay_signature: signature,
      courseId: 7,
      courseTitle: "Existing Course",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(transaction.finished, "commit");
  assert.equal(saves, 0);
});

test("Razorpay verification rolls back when the authenticated user is missing", async () => {
  let transaction;
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() {
        this.finished = "commit";
      },
      async rollback() {
        this.finished = "rollback";
      },
    };
    return transaction;
  };
  Payment.findOne = async () => ({ async update() {} });
  let userLookupCalls = 0;
  User.findByPk = async (id) => {
    userLookupCalls += 1;
    if (userLookupCalls === 1) {
      return { id, isBlocked: false, passwordChangedAt: null };
    }
    return null;
  };
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order-missing-user|payment-missing-user")
    .digest("hex");
  const res = await request("/api/payment/razorpay/verify", {
    userId: "missing-user",
    method: "POST",
    body: {
      razorpay_order_id: "order-missing-user",
      razorpay_payment_id: "payment-missing-user",
      razorpay_signature: signature,
      courseId: 7,
      courseTitle: "Course",
    },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "User not found", details: [] },
  });
  assert.equal(transaction.finished, "rollback");
  assert.equal(userLookupCalls, 2);
});

test("Razorpay verification rolls back and returns 500 on database failure", async () => {
  let transaction;
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() {
        this.finished = "commit";
      },
      async rollback() {
        this.finished = "rollback";
      },
    };
    return transaction;
  };
  Payment.findOne = async () => {
    throw new Error("database unavailable");
  };
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order-db-error|payment-db-error")
    .digest("hex");
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    const res = await request("/api/payment/razorpay/verify", {
      userId: "owner-1",
      method: "POST",
      body: {
        razorpay_order_id: "order-db-error",
        razorpay_payment_id: "payment-db-error",
        razorpay_signature: signature,
        courseId: 7,
        courseTitle: "Course",
      },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal Server Error", details: [] },
    });
    assert.equal(transaction.finished, "rollback");
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});

// ---- Razorpay verify: ownership, course binding, replay and duplicate handling ----
const verifySignature = (orderId, paymentId) =>
  crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

// A stored payment owned by "owner-1" for course 7
const makeStoredPayment = (overrides = {}) => ({
  razorpayOrderId: "order-1",
  userId: "owner-1",
  courseId: 7,
  courseTitle: "Stored Title",
  status: "processing",
  updates: [],
  async update(data) {
    this.updates.push(data);
    Object.assign(this, data);
  },
  ...overrides,
});

const makeStoredUser = () => ({
  id: "owner-1",
  purchasedCourses: [],
  saves: 0,
  changed() {},
  async save() {
    this.saves += 1;
  },
});

// Fakes the payment table: findOne only returns a row that matches the whole `where`
const setupVerify = (payment) => {
  const user = makeStoredUser();
  const state = { transaction: null, findOneOptions: null, notifications: 0, user };
  sequelize.transaction = async () => {
    state.transaction = {
      finished: undefined,
      async commit() {
        this.finished = "commit";
      },
      async rollback() {
        this.finished = "rollback";
      },
    };
    return state.transaction;
  };
  Payment.findOne = async (options) => {
    state.findOneOptions = options;
    const matches = Object.entries(options.where).every(([key, value]) => payment[key] === value);
    return matches ? payment : null;
  };
  User.findByPk = async (id, options) =>
    options?.transaction ? user : { id, isBlocked: false, passwordChangedAt: null };
  Notification.create = async (data) => {
    state.notifications += 1;
    return { id: "notification", ...data };
  };
  return state;
};

const verifyRequest = ({ userId = "owner-1", ...overrides } = {}) =>
  request("/api/payment/razorpay/verify", {
    userId,
    method: "POST",
    body: {
      razorpay_order_id: "order-1",
      razorpay_payment_id: "payment-1",
      razorpay_signature: verifySignature("order-1", "payment-1"),
      courseId: 7,
      ...overrides,
    },
  });

test("Razorpay verification uses a fixed fallback and never a client-supplied title", async () => {
  const payment = makeStoredPayment({ courseTitle: null });
  const state = setupVerify(payment);
  const res = await verifyRequest({ courseTitle: "Client supplied title" });
  assert.equal(res.status, 200);
  assert.equal(state.transaction.finished, "commit");
  assert.equal(state.user.purchasedCourses.length, 1);
  assert.equal(state.user.purchasedCourses[0].courseTitle, "Course");
});

test("Razorpay verify enrolls the stored course and ignores the client-supplied title", async () => {
  const payment = makeStoredPayment();
  const state = setupVerify(payment);
  const res = await verifyRequest({ courseTitle: "Client supplied title" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, message: "Payment verified successfully" });
  assert.equal(state.transaction.finished, "commit");
  assert.equal(state.user.purchasedCourses.length, 1);
  assert.equal(state.user.purchasedCourses[0].courseId, 7);
  assert.equal(state.user.purchasedCourses[0].courseTitle, "Stored Title");
  assert.equal(state.notifications, 1);
  assert.equal(state.findOneOptions.lock, "UPDATE"); // row is locked for the transaction
});

test("Razorpay verify rejects another user's payment and changes nothing", async () => {
  const payment = makeStoredPayment();
  const state = setupVerify(payment);
  const res = await verifyRequest({ userId: "attacker" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "NOT_FOUND", message: "Payment not found", details: [] },
  });
  assert.equal(state.findOneOptions.where.userId, "attacker");
  assert.equal(state.transaction.finished, "rollback");
  assert.deepEqual(payment.updates, []);
  assert.equal(state.user.purchasedCourses.length, 0);
  assert.equal(state.notifications, 0);
});

test("Razorpay verify rejects a course that differs from the paid course", async () => {
  const payment = makeStoredPayment();
  const state = setupVerify(payment);
  const res = await verifyRequest({ courseId: 8 });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    success: false,
    error: { code: "BAD_REQUEST", message: "Course does not match the paid order", details: [] },
  });
  assert.equal(state.transaction.finished, "rollback");
  assert.deepEqual(payment.updates, []);
  assert.equal(state.user.purchasedCourses.length, 0);
  assert.equal(state.notifications, 0);
});

test("Razorpay verify replay: an already successful payment is not processed again", async () => {
  const payment = makeStoredPayment({ status: "success" });
  const state = setupVerify(payment);
  const res = await verifyRequest();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, message: "Payment already verified" });
  assert.equal(state.transaction.finished, "rollback");
  assert.deepEqual(payment.updates, []);
  assert.equal(state.user.saves, 0);
  assert.equal(state.notifications, 0);
});

test("Razorpay verify duplicate: verifying twice updates, enrolls and notifies once", async () => {
  const payment = makeStoredPayment();
  const state = setupVerify(payment);
  const first = await verifyRequest();
  const second = await verifyRequest();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { success: true, message: "Payment verified successfully" });
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { success: true, message: "Payment already verified" });
  assert.equal(payment.updates.length, 1);
  assert.equal(state.user.purchasedCourses.length, 1);
  assert.equal(state.user.saves, 1);
  assert.equal(state.notifications, 1);
});

// ---- Schema validation wiring (the full list of bad values lives in paymentSchema.test.js) ----

const BAD_CREATE_BODIES = [
  ["empty body", {}],
  ["missing idempotencyKey", { courseId: 7 }],
  ["malformed courseId", { courseId: "abc", idempotencyKey: "key-1" }],
  ["unknown field", { courseId: 7, idempotencyKey: "key-1", amount: 1 }],
];

for (const endpoint of [
  "/api/payment/create-checkout-session",
  "/api/payment/razorpay/create-order",
]) {
  for (const [name, body] of BAD_CREATE_BODIES) {
    test(`${endpoint} rejects ${name} before any lookup or gateway call`, async () => {
      let calls = 0;
      const mustNotRun = async () => {
        calls += 1;
        throw new Error("must not be reached");
      };
      Course.findByPk = mustNotRun;
      Payment.findOne = mustNotRun;
      Payment.create = mustNotRun;
      paymentGatewayServices.createStripeCheckoutSession = mustNotRun;
      paymentGatewayServices.createRazorpayOrder = mustNotRun;

      const res = await request(endpoint, { method: "POST", body });
      await expectValidationError(res);
      assert.equal(calls, 0);
    });
  }
}

test("create-order reports a clear message for a malformed courseId", async () => {
  const res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { courseId: "abc", idempotencyKey: "x" },
  });
  const body = await expectValidationError(res, [{ location: "body", path: "courseId" }]);
  assert.equal(
    body.error.details.find((d) => d.path === "courseId").message,
    "Course ID must be a positive integer",
  );
});

const goodVerifyBody = () => ({
  razorpay_order_id: "order-1",
  razorpay_payment_id: "payment-1",
  razorpay_signature: verifySignature("order-1", "payment-1"),
  courseId: 7,
});

for (const [name, change] of [
  ["a missing signature", { razorpay_signature: undefined }],
  ["an object signature", { razorpay_signature: { a: 1 } }],
  ["a malformed courseId", { courseId: "0x10" }],
]) {
  test(`Razorpay verify rejects ${name} before any transaction`, async () => {
    let transactions = 0;
    sequelize.transaction = async () => {
      transactions += 1;
      throw new Error("must not be reached");
    };
    const res = await request("/api/payment/razorpay/verify", {
      method: "POST",
      body: { ...goodVerifyBody(), ...change },
    });
    await expectValidationError(res);
    assert.equal(transactions, 0);
  });
}

test("payment status rejects a non-UUID paymentId before the database is queried", async () => {
  let lookups = 0;
  Payment.findByPk = async () => {
    lookups += 1;
    return null;
  };
  const res = await request("/api/payment/status/abc");
  await expectValidationError(res, [{ location: "params", path: "paymentId" }]);
  assert.equal(lookups, 0);
});

test("Regression: a string courseId reaches the course lookup as a number", async () => {
  let receivedId;
  Course.findByPk = async (id) => {
    receivedId = id;
    return null;
  };
  const res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { courseId: "7", idempotencyKey: "regression-key" },
  });
  assert.equal(res.status, 404); // passed validation, then course not found
  assert.strictEqual(receivedId, 7);
});

test("Regression: a valid Stripe request with courseId still succeeds", async () => {
  Payment.create = async () => ({ id: "payment-ok", async update() {} });
  paymentGatewayServices.createStripeCheckoutSession = async () => ({
    id: "session-ok",
    url: "https://checkout.test/session-ok",
  });
  const res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { courseId: 7, idempotencyKey: "valid-stripe-key" },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    url: "https://checkout.test/session-ok",
    paymentId: "payment-ok",
  });
});

test("Regression: a valid Razorpay request with courseId still succeeds", async () => {
  Payment.create = async () => ({ id: "payment-ok", async update() {} });
  paymentGatewayServices.createRazorpayOrder = async (options) => ({
    id: "order-ok",
    amount: options.amount,
    currency: options.currency,
  });
  const res = await request("/api/payment/razorpay/create-order", {
    method: "POST",
    body: { courseId: 9, idempotencyKey: "valid-rzp-key" },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.orderId, "order-ok");
  assert.equal(data.paymentId, "payment-ok");
});
