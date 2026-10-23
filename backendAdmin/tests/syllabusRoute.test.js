import assert from "node:assert/strict";
import http from "node:http";
import { after, afterEach, before, mock, test } from "node:test";
import jwt from "jsonwebtoken";
import express from "express";
import requestContext from "../middleware/requestContext.js";
import { Admin, Course, Lesson, Module } from "../models/index.js";
import { sequelize } from "../config/db.js";
import adminRoutes from "../routes/adminRoutes.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "syllabus-route-test-secret";
process.env.AI_SERVICE_URL = "http://provider.test";
process.env.AI_SERVICE_KEY = "route-test-credential";
process.env.SYLLABUS_SERVICE_TIMEOUT_MS = "15000";

const course = { id: 12, title: "Biology", category: "Science" };
const admin = { id: 7, role: "admin", status: "active" };
const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET);
const syllabus = {
  modules: [
    {
      title: "Foundations",
      lessons: [{ title: "Cells", duration: "6 mins", type: "video" }],
    },
  ],
};

const app = express();
app.use(requestContext);
app.use(express.json());

const audits = [];
app.use((req, res, next) => {
  const audit = {
    reqAdded: [],
    reqRemoved: [],
    resAdded: [],
    resRemoved: [],
    cleanupWaiters: new Set(),
  };
  const notifyCleanup = () => {
    for (const check of audit.cleanupWaiters) check();
  };
  const reqOn = req.on.bind(req);
  const reqOff = req.off.bind(req);
  const resOn = res.on.bind(res);
  const resOff = res.off.bind(res);

  req.on = (event, listener) => {
    if (event === "aborted") audit.reqAdded.push(listener);
    return reqOn(event, listener);
  };
  req.off = (event, listener) => {
    if (event === "aborted") {
      audit.reqRemoved.push(listener);
      notifyCleanup();
    }
    return reqOff(event, listener);
  };
  res.on = (event, listener) => {
    if (event === "close") audit.resAdded.push(listener);
    return resOn(event, listener);
  };
  res.off = (event, listener) => {
    if (event === "close") {
      audit.resRemoved.push(listener);
      notifyCleanup();
    }
    return resOff(event, listener);
  };
  req.syllabusAudit = audit;
  audits.push(audit);
  next();
});
app.use("/api/admin", adminRoutes);

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections?.();
  server.close();
});

afterEach(() => {
  mock.restoreAll();
  process.env.AI_SERVICE_KEY = "route-test-credential";
  process.env.SYLLABUS_SERVICE_TIMEOUT_MS = "15000";
  app.locals.shutdownSignal = undefined;
});

const request = (path, { auth = true } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method: "POST",
        headers: auth ? { Authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      },
    );
    req.on("error", (error) => reject(error));
    req.end();
  });

const installAuthenticatedModels = () => {
  mock.method(Admin, "findByPk", async () => admin);
  mock.method(Course, "findByPk", async () => course);
  mock.method(sequelize, "transaction", async (callback) => callback({ id: "tx" }));
  mock.method(Module, "create", async () => ({ id: 31 }));
  mock.method(Lesson, "create", async () => ({}));
};

const assertListenersRemoved = (audit) => {
  assert.equal(audit.reqAdded.length, 1);
  assert.deepEqual(audit.reqRemoved, audit.reqAdded);
  assert.equal(audit.resAdded.length, 1);
  assert.deepEqual(audit.resRemoved, audit.resAdded);
};

const waitForCleanup = (audit) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      audit.cleanupWaiters.delete(check);
      reject(new Error("Timed out waiting for request listener cleanup"));
    }, 1000);
    const check = () => {
      if (
        audit.reqAdded.length === audit.reqRemoved.length &&
        audit.resAdded.length === audit.resRemoved.length
      ) {
        clearTimeout(timeout);
        audit.cleanupWaiters.delete(check);
        resolve();
      }
    };
    audit.cleanupWaiters.add(check);
    check();
  });

const withinOneSecond = (promise, label) => {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 1000);
    }),
  ]).finally(() => clearTimeout(timeout));
};

test("rejects unauthenticated requests before reaching the provider", async () => {
  const findCourse = mock.method(Course, "findByPk", async () => course);
  const providerFetch = mock.method(globalThis, "fetch", async () => {
    throw new Error("provider must not be called");
  });

  const result = await request("/api/admin/courses/12/generate-syllabus", { auth: false });

  assert.equal(result.status, 401);
  assert.equal(findCourse.mock.calls.length, 0);
  assert.equal(providerFetch.mock.calls.length, 0);
});

test("returns 404 when the requested course does not exist", async () => {
  mock.method(Admin, "findByPk", async () => admin);
  mock.method(Course, "findByPk", async () => null);
  const providerFetch = mock.method(globalThis, "fetch", async () => {
    throw new Error("provider must not be called");
  });

  const result = await request("/api/admin/courses/404/generate-syllabus");

  assert.equal(result.status, 404);
  assert.equal(providerFetch.mock.calls.length, 0);
});

test("generates and persists a valid syllabus using the shared credential and transaction", async () => {
  installAuthenticatedModels();
  const providerFetch = mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options.headers["x-service-key"], "route-test-credential");
    assert.equal(options.headers["Content-Type"], "application/json");
    return new Response(JSON.stringify(syllabus), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const result = await request("/api/admin/courses/12/generate-syllabus");

  assert.equal(result.status, 200);
  assert.equal(providerFetch.mock.calls.length, 1);
  assert.equal(sequelize.transaction.mock.calls.length, 1);
  assert.equal(Module.create.mock.calls[0].arguments[1].transaction.id, "tx");
  assert.equal(Lesson.create.mock.calls[0].arguments[1].transaction.id, "tx");
  assert.deepEqual(result.body.data, syllabus);
  assertListenersRemoved(audits.at(-1));
});

test("returns retryable 503 for a provider timeout", async () => {
  installAuthenticatedModels();
  process.env.SYLLABUS_SERVICE_TIMEOUT_MS = "5";
  mock.method(
    globalThis,
    "fetch",
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  );

  const result = await request("/api/admin/courses/12/generate-syllabus");

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "PROVIDER_TIMEOUT");
  assert.equal(result.body.retryable, true);
  assert.equal(sequelize.transaction.mock.calls.length, 0);
  assertListenersRemoved(audits.at(-1));
});

test("returns a retryable service response for transient provider failures", async () => {
  installAuthenticatedModels();
  mock.method(globalThis, "fetch", async () => new Response("", { status: 503 }));

  const result = await request("/api/admin/courses/12/generate-syllabus");

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.body.retryable, true);
  assertListenersRemoved(audits.at(-1));
});

test("does not classify provider authentication failures as retryable", async () => {
  installAuthenticatedModels();
  const log = mock.method(console, "error", () => {});
  mock.method(globalThis, "fetch", async () => new Response("secret-token", { status: 401 }));

  const result = await request("/api/admin/courses/12/generate-syllabus");

  assert.equal(result.status, 502);
  assert.equal(result.body.code, "PROVIDER_AUTHENTICATION");
  assert.equal(result.body.retryable, false);
  assert.ok(!JSON.stringify(result.body).includes("secret-token"));
  assert.ok(!JSON.stringify(log.mock.calls).includes("secret-token"));
});

test("rejects malformed provider output before opening a transaction", async () => {
  installAuthenticatedModels();
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ modules: [{ title: "Empty", lessons: [] }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );

  const result = await request("/api/admin/courses/12/generate-syllabus");

  assert.equal(result.status, 502);
  assert.equal(result.body.code, "INVALID_PROVIDER_RESPONSE");
  assert.equal(result.body.retryable, false);
  assert.equal(sequelize.transaction.mock.calls.length, 0);
});

test("distinguishes a server shutdown cancellation", async () => {
  installAuthenticatedModels();
  const shutdown = new AbortController();
  app.locals.shutdownSignal = shutdown.signal;
  mock.method(
    globalThis,
    "fetch",
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
        shutdown.abort();
      }),
  );

  const result = await request("/api/admin/courses/12/generate-syllabus");

  assert.equal(result.status, 503);
  assert.equal(result.body.code, "SERVER_SHUTDOWN");
  assert.equal(result.body.retryable, true);
  assertListenersRemoved(audits.at(-1));
});

test("client disconnect aborts the provider call and removes request listeners", async () => {
  installAuthenticatedModels();
  let providerSignal;
  let called;
  const providerCalled = new Promise((resolve) => (called = resolve));
  let aborted;
  const providerAborted = new Promise((resolve) => (aborted = resolve));
  mock.method(globalThis, "fetch", (_url, { signal }) => {
    providerSignal = signal;
    called();
    return new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted();
          reject(new Error("aborted"));
        },
        { once: true },
      );
    });
  });

  const req = http.request(`${baseUrl}/api/admin/courses/12/generate-syllabus`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  req.on("error", () => {});
  req.end();

  await withinOneSecond(providerCalled, "provider call");
  const audit = audits.at(-1);
  const listenerCleanup = waitForCleanup(audit);
  req.destroy();
  await withinOneSecond(providerAborted, "provider abort");
  await withinOneSecond(listenerCleanup, "request listener cleanup");
  assert.equal(providerSignal.aborted, true);
  assertListenersRemoved(audit);
});
