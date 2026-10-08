import { test } from "node:test";
import assert from "node:assert/strict";
import { adminLoginSchema, adminRegisterSchema, changePasswordSchema } from "../schemas/adminAuthSchema.js";

test("admin login accepts valid credentials", () => {
  assert.equal(adminLoginSchema.safeParse({ email: "admin@example.com", password: "password" }).success, true);
});

test("admin login rejects malformed email and missing password", () => {
  const result = adminLoginSchema.safeParse({ email: "bad", password: "" });
  assert.equal(result.success, false);
  assert.deepEqual(new Set(result.error.issues.map((issue) => issue.path[0])), new Set(["email", "password"]));
});

test("admin registration enforces all credential rules", () => {
  assert.equal(adminRegisterSchema.safeParse({ name: "Admin User", email: "admin@example.com", password: "StrongPass1!" }).success, true);
  const invalid = adminRegisterSchema.safeParse({ name: "A", email: "bad", password: "weak" });
  assert.equal(invalid.success, false);
  const paths = new Set(invalid.error.issues.map((issue) => issue.path[0]));
  for (const field of ["name", "email", "password"]) assert.equal(paths.has(field), true);
});

test("change password requires current and strong new passwords", () => {
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "current", newPassword: "NewStrong1!" }).success, true);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "", newPassword: "weak" }).success, false);
});
