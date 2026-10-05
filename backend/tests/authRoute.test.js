import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.NODE_ENV = "test";

const { default: express } = await import("express");
const { default: User } = await import("../models/User.js");
const { default: Notification } = await import("../models/Notification.js");
const { default: authRoutes } = await import("../routes/auth.js");

// In-memory mock database for auth tests
const MOCK_USERS = [
  {
    id: 1,
    firstName: "Test",
    lastName: "User",
    name: "Test User",
    email: "existing@example.com",
    password: "$2a$10$FakeHashedPassword", // bcrypt hash stub or mock matchPassword
    role: "student",
    isBlocked: false,
    isProfileComplete: true,
    purchasedCourses: [],
    matchPassword: async (pwd) => pwd === "CorrectPassword123!",
  },
  {
    id: 2,
    firstName: "Blocked",
    lastName: "User",
    name: "Blocked User",
    email: "blocked@example.com",
    password: "$2a$10$FakeHashedPassword",
    role: "student",
    isBlocked: true,
    isProfileComplete: true,
    purchasedCourses: [],
    matchPassword: async (pwd) => pwd === "CorrectPassword123!",
  }
];

const originals = {
  findOne: User.findOne,
  create: User.create,
  notificationCreate: Notification.create,
};

let server;
let baseUrl;

before(async () => {
  User.findOne = async ({ where }) => {
    return MOCK_USERS.find((u) => u.email === where.email) ?? null;
  };

  Notification.create = async (notificationData) => ({ id: "test-notification", ...notificationData });

  User.create = async (userData) => {
    const newUser = {
      id: MOCK_USERS.length + 1,
      ...userData,
      role: "student",
      isBlocked: false,
      isProfileComplete: true,
      purchasedCourses: [],
      matchPassword: async (pwd) => pwd === userData.password,
    };
    MOCK_USERS.push(newUser);
    return newUser;
  };

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findOne = originals.findOne;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  User.create = originals.create;
  Notification.create = originals.notificationCreate;
});

const post = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("registering a new user with valid details returns 201 and JWT token", async () => {
  const res = await post("/api/auth/register", {
    firstName: "John",
    lastName: "Doe",
    name: "John Doe",
    email: "newuser@example.com",
    password: "Password123!",
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.email, "newuser@example.com");
  assert.ok(data.token, "JWT token should be returned");
});

test("registering with an already existing email returns 400", async () => {
  const res = await post("/api/auth/register", {
    firstName: "Test",
    lastName: "User",
    name: "Test User",
    email: "existing@example.com",
    password: "Password123!",
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.message, "User already exists");
});

test("login with wrong password returns 401", async () => {
  const res = await post("/api/auth/login", {
    email: "existing@example.com",
    password: "WrongPassword!",
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.message, "Invalid email or password");
});

test("login with valid credentials returns 200 and token", async () => {
  const res = await post("/api/auth/login", {
    email: "existing@example.com",
    password: "CorrectPassword123!",
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.email, "existing@example.com");
  assert.ok(data.token);
});

test("login for a blocked user returns 403 Account suspended", async () => {
  const res = await post("/api/auth/login", {
    email: "blocked@example.com",
    password: "CorrectPassword123!",
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.message, "Account suspended");
});
