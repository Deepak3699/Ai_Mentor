// tests/issue375.test.js
// Regression test for: [BUG] Backend profile update accepts invalid role values (#375)
//
// The profile update endpoint must:
//   1. Reject any payload that contains a `role` field with a 400 response.
//   2. Reject any payload that contains unknown/extra fields with a 400 response.
//   3. Accept valid profile payloads (firstName, lastName, email, bio) normally.

import { test } from "node:test";
import assert from "node:assert/strict";
import { updateProfileSchema } from "../schemas/userSchema.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Returns true when the Zod result is a failure whose issues include `path`. */
const failsOn = (result, path) => {
  if (result.success) return false;
  return result.error.issues.some((issue) => issue.path.includes(path));
};

// ─── tests ──────────────────────────────────────────────────────────────────

test("[issue-375] updateProfileSchema rejects a payload that includes 'role'", () => {
  const result = updateProfileSchema.safeParse({
    firstName: "Alice",
    role: "admin_override",
  });

  assert.equal(result.success, false, "Schema must reject a payload containing 'role'");
  assert.ok(
    failsOn(result, "role"),
    `Expected a validation error on 'role'. Got: ${JSON.stringify(result.error?.issues)}`,
  );
});

test("[issue-375] updateProfileSchema rejects an invalid role enum value", () => {
  // Even if 'role' were theoretically an accepted key, unknown values must fail.
  const result = updateProfileSchema.safeParse({
    role: "hacker",
  });

  assert.equal(result.success, false, "Schema must reject invalid role values");
});

test("[issue-375] updateProfileSchema rejects unknown / extra fields (.strict)", () => {
  const result = updateProfileSchema.safeParse({
    firstName: "Alice",
    isAdmin: true,
    __proto__: {},
  });

  assert.equal(result.success, false, "Schema must reject unknown fields");
});

test("[issue-375] updateProfileSchema accepts a fully valid profile payload", () => {
  const result = updateProfileSchema.safeParse({
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@example.com",
    bio: "Full-stack developer",
  });

  assert.equal(result.success, true, `Schema must accept valid profile data. Error: ${JSON.stringify(result.error?.issues)}`);
});

test("[issue-375] updateProfileSchema accepts partial updates (all fields optional)", () => {
  assert.equal(updateProfileSchema.safeParse({ firstName: "Alice" }).success, true);
  assert.equal(updateProfileSchema.safeParse({ bio: "Developer" }).success, true);
  assert.equal(updateProfileSchema.safeParse({}).success, true);
});

test("[issue-375] updateProfileSchema rejects 'status' field (privileged field)", () => {
  const result = updateProfileSchema.safeParse({
    firstName: "Alice",
    status: "on-hold",
  });

  assert.equal(result.success, false, "Schema must reject 'status' as an unknown field");
});
