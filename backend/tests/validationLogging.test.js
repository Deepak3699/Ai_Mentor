import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: authRoutes } = await import("../routes/auth.js");

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);

  // Endpoint to test 500 error handler
  app.get("/test-error", () => {
    throw new Error("Secret database stack trace or internal connection string");
  });

  // Global error handler matching server.js
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const isProd = process.env.NODE_ENV === "production";
    const message =
      status === 500 && isProd ? "Internal Server Error" : err.message || "Internal Server Error";

    res.status(status).json({
      success: false,
      message,
    });
  });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("validation failure does not log plaintext passwords or full request bodies", async () => {
  const loggedErrors = [];
  const originalError = console.error;
  console.error = (...args) => {
    loggedErrors.push(args.join(" "));
  };

  const secretPassword = "SuperSecretPassword123!@#";

  try {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: secretPassword,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.message, "Validation failed");

    // Check captured logs: secret password MUST NOT be logged
    const joinedLogs = loggedErrors.join("\n");
    assert.equal(
      joinedLogs.includes(secretPassword),
      false,
      "Plaintext password was found in validation failure logs!",
    );
  } finally {
    console.error = originalError;
  }
});

test("internal 500 error sanitizes error messages in production mode", async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const res = await fetch(`${baseUrl}/test-error`);
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.equal(data.message, "Internal Server Error");
    assert.equal("Secret database stack trace" in data, false);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
