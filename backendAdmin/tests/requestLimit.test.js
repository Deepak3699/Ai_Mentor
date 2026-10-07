import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

// Env must be set BEFORE the app is imported.
process.env.NODE_ENV = "test";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET = "dummy";

const { default: app } = await import("../server.js");

const LIMIT_KB = 100;
const UNDER_LIMIT = 90 * 1024;  // 90 KB, just below
const OVER_LIMIT = 110 * 1024;  // 110 KB, just above

const PATH = "/api/body-limit-test";

describe("Backend Admin request body size limits", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = app.listen(0); // 0 = any free port
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const postJson = (bytes) =>
    fetch(`${baseUrl}${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "x".repeat(bytes) }),
    });

  const postForm = (bytes) =>
    fetch(`${baseUrl}${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + "x".repeat(bytes),
    });

  test(`should accept a JSON body below the ${LIMIT_KB}kb limit`, async () => {
    const res = await postJson(UNDER_LIMIT);
    // 404 is expected: the parser accepted the body and only the route is missing.
    assert.equal(res.status, 404);
  });

  test(`should reject a JSON body above the ${LIMIT_KB}kb limit with 413 Payload Too Large`, async () => {
    const res = await postJson(OVER_LIMIT);
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.message, "Payload Too Large");
  });

  test("should reject malformed JSON with 400 Invalid JSON", async () => {
    const res = await fetch(`${baseUrl}${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.message, "Invalid JSON");
  });

  test(`should accept a URL-encoded body below the ${LIMIT_KB}kb limit`, async () => {
    const res = await postForm(UNDER_LIMIT);
    assert.equal(res.status, 404);
  });

  test(`should reject a URL-encoded body above the ${LIMIT_KB}kb limit with 413 Payload Too Large`, async () => {
    const res = await postForm(OVER_LIMIT);
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.message, "Payload Too Large");
  });
});
