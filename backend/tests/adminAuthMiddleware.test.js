import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";

const { default: Admin } = await import("../models/Admin.js");
const { anyAdmin, protectAdmin, superAdminOnly } = await import("../middleware/adminAuthMiddleware.js");

const SECRET = "admin-middleware-test-secret";
const originalFindByPk = Admin.findByPk;
const originalSecret = process.env.JWT_SECRET;

const invoke = async (middleware, { authorization, admin } = {}) => {
  const req = { headers: {}, admin };
  if (authorization !== undefined) req.headers.authorization = authorization;
  const result = { statusCode: 200, body: undefined, nextCalls: 0 };
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
  await middleware(req, res, () => { result.nextCalls += 1; });
  return { req, result };
};

const quietErrors = async (callback) => {
  const original = console.error;
  console.error = () => {};
  try { return await callback(); } finally { console.error = original; }
};

before(() => { process.env.JWT_SECRET = SECRET; });
beforeEach(() => { Admin.findByPk = async () => null; process.env.JWT_SECRET = SECRET; });
after(() => {
  Admin.findByPk = originalFindByPk;
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

test("protectAdmin rejects missing and invalid tokens", async () => {
  let outcome = await invoke(protectAdmin);
  assert.equal(outcome.result.statusCode, 401);
  assert.deepEqual(outcome.result.body, { message: "Not authorized, no token" });

  outcome = await quietErrors(() => invoke(protectAdmin, { authorization: "Bearer invalid" }));
  assert.equal(outcome.result.statusCode, 401);
  assert.deepEqual(outcome.result.body, { message: "Not authorized, token failed" });
});

test("protectAdmin rejects a valid token for a missing admin", async () => {
  const token = jwt.sign({ id: "missing" }, SECRET);
  const { result } = await invoke(protectAdmin, { authorization: `Bearer ${token}` });
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Admin not found" });
});

test("protectAdmin rejects an on-hold admin", async () => {
  Admin.findByPk = async () => ({ id: "held", role: "admin", status: "on-hold" });
  const token = jwt.sign({ id: "held" }, SECRET);
  const { result } = await invoke(protectAdmin, { authorization: `Bearer ${token}` });
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { message: "Your account has been suspended" });
});

test("protectAdmin attaches an active admin and calls next", async () => {
  const admin = { id: "active", role: "admin", status: "active" };
  Admin.findByPk = async (id, options) => {
    assert.equal(id, "active");
    assert.deepEqual(options, { attributes: { exclude: ["password"] } });
    return admin;
  };
  const token = jwt.sign({ id: "active" }, SECRET);
  const { req, result } = await invoke(protectAdmin, { authorization: `Bearer ${token}` });
  assert.equal(result.nextCalls, 1);
  assert.equal(req.admin, admin);
});

test("superAdminOnly permits only the superAdmin role", async () => {
  assert.equal((await invoke(superAdminOnly, { admin: { role: "superAdmin" } })).result.nextCalls, 1);
  for (const admin of [undefined, { role: "admin" }, { role: "superadmin" }]) {
    const { result } = await invoke(superAdminOnly, { admin });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { message: "Access denied, superAdmin only" });
  }
});

test("anyAdmin permits admin and superAdmin but rejects other roles", async () => {
  for (const role of ["admin", "superAdmin"]) {
    assert.equal((await invoke(anyAdmin, { admin: { role } })).result.nextCalls, 1);
  }
  for (const admin of [undefined, { role: "user" }, { role: "superadmin" }]) {
    const { result } = await invoke(anyAdmin, { admin });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { message: "Access denied, admin access required" });
  }
});
