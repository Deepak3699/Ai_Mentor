import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: ContactMessage } = await import("../models/Contactmessage.js");
const { default: contactRoutes } = await import("../routes/contactus.js");

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/contactus", contactRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  baseUrl = `http://localhost:${address.port}/api/contactus`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  // Clean up any test messages
  await ContactMessage.destroy({ where: { email: "test@example.com" } });
});

test("POST /api/contactus - Anonymous submission stores userId as null", async () => {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a valid test message with more than 10 characters.",
    }),
  });

  const data = await res.json();
  assert.strictEqual(res.status, 201);
  assert.strictEqual(data.data.userId, null);
});

test("POST /api/contactus - Authenticated submission derives userId from token", async () => {
  const mockUserId = 456;
  const token = jwt.sign({ id: mockUserId }, process.env.JWT_SECRET || "your_jwt_secret", {
    expiresIn: "1h",
  });

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a valid test message with more than 10 characters.",
    }),
  });

  const data = await res.json();
  assert.strictEqual(res.status, 201);
  assert.strictEqual(data.data.userId, mockUserId);
});

test("POST /api/contactus - Spoofed-ID in request body is ignored", async () => {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: 999, // Maliciously trying to spoof
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a valid test message with more than 10 characters.",
    }),
  });

  const data = await res.json();
  assert.strictEqual(res.status, 201);
  assert.strictEqual(data.data.userId, null);
});

test("POST /api/contactus - Invalid token handles gracefully", async () => {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer invalidtoken123",
    },
    body: JSON.stringify({
      email: "test@example.com",
      subject: "Test Subject",
      message: "This is a valid test message with more than 10 characters.",
    }),
  });

  // Depending on optionalProtect implementation, it may allow request as guest or fail
  assert.ok(res.status === 201 || res.status === 401);
  if (res.status === 201) {
    const data = await res.json();
    assert.strictEqual(data.data.userId, null);
  }
});
