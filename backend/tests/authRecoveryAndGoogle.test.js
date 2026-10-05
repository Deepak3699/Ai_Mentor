import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "recovery-google-test-secret";
process.env.FRONTEND_URL = "http://frontend.test";

const { default: User } = await import("../models/User.js");
const { default: Notification } = await import("../models/Notification.js");
const { authServices } = await import("../services/authExternalServices.js");
const { forgotPassword, googleLogin, resetPassword } = await import("../controllers/authController.js");

const originals = {
  findOne: User.findOne,
  create: User.create,
  notificationCreate: Notification.create,
  verifyGoogleIdToken: authServices.verifyGoogleIdToken,
  uploadAvatar: authServices.uploadAvatar,
  sendEmail: authServices.sendEmail,
};

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

const quietErrors = async (callback) => {
  const original = console.error;
  console.error = () => {};
  try { return await callback(); } finally { console.error = original; }
};

beforeEach(() => {
  User.findOne = async () => null;
  User.create = async () => { throw new Error("unexpected User.create"); };
  Notification.create = async (data) => ({ id: "notification", ...data });
  authServices.verifyGoogleIdToken = async () => { throw new Error("invalid token"); };
  authServices.uploadAvatar = async () => { throw new Error("unexpected avatar upload"); };
  authServices.sendEmail = async () => ({ messageId: "test-message" });
});

after(() => {
  User.findOne = originals.findOne;
  User.create = originals.create;
  Notification.create = originals.notificationCreate;
  authServices.verifyGoogleIdToken = originals.verifyGoogleIdToken;
  authServices.uploadAvatar = originals.uploadAvatar;
  authServices.sendEmail = originals.sendEmail;
});

test("forgot password returns the same response for an unknown account", async () => {
  const { state, res } = response();
  await forgotPassword({ body: { email: "missing@example.com" } }, res);
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, {
    message: "If an account exists for this email, a reset link has been sent.",
  });
});

test("forgot password stores a hashed token and sends a reset link", async () => {
  let saves = 0;
  let emailOptions;
  const user = { email: "user@example.com", async save() { saves += 1; } };
  User.findOne = async () => user;
  authServices.sendEmail = async (options) => { emailOptions = options; return { messageId: "sent" }; };
  const { state, res } = response();
  await forgotPassword({ body: { email: user.email } }, res);
  assert.equal(state.statusCode, 200);
  assert.equal(saves, 1);
  assert.match(user.resetPasswordToken, /^[a-f0-9]{64}$/);
  assert.ok(user.resetPasswordExpires > Date.now());
  assert.equal(emailOptions.email, user.email);
  assert.match(emailOptions.html, /http:\/\/frontend\.test\/reset-password\/[a-f0-9]{40}/);
  assert.doesNotMatch(emailOptions.html, new RegExp(user.resetPasswordToken));
});

test("forgot password clears reset fields when email delivery fails", async () => {
  let saves = 0;
  const user = { email: "user@example.com", async save() { saves += 1; } };
  User.findOne = async () => user;
  authServices.sendEmail = async () => { throw new Error("SMTP unavailable"); };
  const { state, res } = response();
  await quietErrors(() => forgotPassword({ body: { email: user.email } }, res));
  assert.equal(state.statusCode, 500);
  assert.deepEqual(state.body, { message: "Email could not be sent" });
  assert.equal(user.resetPasswordToken, null);
  assert.equal(user.resetPasswordExpires, null);
  assert.equal(saves, 2);
});

test("reset password rejects an invalid or expired token", async () => {
  const { state, res } = response();
  await resetPassword({ params: { token: "invalid" }, body: { password: "NewPass1!" } }, res);
  assert.equal(state.statusCode, 400);
  assert.deepEqual(state.body, { message: "Invalid or expired token" });
});

test("reset password updates credentials, clears reset fields, and timestamps the change", async () => {
  const rawToken = "a".repeat(40);
  const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  let setCall;
  let saves = 0;
  const user = { id: "user-1", set(field, value) { setCall = [field, value]; }, async save() { saves += 1; } };
  User.findOne = async ({ where }) => {
    assert.equal(where.resetPasswordToken, expectedHash);
    assert.ok(where.resetPasswordExpires);
    return user;
  };
  const before = Date.now();
  const { state, res } = response();
  await resetPassword({ params: { token: rawToken }, body: { password: "NewPass1!" } }, res);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { message: "Password updated successfully" });
  assert.deepEqual(setCall, ["password", "NewPass1!"]);
  assert.equal(user.resetPasswordToken, null);
  assert.equal(user.resetPasswordExpires, null);
  assert.ok(user.passwordChangedAt >= before);
  assert.equal(saves, 1);
});

test("Google login rejects invalid tokens and unverified email", async () => {
  let outcome = response();
  await quietErrors(() => googleLogin({ body: { idToken: "bad" } }, outcome.res));
  assert.equal(outcome.state.statusCode, 401);
  assert.deepEqual(outcome.state.body, { message: "Invalid Google token" });

  authServices.verifyGoogleIdToken = async () => ({ email_verified: false });
  outcome = response();
  await googleLogin({ body: { idToken: "valid" } }, outcome.res);
  assert.equal(outcome.state.statusCode, 401);
  assert.deepEqual(outcome.state.body, { message: "Google email not verified" });
});

test("Google login rejects a blocked existing user", async () => {
  authServices.verifyGoogleIdToken = async () => ({
    uid: "google-id",
    email: "blocked@example.com",
    email_verified: true,
    name: "Blocked User",
  });
  User.findOne = async () => ({ isBlocked: true });
  const { state, res } = response();
  await googleLogin({ body: { idToken: "valid" } }, res);
  assert.equal(state.statusCode, 403);
  assert.deepEqual(state.body, { message: "Account suspended" });
});

test("Google login creates a new user and rehosts the avatar through the isolated service", async () => {
  authServices.verifyGoogleIdToken = async () => ({
    uid: "google-id",
    email: "new@example.com",
    email_verified: true,
    name: "New User",
    given_name: "New",
    family_name: "User",
    picture: "https://images.test/avatar.png",
  });
  let createdData;
  let uploadOptions;
  let saves = 0;
  const user = {
    id: "new-user",
    role: "user",
    purchasedCourses: [],
    async save() { saves += 1; },
  };
  User.create = async (data) => { createdData = data; Object.assign(user, data); return user; };
  authServices.uploadAvatar = async (url, options) => {
    assert.equal(url, "https://images.test/avatar.png");
    uploadOptions = options;
    return { secure_url: "https://cdn.test/avatar.png" };
  };
  const { state, res } = response();
  await googleLogin({ body: { idToken: "valid" } }, res);
  assert.equal(state.statusCode, 200);
  assert.equal(state.body.email, "new@example.com");
  assert.equal(state.body.isNewUser, true);
  assert.ok(state.body.token);
  assert.equal(createdData.googleId, "google-id");
  assert.equal(uploadOptions.public_id, "user_new-user");
  assert.equal(user.avatar_url, "https://cdn.test/avatar.png");
  assert.ok(saves >= 1);
});
