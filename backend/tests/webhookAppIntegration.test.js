import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

const { default: app } = await import("../server.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: User } = await import("../models/User.js");
const { default: Notification } = await import("../models/Notification.js");
const { sequelize } = await import("../config/db.js");
const { paymentGatewayServices } = await import("../services/paymentGatewayServices.js");

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
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  Payment.findOne = async () => null;
  Payment.update = async () => [1];
  User.findByPk = async () => null;
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
  paymentGatewayServices.constructStripeWebhookEvent = () => {
    throw new Error("invalid signature");
  };
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

test("production app routes /api/stripe/webhook with raw body to webhook handler", async () => {
  let receivedPayload;
  paymentGatewayServices.constructStripeWebhookEvent = (payload) => {
    receivedPayload = payload;
    return {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "session-app-test",
          payment_intent: "intent-app-test",
          metadata: { courseId: "7", userId: "user-1", courseTitle: "App Test Course" },
        },
      },
    };
  };

  Payment.findOne = async () => ({
    id: "pay-app",
    userId: "user-1",
    courseId: 7,
    status: "processing",
  });

  const user = {
    id: "user-1",
    purchasedCourses: [],
    changed() {},
    async save() {},
  };
  User.findByPk = async () => user;

  const rawJson = JSON.stringify({ event: "test" });
  const res = await fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "valid-sig",
    },
    body: rawJson,
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true });
  // Verify body arrived as a raw Buffer and was not pre-parsed into an object by express.json
  assert.ok(Buffer.isBuffer(receivedPayload));
  assert.equal(receivedPayload.toString("utf8"), rawJson);
  assert.equal(user.purchasedCourses.length, 1);
  assert.equal(user.purchasedCourses[0].courseId, 7);
});
