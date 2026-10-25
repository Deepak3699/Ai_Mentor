import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

const { default: app } = await import("../server.js");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// Deliberate whitespace and Unicode catch accidental JSON parsing/re-serialization.
const payload = '{\n  "type": "customer.created", "data": {"object": {"name": "Zeeshan 🎉"}}\n}';
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const sign = (timestamp, secret = process.env.STRIPE_WEBHOOK_SECRET) =>
  stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });

const send = (signature, body = payload) =>
  fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });

for (const delay of [0, 5, 60, 299, 300]) {
  test(`real app accepts an authentic webhook delayed by ${delay} seconds`, async (t) => {
    const now = Math.floor(Date.now() / 1000);
    t.mock.method(Date, "now", () => now * 1000);
    const res = await send(sign(now - delay));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true });
  });
}

test("real app rejects signatures outside Stripe's five-minute replay window", async () => {
  const res = await send(sign(Math.floor(Date.now() / 1000) - 301));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Timestamp outside the tolerance zone/);
});

test("real app rejects a modified raw payload", async () => {
  const res = await send(sign(Math.floor(Date.now() / 1000)), `${payload} `);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Webhook Error:/);
});

test("real app rejects a signature from the wrong secret", async () => {
  const res = await send(sign(Math.floor(Date.now() / 1000), "whsec_wrong"));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /Webhook Error:/);
});

test("real app rejects missing and malformed signature headers", async () => {
  for (const signature of [undefined, "invalid"]) {
    const res = await send(signature);
    assert.equal(res.status, 400);
    await res.text();
  }
});
