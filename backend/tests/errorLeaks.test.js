import { test, describe, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.AI_SERVICE_URL = "http://ai.invalid";

const { default: app } = await import("../server.js");
const { sequelize } = await import("../config/db.js");
const { default: User } = await import("../models/User.js");
const { default: Notification } = await import("../models/Notification.js");
const { default: CourseReport } = await import("../models/CourseReport.js");
const { default: Report } = await import("../models/Report.js");
const { Course } = await import("../models/modelAssociations.js");
const { default: express } = await import("express");
const { default: requestContext } = await import("../middleware/requestContext.js");
const { default: errorHandler } = await import("../middleware/errorHandler.js");

const SECRET_DB = 'relation "Users" does not exist (SQLSTATE 42P01) at /srv/models/User.js:42';
const GENERIC = "Internal server error";
const STABLE_SYLLABUS = "Syllabus generation is temporarily unavailable";
const realFetch = globalThis.fetch;

const actor = {
  id: 1,
  name: "Root",
  email: "root@test.dev",
  role: "admin",
  purchasedCourses: [],
};
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
  // Authentication: protect() loads the token's user via User.findByPk
  mock.method(User, "findByPk", async (id) => (String(id) === String(actor.id) ? actor : null));
});

afterEach(() => mock.restoreAll());

const call = async (method, path, body, headers = {}) => {
  const res = await realFetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, body: JSON.parse(text) };
};

const loggedText = () => logSpy.mock.calls.map((c) => c.arguments.map(String).join(" ")).join("\n");

// Public 500 contract: exact shape, fixed message, id matches the header
function expectStable500(res, message = GENERIC) {
  assert.equal(res.status, 500);
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "requestId", "success"]);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, message);
  assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  for (const f of ["SQLSTATE", "relation", "User.js", "Users", "stack"]) {
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
  test("notifications: unread count", async () => {
    mock.method(Notification, "count", failingDb);
    const res = await call("GET", "/api/notifications/unread-count");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("notifications: list", async () => {
    mock.method(Notification, "findAll", failingDb);
    const res = await call("GET", "/api/notifications");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("notifications: mark one as read", async () => {
    mock.method(Notification, "findOne", failingDb);
    const res = await call("PATCH", "/api/notifications/1/read");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("notifications: mark all as read", async () => {
    mock.method(Notification, "update", failingDb);
    const res = await call("PATCH", "/api/notifications/read-all");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("notifications: clear all", async () => {
    mock.method(Notification, "destroy", failingDb);
    const res = await call("DELETE", "/api/notifications/clear");
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("course creation", async () => {
    mock.method(Course, "create", failingDb);
    const res = await call("POST", "/api/courses", {
      title: "Algebra",
      category: "Math",
      level: "Beginner",
      priceValue: 10,
      currency: "INR",
    });
    expectStable500(res);
    assert.ok(!("error" in res.body));
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("course report creation", async () => {
    mock.method(CourseReport, "create", failingDb);
    const res = await call("POST", "/api/course-reports", {
      reportType: "bug",
      description: "broken",
    });
    expectStable500(res);
    assert.ok(!("error" in res.body));
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("community moderation: transaction fails", async () => {
    mock.method(sequelize, "transaction", failingDb);
    const res = await call("PUT", "/api/community/reports/1", { action: "hidden" });
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });

  test("community moderation: query inside the transaction fails", async () => {
    mock.method(sequelize, "transaction", async (cb) => cb({}));
    mock.method(Report, "findByPk", failingDb);
    const res = await call("PUT", "/api/community/reports/1", { action: "hidden" });
    expectStable500(res);
    expectLogged(res, "SQLSTATE 42P01");
  });
});

describe("AI syllabus errors", () => {
  const course = { id: 1, title: "Algebra", category: "Math" };
  const path = "/api/courses/1/generate-syllabus";

  test("provider returns an error payload", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => ({ error: "401 invalid api key REDACTED_API_KEY for model xyz" }),
    }));
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    expectLogged(res, "REDACTED_API_KEY"); // provider text exists in logs only
  });

  test("AI service responds with a failure status (status is not forwarded)", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => ({ ok: false, status: 418 }));
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    expectLogged(res, "AI service responded 418");
  });
});

describe("intentional 4xx responses are preserved", () => {
  test("missing notification -> 404", async () => {
    mock.method(Notification, "findOne", async () => null);
    const res = await call("PATCH", "/api/notifications/999/read");
    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Notification not found");
  });

  test("unknown report -> 404", async () => {
    mock.method(sequelize, "transaction", async (cb) => cb({}));
    mock.method(Report, "findByPk", async () => null);
    const res = await call("PUT", "/api/community/reports/999", { action: "hidden" });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Report not found");
  });

  test("unknown course -> 404", async () => {
    mock.method(Course, "findByPk", async () => null);
    const res = await call("POST", "/api/courses/999/generate-syllabus");
    assert.equal(res.status, 404);
    assert.equal(res.body.message, "Course not found");
  });

  test("no token -> 401", async () => {
    const res = await realFetch(`${base}/api/notifications`);
    assert.equal(res.status, 401);
  });

  test("disallowed CORS origin -> 403 keeps its message", async () => {
    const res = await call("GET", "/api/notifications", undefined, {
      Origin: "https://evil.example",
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Not allowed by CORS");
  });

  test("malformed JSON -> 400 without parser internals", async () => {
    const res = await realFetch(`${base}/api/course-reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{bad",
    });
    const text = await res.text();
    assert.equal(res.status, 400);
    assert.ok(!/Unexpected token|position/i.test(text));
  });
});

describe("global error handler 5xx", () => {
  let mini, miniBase;

  before(async () => {
    const a = express();
    a.use(requestContext);
    a.get("/boom", () => {
      throw new Error(SECRET_DB);
    });
    a.get("/boom-503", (req, res, next) => {
      const e = new Error(SECRET_DB);
      e.status = 503;
      next(e);
    });
    a.use(errorHandler);

    mini = a.listen(0);
    await once(mini, "listening");
    miniBase = `http://127.0.0.1:${mini.address().port}`;
  });

  after(() => {
    mini.closeAllConnections?.();
    mini.close();
  });

  for (const path of ["/boom", "/boom-503"]) {
    test(`${path} returns the stable 500 contract`, async () => {
      const r = await realFetch(miniBase + path);
      const text = await r.text();
      const res = { status: r.status, headers: r.headers, text, body: JSON.parse(text) };
      expectStable500(res);
      expectLogged(res, "SQLSTATE 42P01");
    });
  }
});
