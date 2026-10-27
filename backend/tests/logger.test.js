// ============================================================
// This file contains the test code for logging behavior across modules.
// It checks that sensitive fields such as passwords, tokens, and IDs
// are redacted before logs are emitted.
// ============================================================

import pino from "pino";
import { Writable } from "node:stream";
import test from "node:test";
import assert from "node:assert";

//============== middleware/validate.js ==============//

import { prodRedactPaths as paths } from "../middleware/validate.js";

const gotLogs = [];
const stream = new Writable({
  write(chunk, encoding, callback) {
    gotLogs.push(JSON.parse(chunk.toString()));
    callback();
  },
});

const logger = pino({ level: "info", redact: { paths, censor: "****" } }, stream);

test.beforeEach(() => {
  gotLogs.length = 0;
});

test("should_not_log_password_on_registration_failure", () => {
  const req_body = {
    firstName: "jose",
    lastName: "doe",
    name: "Jose Doe",
    email: "jose@example.com",
    password: "Secret@123",
  };

  logger.error({ req_body }, "Validation Failed for body:");
  assert.strictEqual(gotLogs.length, 1);
  assert.strictEqual(gotLogs[0].req_body.password, "****");
});

test("should_not_log_password_on_login_failure", () => {
  const req_body = { email: "jose@example.com", password: "Secret@123" };

  logger.error({ req_body }, "Validation Failed for body");
  assert.strictEqual(gotLogs.length, 1);
  assert.strictEqual(gotLogs[0].req_body.password, "****");
});

test("should_not_log_old_and_new_password_on_change_password_failure", () => {
  const req_body = { oldPassword: "Secret@123", newPassword: "StrongSecret@123" };

  logger.error({ req_body }, "Validation Failed for body:");
  assert.strictEqual(gotLogs.length, 1);
  assert.strictEqual(gotLogs[0].req_body.oldPassword, "****");
  assert.strictEqual(gotLogs[0].req_body.newPassword, "****");
});

test("should_not_log_password_on_reset_password_failure", () => {
  const req_body = { password: "Secret@123" };

  logger.error({ req_body }, "Validation Failed for body");
  assert.strictEqual(gotLogs.length, 1);
  assert.strictEqual(gotLogs[0].req_body.password, "****");
});

test("should_not_log_user_google_token_id", () => {
  const req_body = { idToken: "token_id_google" };

  logger.error({ req_body }, "Validation Failed for body:");
  assert.strictEqual(gotLogs.length, 1);
  assert.strictEqual(gotLogs[0].req_body.idToken, "****");
});
