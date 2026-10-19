import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: ContactMessage } = await import("../models/Contactmessage.js");
const { default: User } = await import("../models/User.js");
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

test("POST /api/contactus - Anonymous submission stores userId as null", async () => {
  const originalCreate = ContactMessage.create;
  try {
    ContactMessage.create = async (data) => ({ id: 1, ...data });

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
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.userId, null);
  } finally {
    ContactMessage.create = originalCreate;
  }
});

test("POST /api/contactus - Authenticated submission derives userId from token", async () => {
  const mockUserId = 456;
  const token = jwt.sign({ id: mockUserId }, process.env.JWT_SECRET || "your_jwt_secret", {
    expiresIn: "1h",
  });

  const originalFindByPk = User.findByPk;
  const originalCreate = ContactMessage.create;
  try {
    User.findByPk = async (id) => ({ id, email: "authuser@example.com", isBlocked: false });
    ContactMessage.create = async (data) => ({ id: 1, ...data });

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
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.userId, mockUserId);
  } finally {
    User.findByPk = originalFindByPk;
    ContactMessage.create = originalCreate;
  }
});

test("POST /api/contactus - Spoofed-ID in request body is ignored", async () => {
  const originalCreate = ContactMessage.create;
  try {
    ContactMessage.create = async (data) => ({ id: 1, ...data });

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
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.userId, null);
  } finally {
    ContactMessage.create = originalCreate;
  }
});

test("POST /api/contactus - Deterministic 401 on invalid token", async () => {
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

  // Deterministically expect 401 Unauthorized
  assert.strictEqual(res.status, 401);
});

test("POST /api/contactus - Regression: fails validation when email is missing", async () => {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: "Test Subject",
      message: "This is a valid test message with more than 10 characters.",
    }),
  });

  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.success, false);
});