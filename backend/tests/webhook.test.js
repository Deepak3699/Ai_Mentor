import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

const { default: express } = await import("express");
const { default: Payment } = await import("../models/Payment.js");
const { default: User } = await import("../models/User.js");
const { default: Notification } = await import("../models/Notification.js");
const { sequelize } = await import("../config/db.js");
const { paymentGatewayServices } = await import("../services/paymentGatewayServices.js");
const { default: webhookRoutes } = await import("../routes/webhook.js");

const originals = {
  paymentFindOne: Payment.findOne,
  paymentUpdate: Payment.update,
  userFindByPk: User.findByPk,
  notificationCreate: Notification.create,
  transaction: sequelize.transaction,
  constructEvent: paymentGatewayServices.constructStripeWebhookEvent,
};
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use("/api/stripe", webhookRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  Payment.findOne = async () => null;
  Payment.update = async () => { throw new Error("unexpected Payment.update"); };
  User.findByPk = async () => null;
  Notification.create = async (data) => ({ id: "notification", ...data });
  sequelize.transaction = async () => ({
    finished: undefined,
    async commit() { this.finished = "commit"; },
    async rollback() { this.finished = "rollback"; },
  });
  paymentGatewayServices.constructStripeWebhookEvent = () => { throw new Error("invalid signature"); };
});

after(async () => {
  Payment.findOne = originals.paymentFindOne;
  Payment.update = originals.paymentUpdate;
  User.findByPk = originals.userFindByPk;
  Notification.create = originals.notificationCreate;
  sequelize.transaction = originals.transaction;
  paymentGatewayServices.constructStripeWebhookEvent = originals.constructEvent;
  await new Promise((resolve) => server.close(resolve));
});

const send = (signature) => fetch(`${baseUrl}/api/stripe/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(signature ? { "stripe-signature": signature } : {}),
  },
  body: JSON.stringify({ test: true }),
});

const quietErrors = async (callback) => {
  const original = console.error;
  console.error = () => {};
  try { return await callback(); } finally { console.error = original; }
};

test("webhook rejects a missing Stripe signature", async () => {
  const res = await quietErrors(() => send());
  assert.equal(res.status, 400);
  assert.equal(await res.text(), "Missing stripe-signature header");
});

test("webhook rejects an invalid Stripe signature", async () => {
  const res = await quietErrors(() => send("invalid"));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Webhook Error: invalid signature/);
});

test("expired Stripe sessions are marked failed and acknowledged", async () => {
  let update;
  paymentGatewayServices.constructStripeWebhookEvent = () => ({
    type: "checkout.session.expired",
    data: { object: { id: "session-expired" } },
  });
  Payment.update = async (...args) => { update = args; return [1]; };
  const res = await send("valid");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
  assert.deepEqual(update, [
    { status: "failed" },
    { where: { stripeSessionId: "session-expired" } },
  ]);
});

test("unhandled events are acknowledged without changing payments", async () => {
  let updateCalls = 0;
  paymentGatewayServices.constructStripeWebhookEvent = () => ({ type: "customer.created", data: { object: {} } });
  Payment.update = async () => { updateCalls += 1; };
  const res = await send("valid");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
  assert.equal(updateCalls, 0);
});


const completedEvent = (overrides = {}) => ({
  type: "checkout.session.completed",
  data: {
    object: {
      id: "session-complete",
      payment_intent: "intent-1",
      metadata: { courseId: "7", userId: "user-1", courseTitle: "Secure Course" },
      ...overrides,
    },
  },
});

test("completed checkout marks payment successful, enrolls the user, and commits", async () => {
  let paymentUpdate;
  let savedOptions;
  let changed;
  let transaction;
  const user = {
    id: "user-1",
    purchasedCourses: [],
    changed(field, value) { changed = [field, value]; },
    async save(options) { savedOptions = options; },
  };
  paymentGatewayServices.constructStripeWebhookEvent = () => completedEvent();
  Payment.findOne = async ({ where, transaction: tx }) => {
    assert.deepEqual(where, { stripeSessionId: "session-complete" });
    transaction = tx;
    return { status: "processing" };
  };
  Payment.update = async (...args) => { paymentUpdate = args; return [1]; };
  User.findByPk = async (id, options) => {
    assert.equal(id, "user-1");
    assert.equal(options.transaction, transaction);
    return user;
  };

  const res = await send("valid");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
  assert.equal(transaction.finished, "commit");
  assert.equal(paymentUpdate[0].status, "success");
  assert.equal(paymentUpdate[0].stripePaymentIntentId, "intent-1");
  assert.equal(user.purchasedCourses.length, 1);
  assert.equal(user.purchasedCourses[0].courseId, 7);
  assert.deepEqual(changed, ["purchasedCourses", true]);
  assert.equal(savedOptions.transaction, transaction);
});

test("completed checkout does not duplicate an existing enrollment", async () => {
  let saves = 0;
  let transaction;
  paymentGatewayServices.constructStripeWebhookEvent = () => completedEvent();
  Payment.findOne = async ({ transaction: tx }) => { transaction = tx; return { status: "processing" }; };
  Payment.update = async () => [1];
  User.findByPk = async () => ({
    id: "user-1",
    purchasedCourses: [{ courseId: 7, courseTitle: "Existing" }],
    changed() { throw new Error("should not mark unchanged enrollment"); },
    async save() { saves += 1; },
  });
  const res = await send("valid");
  assert.equal(res.status, 200);
  assert.equal(transaction.finished, "commit");
  assert.equal(saves, 0);
});

test("already successful Stripe sessions are acknowledged and rolled back as replays", async () => {
  let transaction;
  let updateCalls = 0;
  paymentGatewayServices.constructStripeWebhookEvent = () => completedEvent();
  Payment.findOne = async ({ transaction: tx }) => { transaction = tx; return { status: "success" }; };
  Payment.update = async () => { updateCalls += 1; };
  User.findByPk = async () => { throw new Error("replay must not load user"); };
  const res = await send("valid");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
  assert.equal(transaction.finished, "rollback");
  assert.equal(updateCalls, 0);
});

test("missing webhook user rolls back and returns 404", async () => {
  let transaction;
  paymentGatewayServices.constructStripeWebhookEvent = () => completedEvent();
  Payment.findOne = async ({ transaction: tx }) => { transaction = tx; return { status: "processing" }; };
  Payment.update = async () => [1];
  User.findByPk = async () => null;
  const res = await send("valid");
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "User not found");
  assert.equal(transaction.finished, "rollback");
});

test("database failures roll back the webhook transaction", async () => {
  let transaction;
  paymentGatewayServices.constructStripeWebhookEvent = () => completedEvent();
  Payment.findOne = async ({ transaction: tx }) => { transaction = tx; throw new Error("database unavailable"); };
  const res = await quietErrors(() => send("valid"));
  assert.equal(res.status, 500);
  assert.equal(await res.text(), "Internal Server Error");
  assert.equal(transaction.finished, "rollback");
});
