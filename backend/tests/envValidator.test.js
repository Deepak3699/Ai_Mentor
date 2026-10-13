// backend/tests/envValidator.test.js
import { test } from "node:test";
import assert from "node:assert/strict";

// Full valid env – every var set to a real (non-placeholder) value.
const VALID_ENV = {
  NEON_DATABASE_URL: "postgresql://test_user:dummy@localhost:5432/test_db?sslmode=require",
  JWT_SECRET: "valid-jwt-secret-string",
  FRONTEND_URL: "http://localhost:5173",
  CLOUDINARY_CLOUD_NAME: "valid-cloud-name",
  CLOUDINARY_API_KEY: "valid-api-key",
  CLOUDINARY_API_SECRET: "valid-api-secret",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USER: "valid_user@example.com",
  SMTP_PASS: "valid-smtp-pass",
  FROM_EMAIL: "valid_sender@example.com",
  FROM_NAME: "AI Mentor",
  STRIPE_SECRET_KEY: "valid-stripe-secret-key",
  STRIPE_WEBHOOK_SECRET: "valid-stripe-webhook-secret",
  RAZORPAY_KEY_ID: "valid-razorpay-key-id",
  RAZORPAY_KEY_SECRET: "valid-razorpay-secret",
};

/**
 * Apply env overrides, run validateEnv(), restore env.
 * Returns { exitCode, output }.  process.exit is intercepted — never real.
 */
async function run(overrides = {}, nodeEnv = "production") {
  const snapshot = { ...process.env };
  for (const k of [
    ...Object.keys(VALID_ENV),
    "DISABLE_CLOUDINARY",
    "DISABLE_EMAIL",
    "DISABLE_STRIPE",
    "DISABLE_RAZORPAY",
  ]) {
    delete process.env[k];
  }

  Object.assign(process.env, { NODE_ENV: nodeEnv, ...VALID_ENV, ...overrides });

  let output = "";
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };

  let exitCode = null;
  process.exit = (code) => {
    exitCode = code ?? 0;
  };

  const { validateEnv } = await import(`../env-validator.js?t=${Date.now()}`);
  validateEnv();

  process.stdout.write = origWrite;
  process.env = snapshot;
  return { exitCode, output };
}

test("all vars valid → no exit, success message", async () => {
  const { exitCode, output } = await run();
  assert.strictEqual(exitCode, null);
  assert.match(output, /All environment variables are set correctly/);
});

test("production: missing required var → exits 1", async () => {
  const { exitCode, output } = await run({ NEON_DATABASE_URL: "" }, "production");
  assert.strictEqual(exitCode, 1);
  assert.match(output, /NEON_DATABASE_URL/);
  assert.match(output, /aborted/i);
});

test("production: placeholder value → exits 1", async () => {
  const { exitCode, output } = await run({ JWT_SECRET: "your_jwt_secret" }, "production");
  assert.strictEqual(exitCode, 1);
  assert.match(output, /JWT_SECRET/);
});

test("development: missing required var → warns, does NOT exit", async () => {
  const { exitCode, output } = await run({ JWT_SECRET: "" }, "development");
  assert.strictEqual(exitCode, null);
  assert.match(output, /starting anyway/i);
});

test("DISABLE_CLOUDINARY=true → Cloudinary vars not checked", async () => {
  const { exitCode } = await run(
    {
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      DISABLE_CLOUDINARY: "true",
    },
    "production",
  );
  assert.strictEqual(exitCode, null);
});

test("DISABLE_EMAIL=true → Email vars not checked", async () => {
  const { exitCode } = await run(
    { SMTP_HOST: "", SMTP_PASS: "", DISABLE_EMAIL: "true" },
    "production",
  );
  assert.strictEqual(exitCode, null);
});

test("secret values are never printed in output", async () => {
  const customValue = "custom-sensitive-token-98765";
  const { output } = await run({ NEON_DATABASE_URL: customValue }, "development");
  assert.doesNotMatch(output, new RegExp(customValue));
});
