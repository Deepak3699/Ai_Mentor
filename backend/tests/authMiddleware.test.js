import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";

const { default: User } = await import("../models/User.js");
const { admin, protect } = await import("../middleware/authMiddleware.js");

const SECRET = "middleware-test-secret";
const originalFindByPk = User.findByPk;
const originalSecret = process.env.JWT_SECRET;

const invoke = async (middleware, { authorization, user } = {}) => {
  const req = { headers: {}, user };
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
beforeEach(() => { User.findByPk = async () => null; process.env.JWT_SECRET = SECRET; });
after(() => {
  User.findByPk = originalFindByPk;
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

test("protect rejects a request without a bearer token", async () => {
  const { result } = await invoke(protect);
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Not authorized, no token" });
  assert.equal(result.nextCalls, 0);
});

test("protect rejects a malformed or invalid token", async () => {
  const { result } = await quietErrors(() => invoke(protect, { authorization: "Bearer invalid-token" }));
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Not authorized, token failed" });
});

test("protect reports a missing JWT secret before verification", async () => {
  delete process.env.JWT_SECRET;
  const { result } = await invoke(protect, { authorization: "Bearer any-token" });
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, { message: "JWT secret not configured" });
});

test("protect rejects an expired token", async () => {
  const token = jwt.sign({ id: "user-1" }, SECRET, { expiresIn: -1 });
  const { result } = await quietErrors(() => invoke(protect, { authorization: `Bearer ${token}` }));
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Not authorized, token failed" });
});

test("protect rejects a valid token when the user no longer exists", async () => {
  const token = jwt.sign({ id: "missing-user" }, SECRET);
  const { result } = await invoke(protect, { authorization: `Bearer ${token}` });
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "User not found" });
});

test("protect rejects blocked users", async () => {
  User.findByPk = async () => ({ id: "blocked", isBlocked: true });
  const token = jwt.sign({ id: "blocked" }, SECRET);
  const { result } = await invoke(protect, { authorization: `Bearer ${token}` });
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { message: "Account suspended" });
});

test("protect rejects tokens issued before a password change", async () => {
  const token = jwt.sign({ id: "user-1" }, SECRET);
  User.findByPk = async () => ({
    id: "user-1",
    isBlocked: false,
    passwordChangedAt: new Date(Date.now() + 60_000),
  });
  const { result } = await invoke(protect, { authorization: `Bearer ${token}` });
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { message: "Token revoked, Please Log in again" });
});

test("protect attaches an active user and calls next", async () => {
  const user = { id: "active", role: "user", isBlocked: false, passwordChangedAt: null };
  User.findByPk = async (id, options) => {
    assert.equal(id, "active");
    assert.deepEqual(options, { attributes: { exclude: ["password"] } });
    return user;
  };
  const token = jwt.sign({ id: "active" }, SECRET);
  const { req, result } = await invoke(protect, { authorization: `Bearer ${token}` });
  assert.equal(result.nextCalls, 1);
  assert.equal(req.user, user);
  assert.equal(result.body, undefined);
});

test("admin permits only a user with the admin role", async () => {
  assert.equal((await invoke(admin, { user: { role: "admin" } })).result.nextCalls, 1);
  for (const user of [undefined, { role: "user" }, { role: "superadmin" }]) {
    const { result } = await invoke(admin, { user });
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { message: "Not authorized, admin access required" });
  }
});
