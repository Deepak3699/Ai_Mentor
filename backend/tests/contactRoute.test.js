import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: ContactMessage } = await import("../models/Contactmessage.js");
const { default: contactRoutes } = await import("../routes/contactus.js");

const originalCreate = ContactMessage.create;
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/contactus", contactRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  ContactMessage.create = async (data) => ({ id: 1, ...data });
});

after(async () => {
  ContactMessage.create = originalCreate;
  await new Promise((resolve) => server.close(resolve));
});

const post = (body) => fetch(`${baseUrl}/api/contactus`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("contact route requires an email", async () => {
  const res = await post({ subject: "Help", message: "A sufficiently long message" });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { success: false, message: "Email is required" });
});

test("contact route validates subject and message lengths before persistence", async () => {
  let creates = 0;
  ContactMessage.create = async () => { creates += 1; };
  let res = await post({ email: "user@example.com", subject: "Hi", message: "A sufficiently long message" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, "Subject must be at least 3 characters");
  res = await post({ email: "user@example.com", subject: "Help", message: "short" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).message, "Message must be at least 10 characters");
  assert.equal(creates, 0);
});

test("contact route trims values and stores an optional authenticated user id", async () => {
  let created;
  ContactMessage.create = async (data) => { created = data; return { id: 7, ...data }; };
  const res = await post({
    userId: "user-1",
    email: "  user@example.com  ",
    subject: "  Need Help  ",
    message: "  This is a detailed support request.  ",
  });
  assert.equal(res.status, 201);
  assert.deepEqual(created, {
    userId: "user-1",
    email: "user@example.com",
    subject: "Need Help",
    message: "This is a detailed support request.",
  });
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.data.id, 7);
});

test("contact route stores null when no user id is provided", async () => {
  let created;
  ContactMessage.create = async (data) => { created = data; return data; };
  const res = await post({ email: "user@example.com", subject: "Help", message: "A sufficiently long message" });
  assert.equal(res.status, 201);
  assert.equal(created.userId, null);
});

test("contact route converts Sequelize validation errors to a safe 400 response", async () => {
  ContactMessage.create = async () => {
    const error = new Error("validation failed");
    error.name = "SequelizeValidationError";
    error.errors = [{ message: "Please enter a valid email address" }];
    throw error;
  };
  const original = console.error;
  console.error = () => {};
  try {
    const res = await post({ email: "invalid", subject: "Help", message: "A sufficiently long message" });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { success: false, message: "Please enter a valid email address" });
  } finally { console.error = original; }
});

test("contact route hides unexpected persistence failures", async () => {
  ContactMessage.create = async () => { throw new Error("database unavailable"); };
  const original = console.error;
  console.error = () => {};
  try {
    const res = await post({ email: "user@example.com", subject: "Help", message: "A sufficiently long message" });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { success: false, message: "Server error while sending message" });
  } finally { console.error = original; }
});
