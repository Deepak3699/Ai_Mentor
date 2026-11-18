import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

// Configure test environment variables before module imports
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-chat-validation";
process.env.GEMINI_API_KEY = "test-gemini-key";

const { default: User } = await import("../models/User.js");
const { default: Preference } = await import("../models/Preference.js");
const { default: app } = await import("../server.js");
const { aiChatLimiter } = await import("../middleware/rateLimiter.js");

const CHAT_PATHS = ["/api/assistant/chat", "/api/chat"];

const USERS = {
  1: { id: 1, name: "Alice", purchasedCourses: [], settings: {} },
  2: { id: 2, name: "Bob", purchasedCourses: [], settings: {} },
};

const originals = {
  findByPk: User.findByPk,
  findOne: Preference.findOne,
};

const realFetch = globalThis.fetch;
let server;
let baseUrl;

before(async () => {
  User.findByPk = async (id) => USERS[id] ?? null;
  Preference.findOne = async () => null;

  globalThis.fetch = async (url, init) => {
    if (String(url).includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({
          candidates: [{ content: { role: "model", parts: [{ text: "Hello! How can I help?" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return realFetch(url, init);
  };

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findByPk = originals.findByPk;
  Preference.findOne = originals.findOne;
  globalThis.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  await aiChatLimiter.resetKey("user:1");
  await aiChatLimiter.resetKey("user:2");
});

const post = async (path, body, userId = 1) => {
  const headers = { "Content-Type": "application/json" };
  if (userId) {
    headers.Authorization = `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET)}`;
  }

  const response = await realFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
};

test("non-string payloads return 400 VALIDATION_ERROR and never 500 on both routes", async () => {
  const nonStringPayloads = [
    { message: { $ne: null } },
    { message: 12345 },
    { message: true },
    { message: null },
    { message: ["array", "message"] },
  ];

  for (const path of CHAT_PATHS) {
    for (const payload of nonStringPayloads) {
      await aiChatLimiter.resetKey("user:1");
      const { status, body } = await post(path, payload, 1);

      assert.equal(status, 400, `${path} should return 400 for non-string message`);
      assert.equal(body.success, false);
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.equal(body.error.message, "Validation failed");
      assert.ok(Array.isArray(body.error.details));
      const messageIssue = body.error.details.find((d) => d.path === "message");
      assert.ok(messageIssue, "details should report validation issue on 'message'");
    }
  }
});

test("empty or whitespace-only messages return 400 VALIDATION_ERROR on both routes", async () => {
  const emptyPayloads = [{ message: "" }, { message: "   " }, { message: "\t\n  " }, {}];

  for (const path of CHAT_PATHS) {
    for (const payload of emptyPayloads) {
      await aiChatLimiter.resetKey("user:1");
      const { status, body } = await post(path, payload, 1);

      assert.equal(status, 400, `${path} should return 400 for empty/missing message`);
      assert.equal(body.success, false);
      assert.equal(body.error.code, "VALIDATION_ERROR");
      const messageIssue = body.error.details.find((d) => d.path === "message");
      assert.ok(messageIssue, "details should report validation issue on 'message'");
    }
  }
});

test("1001-character message returns 400 VALIDATION_ERROR and 1000-character message succeeds on both routes", async () => {
  const tooLong = "x".repeat(1001);
  const maxAllowed = "x".repeat(1000);

  for (const path of CHAT_PATHS) {
    await aiChatLimiter.resetKey("user:1");
    const resTooLong = await post(path, { message: tooLong }, 1);
    assert.equal(resTooLong.status, 400, `${path} should return 400 for 1001 characters`);
    assert.equal(resTooLong.body.success, false);
    assert.equal(resTooLong.body.error.code, "VALIDATION_ERROR");
    const issue = resTooLong.body.error.details.find((d) => d.path === "message");
    assert.ok(issue, "details should report validation issue on 'message'");

    await aiChatLimiter.resetKey("user:1");
    const resMaxAllowed = await post(path, { message: maxAllowed }, 1);
    assert.equal(resMaxAllowed.status, 200, `${path} should accept 1000 characters`);
    assert.ok(resMaxAllowed.body.reply);
  }
});

test("POST /api/chat and POST /api/assistant/chat share the 20-req/min limiter", async () => {
  await aiChatLimiter.resetKey("user:1");

  // Send 10 requests to /api/assistant/chat
  for (let i = 0; i < 10; i++) {
    const res = await post("/api/assistant/chat", { message: `Assistant test ${i}` }, 1);
    assert.equal(res.status, 200, `Request ${i + 1} to /api/assistant/chat should succeed`);
  }

  // Send 10 requests to /api/chat
  for (let i = 0; i < 10; i++) {
    const res = await post("/api/chat", { message: `Chat test ${i}` }, 1);
    assert.equal(res.status, 200, `Request ${i + 11} to /api/chat should succeed`);
  }

  // 21st request to /api/chat must return 429
  const resChatBlocked = await post("/api/chat", { message: "21st chat request" }, 1);
  assert.equal(resChatBlocked.status, 429, "21st request to /api/chat should hit 429 quota");
  assert.equal(resChatBlocked.body.success, false);
  assert.match(resChatBlocked.body.error, /Too many chat requests/i);

  // 22nd request to /api/assistant/chat must also return 429
  const resAssistantBlocked = await post(
    "/api/assistant/chat",
    { message: "22nd assistant request" },
    1,
  );
  assert.equal(
    resAssistantBlocked.status,
    429,
    "22nd request to /api/assistant/chat should also hit 429 quota",
  );
  assert.equal(resAssistantBlocked.body.success, false);
  assert.match(resAssistantBlocked.body.error, /Too many chat requests/i);

  // Another user (user:2) should not be blocked
  const resUser2 = await post("/api/chat", { message: "User 2 request" }, 2);
  assert.equal(resUser2.status, 200, "User 2 should not be blocked by user 1 quota");
});
