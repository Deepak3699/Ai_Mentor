import { test } from "node:test";
import assert from "node:assert/strict";
import {
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../schemas/authSchema.js";

const validRegistration = {
  firstName: "Neeraj",
  lastName: "Saini",
  name: "Neeraj Saini",
  email: "neeraj@example.com",
  password: "StrongPass1!",
};

test("registerSchema accepts a complete valid registration", () => {
  assert.equal(registerSchema.safeParse(validRegistration).success, true);
});

test("registerSchema rejects invalid names, email, and weak passwords", () => {
  const result = registerSchema.safeParse({
    firstName: "",
    lastName: "",
    name: "N",
    email: "invalid",
    password: "weak",
  });
  assert.equal(result.success, false);
  const paths = new Set(result.error.issues.map((issue) => issue.path[0]));
  for (const field of ["firstName", "lastName", "name", "email", "password"]) {
    assert.equal(paths.has(field), true);
  }
});

test("auth request schemas enforce required fields", () => {
  assert.equal(
    loginSchema.safeParse({ email: "a@example.com", password: "x" }).success,
    true,
  );
  assert.equal(
    loginSchema.safeParse({ email: "bad", password: "" }).success,
    false,
  );
  assert.equal(forgotPasswordSchema.safeParse({ email: "bad" }).success, false);
  assert.equal(
    resetPasswordSchema.safeParse({ password: "StrongPass1!" }).success,
    true,
  );
  assert.equal(googleLoginSchema.safeParse({ idToken: "" }).success, false);
});
