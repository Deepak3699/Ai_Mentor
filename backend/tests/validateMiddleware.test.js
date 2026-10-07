import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import validate from "../middleware/validate.js";

const invoke = (schema, body) => {
  const result = { statusCode: 200, payload: undefined, nextCalls: 0 };
  const req = { body };
  const res = { status(code) { result.statusCode = code; return this; }, json(payload) { result.payload = payload; return this; } };
  return { result, run: () => validate(schema)(req, res, () => { result.nextCalls += 1; }) };
};
const quiet = async (callback) => { const original = console.error; console.error = () => {}; try { return await callback(); } finally { console.error = original; } };

test("validate calls next exactly once for a valid body", () => {
  const { result, run } = invoke(z.object({ name: z.string().min(2) }), { name: "Neeraj" });
  run();
  assert.equal(result.nextCalls, 1);
  assert.equal(result.payload, undefined);
});

test("validate returns normalized nested field errors", async () => {
  const { result, run } = invoke(z.object({ profile: z.object({ email: z.string().email() }) }), { profile: { email: "invalid" } });
  await quiet(run);
  assert.equal(result.statusCode, 400);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.payload.message, "Validation failed");
  assert.equal(result.payload.errors[0].path, "profile.email");
});

test("validate returns 500 when no schema is provided", async () => {
  const { result, run } = invoke(undefined, {});
  await quiet(run);
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.payload, { message: "Internal Server Error: No schema provided" });
});

test("validate safely handles unexpected schema exceptions", async () => {
  const { result, run } = invoke({ safeParse() { throw new Error("schema exploded"); } }, {});
  await quiet(run);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.details, "schema exploded");
});
