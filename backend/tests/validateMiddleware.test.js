import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import validate from "../middleware/validate.js";

// extraReq lets a test add params, query, originalUrl, etc.
const invoke = (schema, body, extraReq = {}) => {
  const result = { statusCode: 200, payload: undefined, nextCalls: 0 };
  const req = { id: "test-id", method: "POST", originalUrl: "/x", body, ...extraReq };
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
    req,
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

// Runs the callback and returns every console.warn line it produced.
const captureWarnings = async (callback) => {
  const lines = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (line) => lines.push(String(line));
  console.error = () => {};
  try {
    await callback();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
  return lines;
};

// ---- Body-only calls: validate(someSchema), how existing routes use it ----

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
  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 400);
  assert.equal(result.payload.success, false);
  assert.equal(result.payload.error.code, "VALIDATION_ERROR");
  assert.equal(result.payload.error.message, "Validation failed");
  assert.equal(result.payload.error.details[0].path, "profile.email");
  assert.equal(result.payload.requestId, "test-id");
});

test("body-only call reports location 'body' on each error", async () => {
  const { result, run } = invoke(z.object({ name: z.string() }), {});
  await quiet(run);
  assert.equal(result.payload.error.details[0].location, "body");
});

test("body-only call leaves req.body untouched, even when the schema transforms it", () => {
  const schema = z.object({ courseId: z.string().transform(Number) });
  const { result, req, run } = invoke(schema, { courseId: "5" });
  run();
  assert.equal(result.nextCalls, 1);
  assert.strictEqual(req.body.courseId, "5"); // still the raw string
});

// ---- Per-part calls: validate({ body, params, query }) ----

test("per-part call validates req.params and rejects bad values", async () => {
  const { result, run } = invoke(
    { params: z.strictObject({ paymentId: z.uuid({ error: "Payment ID must be a valid UUID" }) }) },
    undefined,
    { params: { paymentId: "abc" } },
  );
  await quiet(run);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.payload.error.details, [
    { location: "params", path: "paymentId", message: "Payment ID must be a valid UUID" },
  ]);
});

test("per-part call validates req.query", async () => {
  const { result, run } = invoke(
    { query: z.strictObject({ page: z.string().regex(/^\d+$/, "page must be a number") }) },
    undefined,
    { query: { page: "x" } },
  );
  await quiet(run);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.payload.error.details[0].location, "query");
  assert.equal(result.payload.error.details[0].path, "page");
});

test("per-part call collects errors from every part instead of stopping at the first", async () => {
  const { result, run } = invoke(
    {
      body: z.object({ name: z.string() }),
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      query: z.object({ page: z.string().regex(/^\d+$/) }),
    },
    {},
    { params: { id: "x" }, query: { page: "y" } },
  );
  await quiet(run);
  const locations = result.payload.error.details.map((d) => d.location).sort();
  assert.deepEqual(locations, ["body", "params", "query"]);
});

test("per-part call hands cleaned data to the handler", () => {
  const { result, req, run } = invoke(
    {
      body: z.object({ courseId: z.string().transform(Number) }),
      params: z.object({ id: z.string().transform(Number) }),
      query: z.object({ page: z.string().transform(Number) }),
    },
    { courseId: "5" },
    { params: { id: "7" }, query: { page: "2" } },
  );
  run();
  assert.equal(result.nextCalls, 1);
  assert.strictEqual(req.body.courseId, 5);
  assert.strictEqual(req.params.id, 7);
  assert.strictEqual(req.validatedQuery.page, 2);
  assert.deepEqual(req.query, { page: "2" }); // req.query is never overwritten (Express 5)
});

test("per-part call strips unknown keys when the schema is not strict", () => {
  const { req, run } = invoke({ body: z.object({ name: z.string() }) }, { name: "a", extra: 1 });
  run();
  assert.deepEqual(req.body, { name: "a" });
});

test("per-part call treats a missing body as {} so the error names the field", async () => {
  const { result, run } = invoke({ body: z.object({ idempotencyKey: z.string() }) }, undefined);
  await quiet(run);
  assert.equal(result.statusCode, 400);
  assert.equal(result.payload.error.details[0].path, "idempotencyKey");
});

test("per-part call skips parts that have no schema", () => {
  const { result, run } = invoke(
    { params: z.object({ id: z.string() }) },
    { anything: "goes" },
    { params: { id: "1" }, query: { whatever: "ok" } },
  );
  run();
  assert.equal(result.nextCalls, 1);
});

// ---- Logging safety ----

test("validation logs locations, paths and codes but never the submitted values", async () => {
  const { run } = invoke(
    { body: z.strictObject({ razorpay_signature: z.string().max(3) }) },
    { razorpay_signature: "super-secret-signature" },
    { originalUrl: "/pay/verify?token=abc123" },
  );
  const lines = await captureWarnings(run);
  const logged = lines.join("\n");
  assert.ok(logged.includes("razorpay_signature"));
  assert.ok(!logged.includes("super-secret-signature"));
  assert.ok(!logged.includes("abc123")); // query string is stripped from the route
});

// ---- Server errors ----

test("validate returns a generic 500 when no schema is provided", async () => {
  const { result, run } = invoke(undefined, {});

  await quiet(run);

  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.payload, {
    success: false,
    message: "Internal server error",
    error: "Internal server error",
    requestId: "test-id",
  });
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

  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.message, "Internal server error");
  assert.ok(!JSON.stringify(result.payload).includes("schema exploded"));
});

test("per-part call hides unexpected schema exceptions from the client", async () => {
  const { result, run } = invoke(
    {
      params: {
        safeParse() {
          throw new Error("params schema exploded");
        },
      },
    },
    undefined,
    { params: {} },
  );

  await quiet(run);

  assert.equal(result.nextCalls, 0);
  assert.equal(result.statusCode, 500);
  assert.ok(!JSON.stringify(result.payload).includes("params schema exploded"));
});
