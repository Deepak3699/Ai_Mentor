import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { securityHeaders } from "../config/securityHeaders.js";

process.env.NODE_ENV = "test";

const getHeaders = async (app, path = "/ping") => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    await res.arrayBuffer(); // read the body so the connection can close
    return res.headers;
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
};

// Sets NODE_ENV for one test, then restores the original value
const withEnv = async (value, run) => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return await run();
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
};

const buildApp = () => {
  const app = express();
  app.use(securityHeaders());
  app.get("/ping", (req, res) => res.json({ ok: true }));
  return app;
};

test("CSP is enabled and sends the baseline headers", async () => {
  const headers = await getHeaders(buildApp());
  const csp = headers.get("content-security-policy");

  assert.ok(csp, "CSP header must be present");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);

  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.equal(headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(headers.get("x-powered-by"), null);
});

test("HSTS is off outside production", async () => {
  await withEnv("test", async () => {
    const headers = await getHeaders(buildApp());
    assert.equal(headers.get("strict-transport-security"), null);
  });
});

test("HSTS is on in production", async () => {
  await withEnv("production", async () => {
    const headers = await getHeaders(buildApp());
    const hsts = headers.get("strict-transport-security");
    assert.match(hsts, /max-age=15552000/);
    assert.match(hsts, /includeSubDomains/);
  });
});

test("real server sends headers on /health and on 404s", async () => {
  const { default: app } = await import("../server.js");

  for (const path of ["/health", "/does-not-exist"]) {
    const headers = await getHeaders(app, path);
    assert.ok(headers.get("content-security-policy"), path);
    assert.equal(headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(
      headers.get("cross-origin-resource-policy"),
      "same-origin",
      path,
    );
  }
});
