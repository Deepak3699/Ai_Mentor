import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";

process.env.NODE_ENV = "test";

const { default: User } = await import("../models/User.js");
const { default: CourseReport } = await import("../models/CourseReport.js");
const { default: AdminNotification } = await import("../models/AdminNotification.js");
const { default: Notification } = await import("../models/Notification.js");
const { createReport } = await import("../controllers/reportController.js");

const originals = {
  userFindAll: User.findAll,
  reportCreate: CourseReport.create,
  adminNotificationCreate: AdminNotification.create,
  notificationCreate: Notification.create,
};

const users = [
  { id: 1, role: "user" },
  { id: 2, role: "admin" },
  { id: 3, role: "superadmin" },
  { id: 4, role: "superadmin" },
];

const response = () => {
  const state = { statusCode: 200, body: undefined };
  return {
    state,
    res: {
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return this; },
    },
  };
};

// Evaluates the role filter (plain value or Op.in) against the in-memory users.
const matchesRole = (where, user) => {
  const condition = where?.role;
  if (condition === undefined) return true;
  if (condition && typeof condition === "object" && Array.isArray(condition[Op.in])) {
    return condition[Op.in].includes(user.role);
  }
  return user.role === condition;
};

let notified;
let adminNotifications;

beforeEach(() => {
  notified = [];
  adminNotifications = [];
  User.findAll = async ({ where } = {}) => users.filter((u) => matchesRole(where, u));
  CourseReport.create = async (values) => ({ id: "r1", ...values });
  Notification.create = async (values) => { notified.push(values); return values; };
  AdminNotification.create = async (values) => { adminNotifications.push(values); return values; };
});

after(() => {
  User.findAll = originals.userFindAll;
  CourseReport.create = originals.reportCreate;
  AdminNotification.create = originals.adminNotificationCreate;
  Notification.create = originals.notificationCreate;
});

test("course report notifies both admins and superadmins", async () => {
  const { state, res } = response();
  await createReport(
    {
      user: { id: 10, name: "Asha" },
      body: { reportType: "content", subType: "outdated", description: "Broken video", courseName: "React" },
    },
    res
  );

  assert.equal(state.statusCode, 201);
  assert.deepEqual(notified.map((n) => n.userId).sort(), [2, 3, 4]);
  assert.ok(notified.every((n) => n.title === "Course Report Submitted"));
  assert.ok(notified.every((n) => n.metadata.reportId === "r1"));
});

test("course report does not notify regular users", async () => {
  const { res } = response();
  await createReport({ user: { id: 10 }, body: { reportType: "content", description: "x" } }, res);

  assert.ok(!notified.some((n) => n.userId === 1));
});

test("course report still creates the admin dashboard notification", async () => {
  const { res } = response();
  await createReport({ user: { id: 10, name: "Asha" }, body: { reportType: "content", courseName: "React" } }, res);

  assert.equal(adminNotifications.length, 1);
  assert.equal(adminNotifications[0].type, "report");
});

test("unauthenticated report is rejected before any notification", async () => {
  const { state, res } = response();
  await createReport({ body: { reportType: "content" } }, res);

  assert.equal(state.statusCode, 401);
  assert.equal(notified.length, 0);
});
