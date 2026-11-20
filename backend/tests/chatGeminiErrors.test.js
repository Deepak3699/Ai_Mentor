import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.AI_SERVICE_URL = "http://127.0.0.1:8000";
process.env.AI_SERVICE_KEY = "fake-test-service-key";

const { default: User } = await import("../models/User.js");
const { default: Preference } = await import("../models/Preference.js");
const { chatWithAssistant } = await import("../controllers/chatController.js");

const SECRET = "SECRET-PROMPT-TEXT-123";

const originals = {
  userFindByPk: User.findByPk,
  preferenceFindOne: Preference.findOne,
  fetch: globalThis.fetch,
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

const stubAIService = (status, body) => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8000/assistant/chat");
    assert.equal(options.headers["x-service-key"], "fake-test-service-key");

    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
};

const chat = async () => {
  const { res, state } = response();

  await chatWithAssistant(
    {
      id: "req-42",
      user: { id: 1 },
      body: { message: SECRET },
    },
    res,
  );

  return state;
};

beforeEach(() => {
  User.findByPk = async () => ({
    id: 1,
    name: "Sam",
    purchasedCourses: [],
    settings: {},
  });

  Preference.findOne = async () => null;
});

afterEach(() => {
  globalThis.fetch = originals.fetch;
});

after(() => {
  User.findByPk = originals.userFindByPk;
  Preference.findOne = originals.preferenceFindOne;
});

test("chat returns the AI service reply and validated route on success", async () => {
  stubAIService(200, {
    reply: "Open settings.",
    route: "/settings",
    error: null,
  });

  const { statusCode, body } = await chat();

  assert.equal(statusCode, 200);
  assert.deepEqual(body, {
    reply: "Open settings.",
    route: "/settings",
  });
});

const failures = [
  ["429", 429, "rate_limited", /too many requests/i],
  ["500", 500, "unavailable", /temporarily unavailable/i],
  ["503", 503, "unavailable", /temporarily unavailable/i],
  ["401", 401, "generic", /currently unavailable/i],
];

for (const [label, status, category, wording] of failures) {
  test(`chat returns a safe fallback on AI service ${label}`, async () => {
    stubAIService(status, {
      detail: SECRET,
    });

    const { statusCode, body } = await chat();

    assert.equal(statusCode, 200);
    assert.equal(body.error, category);
    assert.equal(body.route, null);
    assert.match(body.reply, wording);
    assert.ok(!JSON.stringify(body).includes(SECRET));
  });
}

test("chat returns a safe fallback on AI service network failure", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  const { statusCode, body } = await chat();

  assert.equal(statusCode, 200);
  assert.equal(body.error, "network");
  assert.match(body.reply, /temporarily unavailable/i);
});

test("chat handles malformed AI service responses safely", async () => {
  globalThis.fetch = async () =>
    new Response("invalid-json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const { statusCode, body } = await chat();

  assert.equal(statusCode, 200);
  assert.equal(body.error, "malformed_response");
  assert.equal(body.route, null);
  assert.ok(!JSON.stringify(body).includes(SECRET));
});
