import { test, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { Op } = await import("sequelize");
const { default: User } = await import("../models/User.js");
const { default: CourseReport } = await import("../models/CourseReport.js");
const { default: AdminNotification } = await import("../models/AdminNotification.js");
const { default: Notification } = await import("../models/Notification.js");
const { sequelize } = await import("../config/db.js");
const { default: reportRoutes } = await import("../routes/reportRoutes.js");
const { MODERATOR_ROLES, createReport } = await import("../controllers/reportController.js");

const REPORTER_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_ID = "22222222-2222-2222-2222-222222222222";
const SUPERADMIN_ID = "33333333-3333-3333-3333-333333333333";
const SUPERADMIN_2_ID = "44444444-4444-4444-4444-444444444444";
const OTHER_USER_ID = "55555555-5555-5555-5555-555555555555";

const originals = {
  userFindByPk: User.findByPk,
  userFindAll: User.findAll,
  reportCreate: CourseReport.create,
  notificationCreate: Notification.create,
  adminNotificationCreate: AdminNotification.create,
  transaction: sequelize.transaction,
};

// ---------------------------------------------------------------------------
// In-memory "database" with real commit / rollback semantics.
// Writes made inside a transaction are buffered and only reach `committed`
// when the transaction callback resolves and the commit succeeds. A write made
// without a transaction goes straight to `committed` and is recorded in
// `outsideTransaction`, so tests can prove every write took part in the
// transaction.
// ---------------------------------------------------------------------------
const users = new Map();
let committed;
let outsideTransaction;
let transactions;
let failures;
let moderatorFindAllOptions;
let notificationAttempts;

const resetDb = () => {
  committed = { reports: [], notifications: [], adminNotifications: [] };
  outsideTransaction = [];
  transactions = [];
  failures = {};
  moderatorFindAllOptions = [];
  notificationAttempts = 0;
};

const failOnce = (key, error = new Error(`injected ${key} failure`)) => {
  failures[key] = error;
};

const maybeFail = (key) => {
  const error = failures[key];
  if (error) {
    delete failures[key];
    throw error;
  }
};

const write = (table, row, options = {}) => {
  if (options.transaction) {
    options.transaction.buffer.push({ table, row });
  } else {
    outsideTransaction.push(table);
    committed[table].push(row);
  }
  return row;
};

const roleMatches = (where, user) => {
  const condition = where?.role;
  if (condition === undefined) return true;
  if (condition && typeof condition === "object" && Array.isArray(condition[Op.in])) {
    return condition[Op.in].includes(user.role);
  }
  return user.role === condition;
};

const installFakes = () => {
  User.findByPk = async (id) => users.get(String(id)) ?? null;

  User.findAll = async (options = {}) => {
    moderatorFindAllOptions.push(options);
    maybeFail("moderatorLookup");
    return [...users.values()].filter((user) => roleMatches(options.where, user));
  };

  CourseReport.create = async (values, options) => {
    maybeFail("reportCreate");
    return write("reports", { id: `report-${committed.reports.length + 1}`, ...values }, options);
  };

  Notification.create = async (values, options) => {
    notificationAttempts += 1;
    if (failures.notificationAt === notificationAttempts) {
      delete failures.notificationAt;
      throw new Error("injected moderator notification failure");
    }
    return write("notifications", { id: `n-${notificationAttempts}`, ...values }, options);
  };

  AdminNotification.create = async (values, options) => {
    maybeFail("dashboardNotification");
    return write("adminNotifications", { id: "admin-n", ...values }, options);
  };

  // Managed transaction: resolve => commit, reject => rollback.
  sequelize.transaction = async (callback) => {
    const transaction = { buffer: [], state: "open" };
    transactions.push(transaction);
    try {
      const result = await callback(transaction);
      maybeFail("commit");
      for (const { table, row } of transaction.buffer) committed[table].push(row);
      transaction.state = "committed";
      return result;
    } catch (error) {
      transaction.state = "rolled_back";
      transaction.buffer = [];
      throw error;
    }
  };
};

const restoreFakes = () => {
  User.findByPk = originals.userFindByPk;
  User.findAll = originals.userFindAll;
  CourseReport.create = originals.reportCreate;
  Notification.create = originals.notificationCreate;
  AdminNotification.create = originals.adminNotificationCreate;
  sequelize.transaction = originals.transaction;
};

const seedUsers = () => {
  users.clear();
  const add = (user) => users.set(user.id, user);
  add({ id: REPORTER_ID, name: "Asha", role: "user", isBlocked: false });
  add({ id: ADMIN_ID, name: "Admin", role: "admin", isBlocked: false });
  add({ id: SUPERADMIN_ID, name: "Super One", role: "superadmin", isBlocked: false });
  add({ id: SUPERADMIN_2_ID, name: "Super Two", role: "superadmin", isBlocked: false });
  add({ id: OTHER_USER_ID, name: "Bystander", role: "user", isBlocked: false });
};

// ---------------------------------------------------------------------------
// HTTP harness: the real route module with the real protect + validate +
// controller chain, mounted the same way server.js mounts it.
// ---------------------------------------------------------------------------
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/course-reports", reportRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  restoreFakes();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setImmediate(resolve));
});

beforeEach(() => {
  resetDb();
  seedUsers();
  installFakes();
  mock.method(console, "error", () => {});
});

afterEach(() => {
  mock.restoreAll();
});

const tokenFor = (id = REPORTER_ID) => jwt.sign({ id }, process.env.JWT_SECRET);

const validBody = () => ({
  reportType: "Course",
  subType: "Outdated content",
  description: "The video in lesson 3 is broken",
  courseName: "React Basics",
});

const postReport = (body = validBody(), { token = tokenFor(), headers = {} } = {}) =>
  fetch(`${baseUrl}/api/course-reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });

const assertNothingPersisted = () => {
  assert.deepEqual(committed.reports, []);
  assert.deepEqual(committed.notifications, []);
  assert.deepEqual(committed.adminNotifications, []);
  assert.deepEqual(outsideTransaction, []);
};

const MODERATOR_IDS = [ADMIN_ID, SUPERADMIN_ID, SUPERADMIN_2_ID].sort();

// ---------------------------------------------------------------------------
// Canonical role decision
// ---------------------------------------------------------------------------
test("moderator roles are valid values of the User.role enum", () => {
  assert.deepEqual(MODERATOR_ROLES, ["admin", "superadmin"]);
  const enumValues = User.getAttributes().role.values;
  for (const role of MODERATOR_ROLES) {
    assert.ok(enumValues.includes(role), `User.role enum does not contain "${role}"`);
  }
});

// ---------------------------------------------------------------------------
// Authentication through the real protect middleware
// ---------------------------------------------------------------------------
test("rejects a request without a token and writes nothing", async () => {
  const res = await postReport(validBody(), { token: null });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).message, "Not authorized, no token");
  assert.equal(transactions.length, 0);
  assertNothingPersisted();
});

test("rejects an invalid token and writes nothing", async () => {
  const res = await postReport(validBody(), { token: "not-a-real-jwt" });

  assert.equal(res.status, 401);
  assert.equal(transactions.length, 0);
  assertNothingPersisted();
});

test("rejects a token for a user that no longer exists", async () => {
  const res = await postReport(validBody(), {
    token: tokenFor("99999999-9999-9999-9999-999999999999"),
  });

  assert.equal(res.status, 401);
  assert.equal((await res.json()).message, "User not found");
  assertNothingPersisted();
});

test("rejects a suspended account", async () => {
  users.get(REPORTER_ID).isBlocked = true;
  const res = await postReport();

  assert.equal(res.status, 403);
  assert.equal(transactions.length, 0);
  assertNothingPersisted();
});

test("authentication runs before validation", async () => {
  const res = await postReport({}, { token: null });

  assert.equal(res.status, 401);
});

test("controller refuses a request that has no authenticated user", async () => {
  let status;
  let body;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  await createReport({ body: validBody() }, res);

  assert.equal(status, 401);
  assert.equal(body.message, "User not authenticated");
  assert.equal(transactions.length, 0);
  assertNothingPersisted();
});

// ---------------------------------------------------------------------------
// Request validation through the real validate middleware
// ---------------------------------------------------------------------------
const invalidBodies = [
  ["missing reportType", { description: "x" }, "reportType"],
  ["blank reportType", { reportType: "   ", description: "x" }, "reportType"],
  ["missing description", { reportType: "Course" }, "description"],
  ["blank description", { reportType: "Course", description: "   " }, "description"],
  ["oversized description", { reportType: "Course", description: "a".repeat(5001) }, "description"],
  ["invalid email", { reportType: "Course", description: "x", email: "not-an-email" }, "email"],
  ["oversized phone", { reportType: "Course", description: "x", phone: "1".repeat(31) }, "phone"],
  [
    "oversized courseName",
    { reportType: "Course", description: "x", courseName: "c".repeat(256) },
    "courseName",
  ],
  ["non-string description", { reportType: "Course", description: 42 }, "description"],
];

for (const [label, body, field] of invalidBodies) {
  test(`validation rejects ${label} with 400 and writes nothing`, async () => {
    const res = await postReport(body);
    const payload = await res.json();

    assert.equal(res.status, 400);
    assert.equal(payload.message, "Validation failed");
    assert.ok(
      payload.errors.some((issue) => issue.path === field),
      `expected an error for "${field}", got ${JSON.stringify(payload.errors)}`,
    );
    assert.equal(transactions.length, 0);
    assertNothingPersisted();
  });
}

test("accepts the payload sent by the certificate report page", async () => {
  const res = await postReport({
    reportType: "certificate",
    subType: "certificate_complaint",
    description: "My certificate shows the wrong name",
    email: "asha@example.com",
    phone: "+91 98765 43210",
    courseName: "Certificate Issue",
  });

  assert.equal(res.status, 201);
});

test("accepts the payload sent by the course report modal (empty subType)", async () => {
  const res = await postReport({
    reportType: "Other",
    subType: "",
    description: "General feedback",
    courseName: "General",
  });

  assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// Success path: persistence, moderator lookup, notifications, HTTP response
// ---------------------------------------------------------------------------
test("persists the report for the authenticated user and answers 201", async () => {
  const res = await postReport({ ...validBody(), email: "asha@example.com", phone: "12345" });
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(committed.reports.length, 1);
  const [report] = committed.reports;
  assert.equal(report.userId, REPORTER_ID);
  assert.equal(report.reportType, "Course");
  assert.equal(report.subType, "Outdated content");
  assert.equal(report.description, "The video in lesson 3 is broken");
  assert.equal(report.courseName, "React Basics");
  assert.equal(report.email, "asha@example.com");
  assert.equal(report.phone, "12345");
  assert.equal(body.id, report.id);
});

test("stores null for omitted optional contact fields", async () => {
  const res = await postReport({ reportType: "Course", subType: "", description: "x", email: "" });

  assert.equal(res.status, 201);
  const [report] = committed.reports;
  assert.equal(report.email, null);
  assert.equal(report.phone, null);
  assert.equal(report.courseName, null);
});

test("looks up admin and superadmin users inside the transaction", async () => {
  await postReport();

  assert.equal(moderatorFindAllOptions.length, 1);
  const [options] = moderatorFindAllOptions;
  assert.deepEqual(options.where.role[Op.in], MODERATOR_ROLES);
  assert.ok(options.transaction, "moderator lookup must use the request transaction");
});

test("notifies every admin and superadmin and no regular user", async () => {
  const res = await postReport();
  const [report] = committed.reports;

  assert.equal(res.status, 201);
  assert.deepEqual(committed.notifications.map((n) => n.userId).sort(), MODERATOR_IDS);
  assert.ok(!committed.notifications.some((n) => n.userId === REPORTER_ID));
  assert.ok(!committed.notifications.some((n) => n.userId === OTHER_USER_ID));
  for (const notification of committed.notifications) {
    assert.equal(notification.title, "Course Report Submitted");
    assert.equal(notification.type, "security");
    assert.equal(notification.metadata.reportId, report.id);
    assert.match(notification.message, /Asha reported a course issue for course "React Basics"/);
  }
});

test("creates one admin dashboard notification", async () => {
  await postReport();

  assert.equal(committed.adminNotifications.length, 1);
  assert.equal(committed.adminNotifications[0].type, "report");
  assert.equal(committed.adminNotifications[0].title, "Course Report Submitted");
});

test("keeps the dashboard message within the 255 character column", async () => {
  users.get(REPORTER_ID).name = "N".repeat(200);
  const res = await postReport({ ...validBody(), courseName: "C".repeat(200) });

  assert.equal(res.status, 201);
  assert.ok(committed.adminNotifications[0].message.length <= 255);
});

test("runs every write in one committed transaction", async () => {
  await postReport();

  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].state, "committed");
  assert.deepEqual(outsideTransaction, []);
});

// ---------------------------------------------------------------------------
// Failure handling: any failure rolls everything back and answers 500
// ---------------------------------------------------------------------------
const assertRolledBack = async (res) => {
  const body = await res.json();
  assert.equal(res.status, 500);
  assert.equal(body.message, "Failed to submit report");
  assert.ok(!JSON.stringify(body).includes("injected"), "internal error text must not leak");
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].state, "rolled_back");
  assertNothingPersisted();
  assert.ok(console.error.mock.callCount() > 0, "failure must be logged");
};

test("report creation failure rolls back and sends no notifications", async () => {
  failOnce("reportCreate");
  const res = await postReport();

  await assertRolledBack(res);
  assert.equal(moderatorFindAllOptions.length, 0);
  assert.equal(notificationAttempts, 0);
});

test("moderator lookup failure rolls back the already created report", async () => {
  failOnce("moderatorLookup");
  const res = await postReport();

  await assertRolledBack(res);
  assert.equal(notificationAttempts, 0);
});

test("first moderator notification failure rolls back the report", async () => {
  failures.notificationAt = 1;
  const res = await postReport();

  await assertRolledBack(res);
});

test("a later moderator notification failure discards earlier notifications", async () => {
  failures.notificationAt = 3;
  const res = await postReport();

  await assertRolledBack(res);
  assert.equal(notificationAttempts, 3, "two notifications were written before the failure");
});

test("dashboard notification failure rolls back the report and every moderator notification", async () => {
  failOnce("dashboardNotification");
  const res = await postReport();

  await assertRolledBack(res);
  assert.equal(notificationAttempts, MODERATOR_IDS.length);
});

test("commit failure answers 500 and persists nothing", async () => {
  failOnce("commit");
  const res = await postReport();

  await assertRolledBack(res);
});

// ---------------------------------------------------------------------------
// Retry behaviour
// ---------------------------------------------------------------------------
test("retrying after a failed attempt creates exactly one report and one set of notifications", async () => {
  failOnce("dashboardNotification");
  const first = await postReport();
  assert.equal(first.status, 500);
  assertNothingPersisted();

  const second = await postReport();

  assert.equal(second.status, 201);
  assert.equal(committed.reports.length, 1);
  assert.deepEqual(committed.notifications.map((n) => n.userId).sort(), MODERATOR_IDS);
  assert.equal(committed.adminNotifications.length, 1);
  assert.deepEqual(
    transactions.map((t) => t.state),
    ["rolled_back", "committed"],
  );
  assert.equal(committed.notifications[0].metadata.reportId, committed.reports[0].id);
});

test("retrying after a mid-notification failure leaves no notification from the failed attempt", async () => {
  failures.notificationAt = 2;
  const first = await postReport();
  assert.equal(first.status, 500);

  const second = await postReport();

  assert.equal(second.status, 201);
  assert.equal(committed.notifications.length, MODERATOR_IDS.length);
  assert.equal(new Set(committed.notifications.map((n) => n.userId)).size, MODERATOR_IDS.length);
});
