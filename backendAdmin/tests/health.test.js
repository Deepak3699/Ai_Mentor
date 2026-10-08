process.env.NODE_ENV = "test";

import { test, mock } from "node:test";
import assert from "node:assert/strict";

const { default: express } = await import("express");
const { default: healthRoutes } = await import("../routes/healthRoutes.js");
const { sequelize } = await import("../config/db.js");

const app = express();
app.use("/health", healthRoutes);

const startTestServer = () =>
  new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

test("backend admin liveness returns 200 without checking the database", async () => {
  const authenticate = mock.method(sequelize, "authenticate", async () => {});

  const server = await startTestServer();

  try {
    const response = await fetch(
      `http://localhost:${server.address().port}/health/live`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "alive" });
    assert.equal(authenticate.mock.calls.length, 0);
  } finally {
    server.close();
    authenticate.mock.restore();
  }
});

test("backend admin readiness returns 200 when the database is available", async () => {
  const authenticate = mock.method(sequelize, "authenticate", async () => {});

  const server = await startTestServer();

  try {
    const response = await fetch(
      `http://localhost:${server.address().port}/health/ready`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ready" });
    assert.equal(authenticate.mock.calls.length, 1);
  } finally {
    server.close();
    authenticate.mock.restore();
  }
});

test("backend admin readiness returns 503 without exposing database errors", async () => {
  const authenticate = mock.method(
    sequelize,
    "authenticate",
    async () => {
      throw new Error("secret database credentials or connection details");
    },
  );

  const server = await startTestServer();

  try {
    const response = await fetch(
      `http://localhost:${server.address().port}/health/ready`,
    );
    const body = await response.text();

    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(body), { status: "not_ready" });
    assert.ok(!body.includes("secret database credentials"));
  } finally {
    server.close();
    authenticate.mock.restore();
  }
});