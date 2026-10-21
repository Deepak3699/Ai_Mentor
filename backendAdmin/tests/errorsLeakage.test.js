import { test, describe, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai.invalid";

const { default: app } = await import("../server.js");
const { Admin, User, Course } = await import("../models/index.js");

const SECRET_DB = 'relation "Users" does not exist (SQLSTATE 42P01) at /srv/models/User.js:42';
const GENERIC = "Internal server error";
const STABLE_SYLLABUS = "Syllabus generation is temporarily unavailable";
const realFetch = globalThis.fetch;

const actor = { id: 1, name: "Root", email: "root@test.dev", role: "superadmin", status: "active" };
const token = jwt.sign({ id: actor.id, role: actor.role }, process.env.JWT_SECRET);

let server, base, logSpy;

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections?.();
  server.close();
});

beforeEach(() => {
  logSpy = mock.method(console, "error", () => {});

  mock.method(Admin, "findByPk", async (id) => {
    if (String(id) === String(actor.id)) return actor;
    throw new Error(SECRET_DB);
  });
});

afterEach(() => mock.restoreAll());

const call = async (method, path, body) => {
  const res = await realFetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: JSON.parse(text) };
};

const loggedText = () => logSpy.mock.calls.map((c) => String(c.arguments[0])).join("\n");

// Public 500 contract: exact shape, fixed message, id matches the header
function expectStable500(res, message = GENERIC) {
  assert.equal(res.status, 500);
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "requestId", "success"]);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, message);
  assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  for (const f of ["SQLSTATE", "relation", "User.js", "Users"]) {
    assert.ok(!res.text.includes(f), `response leaked "${f}"`);
  }
}

// Details stay in server logs, tied to the same request id, without secrets
function expectLogged(res, fragment) {
  const logged = loggedText();
  assert.ok(logged.includes(res.body.requestId), "log line is missing the request id");
  assert.ok(logged.includes(fragment), `log is missing "${fragment}"`);
  assert.ok(!logged.includes(token), "auth token must never be logged");
}

const failingDb = async () => {
  throw new Error(SECRET_DB);
};

describe("unexpected errors are sanitized", () => {
  test("list users", async () => {
    mock.method(User, "findAndCountAll", failingDb);
    const res = await call("GET", "/api/admin/users");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("update user status", async () => {
    mock.method(User, "findByPk", failingDb);
    const res = await call("PATCH", "/api/admin/users/5/status", { status: "active" });
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("toggle user block", async () => {
    mock.method(User, "findByPk", failingDb);
    const res = await call("PATCH", "/api/admin/users/5/block");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("delete user", async () => {
    mock.method(User, "findByPk", failingDb);
    const res = await call("DELETE", "/api/admin/users/5");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("update admin status", async () => {
    // Admin.findByPk(2) rejects via the beforeEach mock
    const res = await call("PATCH", "/api/admin/admins/2/status", { status: "on-hold" });
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });
});

describe("AI syllabus errors", () => {
  const course = { id: 1, title: "Algebra", category: "Math" };
  const path = "/api/admin/courses/1/generate-syllabus";

  test("provider returns an error payload", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => ({ error: "401 invalid api key sk-abc123 for model xyz" }),
    }));
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    expectLogged(res, "sk-abc123"); // provider text exists in logs only
  });

  test("AI service responds with a failure status", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    expectLogged(res, "AI service responded 503");
  });

  test("AI service is down (ECONNREFUSED)", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => {
      throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    });
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    expectLogged(res, "fetch failed");
  });
});

describe("intentional 4xx responses are preserved", () => {
  test("invalid user status -> 400", async () => {
    const res = await call("PATCH", "/api/admin/users/5/status", { status: "bogus" });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Invalid status");
  });

  test("missing user -> 404", async () => {
    mock.method(User, "findByPk", async () => null);
    const res = await call("DELETE", "/api/admin/users/999");
    assert.equal(res.status, 404);
    assert.equal(res.body.message, "User not found");
  });

  test("cannot change own admin status -> 400", async () => {
    const res = await call("PATCH", "/api/admin/admins/1/status", { status: "on-hold" });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "You cannot change your own status");
  });

  test("no token -> 401", async () => {
    const res = await realFetch(`${base}/api/admin/users`);
    assert.equal(res.status, 401);
  });

  test("malformed JSON -> 400 without parser internals", async () => {
    const res = await realFetch(`${base}/api/admin/users/5/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    });
    const text = await res.text();
    assert.equal(res.status, 400);
    assert.ok(!/Unexpected token|position/i.test(text));
  });
});
