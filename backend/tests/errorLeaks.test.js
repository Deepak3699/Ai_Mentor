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
const { sendServerError } = await import("../utils/apiError.js");

const SECRET_DB = 'relation "Users" does not exist (SQLSTATE 42P01) at /srv/models/User.js:42';
const GENERIC = "Internal server error";
const STABLE_SYLLABUS = "Syllabus generation is temporarily unavailable";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOG_LEVELS = ["error", "warn", "info", "log"];
const realFetch = globalThis.fetch;

const actor = {
  id: 1,
  name: "Root",
  email: "root@test.dev",
  role: "admin",
  purchasedCourses: [],
};
const token = jwt.sign({ id: actor.id, role: actor.role }, process.env.JWT_SECRET);

let server, base, logSpies, currentUser;

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
  // Spy on EVERY log level: a leak through warn/info/log must not go unnoticed
  logSpies = LOG_LEVELS.map((level) => mock.method(console, level, () => {}));
  // Authentication: protect() loads the token's user via User.findByPk.
  // Tests can change currentUser (e.g. to a non-admin role).
  currentUser = actor;
  mock.method(User, "findByPk", async (id) =>
    String(id) === String(actor.id) ? currentUser : null,
  );
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

// For responses we do not want to assume are JSON (e.g. auth failures)
const raw = async (path, headers = {}) => {
  const res = await realFetch(base + path, { headers });
  return { status: res.status, headers: res.headers, text: await res.text() };
};

const loggedText = () =>
  logSpies
    .flatMap((spy) =>
      spy.mock.calls.map((c) =>
        c.arguments.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
      ),
    )
    .join("\n");

// Public 500 contract: fixed message, request id matches the header.
// `error` is a deprecated mirror of `message` kept for existing clients; if present it must
// be identical to `message` (never anything more detailed).
function expectStable500(res, message = GENERIC) {
  assert.equal(res.status, 500);
  const keys = Object.keys(res.body).sort();
  for (const required of ["message", "requestId", "success"]) {
    assert.ok(keys.includes(required), `response is missing "${required}"`);
  }
  for (const k of keys) {
    assert.ok(["error", "message", "requestId", "success"].includes(k), `unexpected key "${k}"`);
  }
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, message);
  if ("error" in res.body) assert.equal(res.body.error, res.body.message);
  assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  for (const f of ["SQLSTATE", "relation", "User.js", "Users", "stack"]) {
    assert.ok(!res.text.includes(f), `response leaked "${f}"`);
  }
}

// Logs keep safe facts (request id, category, code) and never the error message
function expectLogged(res, category = "database") {
  const logged = loggedText();
  assert.ok(logged.includes(res.body.requestId), "log line is missing the request id");
  assert.ok(logged.includes(`"category":"${category}"`), "log is missing the error category");
  assert.ok(logged.includes('"dbCode":"42P01"'), "log is missing the safe database code");
  assert.ok(!logged.includes("SQLSTATE"), "message leaked into logs");
  assert.ok(!logged.includes("/srv/models"), "file path leaked into logs");
  assert.ok(!logged.includes("User.js"), "message fragment leaked into logs");
  assert.ok(!logged.includes(token), "auth token must never be logged");
}

const failingDb = async () => {
  const e = new Error(SECRET_DB);
  e.name = "SequelizeDatabaseError";
  e.parent = { code: "42P01" };
  throw e;
};

describe("unexpected errors are sanitized", () => {
  test("notifications: unread count", async () => {
    mock.method(Notification, "count", failingDb);
    const res = await call("GET", "/api/notifications/unread-count");
    expectStable500(res);
    expectLogged(res);
  });

  test("notifications: list", async () => {
    mock.method(Notification, "findAll", failingDb);
    const res = await call("GET", "/api/notifications");
    expectStable500(res);
    expectLogged(res);
  });

  test("notifications: mark one as read", async () => {
    mock.method(Notification, "findOne", failingDb);
    const res = await call("PATCH", "/api/notifications/1/read");
    expectStable500(res);
    expectLogged(res);
  });

  test("notifications: mark all as read", async () => {
    mock.method(Notification, "update", failingDb);
    const res = await call("PATCH", "/api/notifications/read-all");
    expectStable500(res);
    expectLogged(res);
  });

  test("notifications: clear all", async () => {
    mock.method(Notification, "destroy", failingDb);
    const res = await call("DELETE", "/api/notifications/clear");
    expectStable500(res);
    expectLogged(res);
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
    expectLogged(res);
  });

  test("course creation: validation failure returns safe 400 with request ID", async () => {
    const res = await call("POST", "/api/courses", {
      title: "",
      category: "Math",
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, "Validation failed");
    assert.equal(res.body.requestId, res.headers.get("x-request-id"));
    assert.ok(Array.isArray(res.body.error.details));
    assert.equal(res.body.error.details[0].path, "title");
    assert.ok(!res.text.includes("Internal server"));
  });

  test("course report creation", async () => {
    // The controller opens a transaction first, so run its callback without a database
    mock.method(sequelize, "transaction", async (cb) => cb({}));
    mock.method(CourseReport, "create", failingDb);
    const res = await call("POST", "/api/course-reports", {
      reportType: "bug",
      description: "broken",
    });
    expectStable500(res);
    expectLogged(res);
  });

  test("community moderation: transaction fails", async () => {
    mock.method(sequelize, "transaction", failingDb);
    const res = await call("PUT", "/api/community/reports/1", { action: "hidden" });
    expectStable500(res);
    expectLogged(res);
  });

  test("community moderation: query inside the transaction fails", async () => {
    mock.method(sequelize, "transaction", async (cb) => cb({}));
    mock.method(Report, "findByPk", failingDb);
    const res = await call("PUT", "/api/community/reports/1", { action: "hidden" });
    expectStable500(res);
    expectLogged(res);
  });
});

describe("dependency failures and programming errors", () => {
  test("database connection failure is classified, not described", async () => {
    mock.method(Notification, "count", async () => {
      const e = new Error("connect ECONNREFUSED 10.0.0.5:5432 password=TEST_PASSWORD");
      e.name = "SequelizeConnectionError";
      throw e;
    });
    const res = await call("GET", "/api/notifications/unread-count");
    expectStable500(res);
    const logged = loggedText();
    assert.ok(logged.includes(res.body.requestId));
    assert.ok(logged.includes('"category":"database_connection"'));
    assert.ok(!logged.includes("10.0.0.5") && !logged.includes("TEST_PASSWORD"));
    assert.ok(!res.text.includes("10.0.0.5") && !res.text.includes("TEST_PASSWORD"));
  });

  test("unexpected programming error keeps a useful category", async () => {
    mock.method(Notification, "count", async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'secret-field')");
    });
    const res = await call("GET", "/api/notifications/unread-count");
    expectStable500(res);
    const logged = loggedText();
    assert.ok(logged.includes('"category":"programming"'));
    assert.ok(!logged.includes("secret-field"));
  });
});

describe("secret-like text never reaches responses or any log level", () => {
  const CANARIES = [
    "REDACTED_API_KEY", // API key
    "sk-header-canary", // key sent as a request header
    "postgres://admin:TEST-PASSWORD@db.internal:5432/app", // connection string
    "body-canary-9f3a", // request body content
    "authorization-canary-7d2f", // authorisation header
    "TEST_PASSWORD-password", // password field in the body
    "invalid api key", // provider-supplied text
    "SELECT * FROM", // SQL attached to the error
    "/srv/models", // file path
    "query-canary", // value in the query string
    "cookie-canary", // cookie value
  ];

  test("database error carrying every kind of secret", async () => {
    mock.method(sequelize, "transaction", async (cb) => cb({}));
    mock.method(CourseReport, "create", async () => {
      const e = new Error(
        "connect failed postgres://admin:TEST-PASSWORD@db.internal:5432/app invalid api key REDACTED_API_KEY",
      );
      e.name = "SequelizeConnectionError";
      e.parent = {
        code: "ECONNREFUSED",
        sql: "SELECT * FROM x WHERE note='body-canary-9f3a'",
      };
      e.stack = `${e.name}: ${e.message}\n    at run (/srv/models/CourseReport.js:9:1)`;
      throw e;
    });

    const res = await call(
      "POST",
      "/api/course-reports?token=query-canary",
      {
        reportType: "bug",
        description: "body-canary-9f3a",
        password: "TEST_PASSWORD-password",
      },
      {
        "X-Api-Key": "sk-header-canary",
        Authorization: `Bearer ${token}`,
        Cookie: "session=cookie-canary",
      },
    );

    assert.equal(res.status, 500);
    const logged = loggedText();

    for (const secret of [...CANARIES, token]) {
      assert.ok(!res.text.includes(secret), `response leaked "${secret}"`);
      assert.ok(!logged.includes(secret), `log leaked "${secret}"`);
    }

    // The log should remain useful without exposing secrets.
    assert.ok(logged.includes(res.body.requestId));
    assert.ok(logged.includes('"category":"database_connection"'));
    assert.ok(logged.includes("course-reports"));
  });

  test("provider text thrown as a plain error is not logged", async () => {
    mock.method(Notification, "count", async () => {
      throw new Error(
        "provider said: invalid api key REDACTED_API_KEY, Authorization: Bearer abc.def.ghi",
      );
    });
    const res = await call("GET", "/api/notifications/unread-count");
    const logged = loggedText();
    for (const secret of ["REDACTED_API_KEY", "invalid api key", "Bearer abc.def.ghi"]) {
      assert.ok(!res.text.includes(secret) && !logged.includes(secret), `leaked "${secret}"`);
    }
  });
});

describe("AI syllabus errors", () => {
  const course = { id: 1, title: "Algebra", category: "Math" };
  const path = "/api/courses/1/generate-syllabus";

  test("provider error payload: no secret in response or logs", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => ({
      ok: true,
      json: async () => ({ error: "401 invalid api key REDACTED_API_KEY for model xyz" }),
    }));
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    const logged = loggedText();
    assert.ok(logged.includes("AI_SERVICE_ERROR_PAYLOAD"));
    assert.ok(!logged.includes("REDACTED_API_KEY"));
    assert.ok(!logged.includes("invalid api key"));
  });

  test("AI failure status is logged as a number, not forwarded", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => ({ ok: false, status: 418 }));
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    assert.ok(loggedText().includes('"upstreamStatus":418'));
  });

  test("AI service unreachable: stable message, no internals", async () => {
    mock.method(Course, "findByPk", async () => course);
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.9:8000");
    });
    const res = await call("POST", path);
    expectStable500(res, STABLE_SYLLABUS);
    assert.ok(!loggedText().includes("10.0.0.9"));
    assert.ok(!res.text.includes("10.0.0.9"));
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
    assert.equal(res.body.error.message, "Course not found");
  });

  test("disallowed CORS origin -> 403 keeps its message and carries a request id", async () => {
    const res = await call("GET", "/api/notifications", undefined, {
      Origin: "https://evil.example",
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Not allowed by CORS");
    // requires requestContext to be mounted before cors() in server.js
    assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  });

  test("malformed JSON -> 400 without parser internals, with request id", async () => {
    const res = await realFetch(`${base}/api/course-reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{bad",
    });
    const text = await res.text();
    assert.equal(res.status, 400);
    assert.ok(!/Unexpected token|position/i.test(text));
    assert.equal(JSON.parse(text).requestId, res.headers.get("x-request-id"));
  });

  test("oversized body -> 413 with request id", async () => {
    const res = await call("POST", "/api/course-reports", {
      reportType: "bug",
      description: "x".repeat(300_000),
    });
    assert.equal(res.status, 413);
    assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  });
});

describe("authentication and authorization", () => {
  test("no token -> 401", async () => {
    const res = await raw("/api/notifications");
    assert.equal(res.status, 401);
  });

  test("garbage token -> 401, token text not echoed or logged", async () => {
    const bad = "not.a.jwt-canary";
    const res = await raw("/api/notifications", { Authorization: `Bearer ${bad}` });
    assert.equal(res.status, 401);
    assert.ok(!res.text.includes(bad));
    assert.ok(!loggedText().includes(bad));
  });

  test("expired token -> 401", async () => {
    const expired = jwt.sign({ id: actor.id, role: actor.role }, process.env.JWT_SECRET, {
      expiresIn: -10,
    });
    const res = await raw("/api/notifications", { Authorization: `Bearer ${expired}` });
    assert.equal(res.status, 401);
    assert.ok(!loggedText().includes(expired));
  });

  test("valid token for a user that no longer exists -> 401", async () => {
    const ghost = jwt.sign({ id: 999, role: "admin" }, process.env.JWT_SECRET);
    const res = await raw("/api/notifications", { Authorization: `Bearer ${ghost}` });
    assert.equal(res.status, 401);
  });

  test("non-admin user on an admin-only route -> 403", async () => {
    currentUser = { ...actor, role: "student" };
    const res = await call("POST", "/api/courses", {
      title: "Algebra",
      category: "Math",
      level: "Beginner",
      priceValue: 10,
      currency: "INR",
    });
    assert.equal(res.status, 403);
    assert.ok(!res.text.includes("SQLSTATE"));
  });
});

describe("request ids", () => {
  test("server-generated, unique per request, client value ignored", async () => {
    mock.method(Notification, "count", failingDb);
    const a = await call("GET", "/api/notifications/unread-count", undefined, {
      "X-Request-Id": "attacker-forged-id",
    });
    const b = await call("GET", "/api/notifications/unread-count");
    assert.match(a.body.requestId, UUID);
    assert.notEqual(a.body.requestId, b.body.requestId);
    assert.equal(a.body.requestId, a.headers.get("x-request-id"));
    assert.ok(!a.text.includes("attacker-forged-id"));
    assert.ok(!loggedText().includes("attacker-forged-id"));
  });
});

describe("global error handler", () => {
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
    // 4xx from a library-style error that is NOT marked public: message must be hidden
    a.get("/leaky-400", () => {
      throw Object.assign(new Error("db password TEST_PASSWORD"), { status: 400 });
    });
    // 4xx explicitly marked public keeps its message
    a.get("/public-403", () => {
      throw Object.assign(new Error("Not allowed by CORS"), { status: 403, expose: true });
    });
    a.get("/conflict", () => {
      throw Object.assign(new Error("Already exists"), { status: 409, expose: true });
    });
    // Response already started, then a failure
    a.get("/partial", (req, res) => {
      res.write("partial");
      throw new Error(SECRET_DB);
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

  const miniCall = async (path) => {
    const r = await realFetch(miniBase + path);
    const text = await r.text();
    return { status: r.status, headers: r.headers, text, body: JSON.parse(text) };
  };

  for (const path of ["/boom", "/boom-503"]) {
    test(`${path}: any 5xx collapses to the stable 500 contract`, async () => {
      const res = await miniCall(path);
      expectStable500(res);
      const logged = loggedText();
      assert.ok(logged.includes(res.body.requestId), "log line is missing the request id");
      assert.ok(logged.includes('"category":"unknown"'));
      assert.ok(!logged.includes("SQLSTATE"), "message leaked into logs");
      assert.ok(!logged.includes("/srv/models"), "file path leaked into logs");
    });
  }

  test("unmarked 4xx: message hidden, standard status text used", async () => {
    const res = await miniCall("/leaky-400");
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Bad Request");
    assert.ok(!res.text.includes("TEST_PASSWORD"));
    assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  });

  test("public 4xx keeps its message", async () => {
    const res = await miniCall("/public-403");
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "Not allowed by CORS");
  });

  test("conflict -> 409 keeps its message", async () => {
    const res = await miniCall("/conflict");
    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Already exists");
    assert.equal(res.body.requestId, res.headers.get("x-request-id"));
  });

  test("real socket: failure after the response started is logged and the connection closed", async () => {
    await assert.rejects(async () => {
      const r = await realFetch(miniBase + "/partial");
      await r.text();
    });
    const logged = loggedText();
    assert.ok(logged.includes('"context":"GLOBAL_ERROR_HANDLER_HEADERS_SENT"'));
    assert.ok(!logged.includes("SQLSTATE"));
  });
});

describe("headers already sent (unit level)", () => {
  const req = { id: "rid-1", method: "GET", baseUrl: "", route: { path: "/x" } };
  const fakeRes = () => ({
    headersSent: true,
    status: mock.fn(),
    json: mock.fn(),
    destroy: mock.fn(),
  });

  function assertSafeForward(next, res) {
    assert.equal(next.mock.callCount(), 1, "error must be forwarded to Express");
    const forwarded = next.mock.calls[0].arguments[0];
    assert.ok(!forwarded.message.includes("SQLSTATE"), "forwarded message leaks");
    assert.ok(!String(forwarded.stack).includes("SQLSTATE"), "forwarded stack leaks");
    assert.equal(res.status.mock.callCount(), 0, "must not write a second response");
    assert.equal(res.json.mock.callCount(), 0, "must not write a second body");
    const logged = loggedText();
    assert.ok(logged.includes("rid-1"), "must still be logged with the request id");
    assert.ok(!logged.includes("SQLSTATE"), "log leaks the message");
  }

  test("controller path: sendServerError logs, then forwards a safe error", () => {
    const next = mock.fn();
    const res = fakeRes();
    sendServerError(req, res, new Error(SECRET_DB), "ctx", next);
    assertSafeForward(next, res);
  });

  test("global handler: logs, then forwards a safe error", () => {
    const next = mock.fn();
    const res = fakeRes();
    errorHandler(new Error(SECRET_DB), req, res, next);
    assertSafeForward(next, res);
  });

  test("no next available: connection is destroyed, error is not swallowed", () => {
    const res = fakeRes();
    sendServerError(req, res, new Error(SECRET_DB), "ctx");
    assert.equal(res.destroy.mock.callCount(), 1);
    assert.ok(loggedText().includes("rid-1"));
  });
});
