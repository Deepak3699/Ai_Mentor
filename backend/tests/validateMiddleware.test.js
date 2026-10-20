import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import validate from "../middleware/validate.js";

const invoke = (schema, body) => {
  const result = { statusCode: 200, payload: undefined, nextCalls: 0 };
  const req = { id: "test-id", method: "POST", originalUrl: "/x", body };
  const res = {
    headersSent: false,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.payload = payload;
      return this;
    },
  };
  return {
    result,
    run: () =>
      validate(schema)(req, res, () => {
        result.nextCalls += 1;
      }),
  };
};

const quiet = async (callback) => {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await callback();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
};

test("validate calls next exactly once for a valid body", () => {
  const { result, run } = invoke(z.object({ name: z.string().min(2) }), { name: "Neeraj" });
  run();
  assert.equal(result.nextCalls, 1);
  assert.equal(result.payload, undefined);
});

test("validate returns normalized nested field errors", async () => {
  const { result, run } = invoke(z.object({ profile: z.object({ email: z.string().email() }) }), {
    profile: { email: "invalid" },
  });
  await quiet(run);
  assert.equal(result.statusCode, 400);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.payload.message, "Validation failed");
  assert.equal(result.payload.errors[0].path, "profile.email");
});

test("validate returns a generic 500 when no schema is provided", async () => {
  const { result, run } = invoke(undefined, {});
  await quiet(run);
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.payload, {
    success: false,
    message: "Internal server error",
    requestId: "test-id",
  });
  assert.ok(!JSON.stringify(result.payload).includes("No schema provided"));
  assert.equal(result.nextCalls, 0);
});

test("validate hides unexpected schema exceptions from the client", async () => {
  const { result, run } = invoke(
    {
      safeParse() {
        throw new Error("schema exploded");
      },
    },
    {},
  );
  await quiet(run);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.message, "Internal server error");
  assert.equal(result.payload.requestId, "test-id");
  assert.equal("details" in result.payload, false);
  assert.ok(!JSON.stringify(result.payload).includes("schema exploded"));
  assert.equal(result.nextCalls, 0);
});
