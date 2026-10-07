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
  createStripeCheckoutSession: paymentGatewayServices.createStripeCheckoutSession,
  createRazorpayOrder: paymentGatewayServices.createRazorpayOrder,
  notificationCreate: Notification.create,
  transaction: sequelize.transaction,
};

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/payment", paymentRoutes);
  app.use("/api/razorpay", razorpayRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  User.findByPk = async (id) => ({ id, isBlocked: false, passwordChangedAt: null });
  Payment.findOne = async () => null;
  Payment.findByPk = async () => null;
  Payment.create = async () => { throw new Error("unexpected Payment.create"); };
  paymentGatewayServices.createStripeCheckoutSession = async () => { throw new Error("unexpected Stripe call"); };
  paymentGatewayServices.createRazorpayOrder = async () => { throw new Error("unexpected Razorpay call"); };
  Notification.create = async (data) => ({ id: "notification", ...data });
  sequelize.transaction = async () => ({
    finished: undefined,
    async commit() { this.finished = "commit"; },
    async rollback() { this.finished = "rollback"; },
  });
});

after(async () => {
  User.findByPk = originals.userFindByPk;
  Payment.findOne = originals.paymentFindOne;
  Payment.findByPk = originals.paymentFindByPk;
  Payment.create = originals.paymentCreate;
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

test("payment status returns 404 when the payment does not exist", async () => {
  const res = await request("/api/payment/status/missing");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Payment not found" });
});

test("payment status prevents one user from viewing another user's payment", async () => {
  Payment.findByPk = async () => ({ id: "payment-1", userId: "owner" });
  const res = await request("/api/payment/status/payment-1", { userId: "attacker" });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "Unauthorized" });
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
  const res = await request("/api/payment/status/payment-1", { userId: "owner" });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.paymentId, "payment-1");
  assert.equal(data.amount, 49900);
  assert.equal("secretInternalField" in data, false);
});

test("Stripe checkout rejects invalid course data and missing idempotency keys", async () => {
  let res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 0 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid course data" });

  res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 } },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "idempotencyKey is required" });
});

test("Stripe checkout returns a non-expired cached idempotent response without creating payment", async () => {
  let createCalls = 0;
  Payment.findOne = async ({ where }) => {
    assert.deepEqual(where, { idempotencyKey: "stable-key" });
    return {
      cachedResponse: { url: "https://checkout.test/session", paymentId: "pay-1" },
      cacheExpiresAt: new Date(Date.now() + 60_000),
    };
  };
  Payment.create = async () => { createCalls += 1; };
  const res = await request("/api/payment/create-checkout-session", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 }, idempotencyKey: "stable-key" },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: "https://checkout.test/session", paymentId: "pay-1" });
  assert.equal(createCalls, 0);
});

test("Razorpay order rejects invalid course data and missing idempotency keys", async () => {
  let res = await request("/api/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1, priceValue: 0 }, idempotencyKey: "key" },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid course data" });

  res = await request("/api/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1, priceValue: 100 } },
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "idempotencyKey is required" });
});

test("Razorpay order returns a cached idempotent response without creating payment", async () => {
  let createCalls = 0;
  Payment.findOne = async () => ({
    cachedResponse: { orderId: "order-1", amount: 10000, currency: "INR", paymentId: "payment-1" },
  });
  Payment.create = async () => { createCalls += 1; };
  const res = await request("/api/razorpay/create-order", {
    method: "POST",
    body: { course: { id: 1, title: "Course", priceValue: 100 }, idempotencyKey: "stable-key" },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).orderId, "order-1");
  assert.equal(createCalls, 0);
});

test("Razorpay verification rejects missing parameters and invalid signatures before any transaction", async () => {
  let res = await request("/api/razorpay/verify", { method: "POST", body: {} });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { success: false, error: "Missing required parameters" });

  res = await request("/api/razorpay/verify", {
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
  assert.deepEqual(await res.json(), { success: false, error: "Invalid signature" });
});


test("Stripe checkout creates and updates a payment using the authenticated user", async () => {
  let createdData;
  let updatedData;
  let stripeOptions;
  Payment.create = async (data) => {
    createdData = data;
    return { id: "payment-1", async update(update) { updatedData = update; } };
  };
  paymentGatewayServices.createStripeCheckoutSession = async (options) => {
    stripeOptions = options;
    return { id: "session-1", url: "https://checkout.test/session-1" };
  };
  const res = await request("/api/payment/create-checkout-session", {
    userId: "owner-1",
    method: "POST",
    body: { course: { id: 7, title: "Secure Course", priceValue: 499 }, idempotencyKey: "stripe-new" },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: "https://checkout.test/session-1", paymentId: "payment-1" });
  assert.equal(createdData.userId, "owner-1");
  assert.equal(createdData.amount, 49900);
  assert.equal(createdData.gateway, "stripe");
  assert.equal(stripeOptions.metadata.userId, "owner-1");
  assert.equal(stripeOptions.metadata.paymentId, "payment-1");
  assert.equal(updatedData.status, "processing");
  assert.equal(updatedData.stripeSessionId, "session-1");
});

test("Stripe gateway failure returns 500 after payment creation", async () => {
  let created = 0;
  Payment.create = async () => { created += 1; return { id: "payment-1", async update() {} }; };
  paymentGatewayServices.createStripeCheckoutSession = async () => { throw new Error("Stripe unavailable"); };
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await request("/api/payment/create-checkout-session", {
      method: "POST",
      body: { course: { id: 7, title: "Course", priceValue: 100 }, idempotencyKey: "stripe-fail" },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Stripe session failed" });
    assert.equal(created, 1);
  } finally { console.error = originalError; }
});

test("Razorpay order creates, caches, and updates a payment", async () => {
  let createdData;
  let updatedData;
  let gatewayOptions;
  Payment.create = async (data) => {
    createdData = data;
    return { id: "payment-rzp", async update(update) { updatedData = update; } };
  };
  paymentGatewayServices.createRazorpayOrder = async (options) => {
    gatewayOptions = options;
    return { id: "order-rzp", amount: options.amount, currency: options.currency };
  };
  const res = await request("/api/razorpay/create-order", {
    userId: "owner-rzp",
    method: "POST",
    body: { course: { id: 9, title: "Razorpay Course", priceValue: 250 }, idempotencyKey: "rzp-new" },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.orderId, "order-rzp");
  assert.equal(data.paymentId, "payment-rzp");
  assert.equal(createdData.userId, "owner-rzp");
  assert.equal(createdData.amount, 25000);
  assert.equal(gatewayOptions.amount, 25000);
  assert.equal(updatedData.status, "processing");
  assert.equal(updatedData.razorpayOrderId, "order-rzp");
});

test("Razorpay gateway failure marks the initiated payment failed", async () => {
  let update;
  Payment.create = async () => ({ id: "payment-rzp", async update(data) { update = data; } });
  paymentGatewayServices.createRazorpayOrder = async () => { throw new Error("Razorpay unavailable"); };
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    const res = await request("/api/razorpay/create-order", {
      method: "POST",
      body: { course: { id: 9, title: "Course", priceValue: 250 }, idempotencyKey: "rzp-fail" },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(update, { status: "failed" });
  } finally { console.error = originalError; console.log = originalLog; }
});


test("Razorpay verification requires a payment owned by the authenticated user", async () => {
  let transaction;
  let paymentQuery;
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() { this.finished = "commit"; },
      async rollback() { this.finished = "rollback"; },
    };
    return transaction;
  };
  Payment.findOne = async (options) => { paymentQuery = options; return null; };
  const orderId = "order-owned";
  const paymentId = "payment-owned";
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const res = await request("/api/razorpay/verify", {
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
  assert.deepEqual(await res.json(), { success: false, error: "Payment not found" });
  assert.deepEqual(paymentQuery.where, { razorpayOrderId: orderId, userId: "owner-1" });
  assert.equal(transaction.finished, "rollback");
});

test("Razorpay verification marks payment successful, enrolls once, and commits", async () => {
  let transaction;
  let paymentUpdate;
  let saves = 0;
  const payment = { async update(data, options) { paymentUpdate = [data, options]; } };
  const user = {
    id: "owner-1",
    purchasedCourses: [],
    changed() {},
    async save(options) { saves += 1; assert.equal(options.transaction, transaction); },
  };
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() { this.finished = "commit"; },
      async rollback() { this.finished = "rollback"; },
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
  const res = await request("/api/razorpay/verify", {
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
      async commit() { this.finished = "commit"; },
      async rollback() { this.finished = "rollback"; },
    };
    return transaction;
  };
  Payment.findOne = async () => payment;
  User.findByPk = async () => ({
    id: "owner-1",
    purchasedCourses: [{ courseId: 7, courseTitle: "Existing Course" }],
    changed() { throw new Error("existing enrollment must not be changed"); },
    async save() { saves += 1; },
  });
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order-existing|payment-existing")
    .digest("hex");
  const res = await request("/api/razorpay/verify", {
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
      async commit() { this.finished = "commit"; },
      async rollback() { this.finished = "rollback"; },
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
  const res = await request("/api/razorpay/verify", {
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
  assert.deepEqual(await res.json(), { success: false, error: "User not found" });
  assert.equal(transaction.finished, "rollback");
  assert.equal(userLookupCalls, 2);
});

test("Razorpay verification rolls back and returns 500 on database failure", async () => {
  let transaction;
  sequelize.transaction = async () => {
    transaction = {
      finished: undefined,
      async commit() { this.finished = "commit"; },
      async rollback() { this.finished = "rollback"; },
    };
    return transaction;
  };
  Payment.findOne = async () => { throw new Error("database unavailable"); };
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update("order-db-error|payment-db-error")
    .digest("hex");
  const originalError = console.error;
  const originalLog = console.log;
  console.error = () => {};
  console.log = () => {};
  try {
    const res = await request("/api/razorpay/verify", {
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
      error: "Payment verification failed",
    });
    assert.equal(transaction.finished, "rollback");
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});
