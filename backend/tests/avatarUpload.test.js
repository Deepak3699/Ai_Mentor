// backend/tests/avatarUpload.test.js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "avatar-test-jwt-secret";

const { default: express } = await import("express");
const { default: User } = await import("../models/User.js");
const { default: userRoutes } = await import("../routes/userRoutes.js");

const originalFindByPk = User.findByPk;
const originalFindOne = User.findOne;

let server;
let baseUrl;
const createdFiles = new Set();

const mockUser = {
  id: 1,
  firstName: "John",
  lastName: "Doe",
  name: "John Doe",
  email: "john@example.com",
  role: "user",
  bio: "Hello world",
  avatar_url: null,
  isProfileComplete: true,
  googleId: null,
  password: "password123",
  purchasedCourses: [],
  async save() {
    return this;
  },
};

const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  mockUser.avatar_url = null;
  mockUser.firstName = "John";
  mockUser.lastName = "Doe";
  mockUser.email = "john@example.com";
  mockUser.bio = "Hello world";
  User.findByPk = async (id) => (Number(id) === 1 ? mockUser : null);
  User.findOne = async () => null;
});

after(async () => {
  User.findByPk = originalFindByPk;
  User.findOne = originalFindOne;
  await new Promise((resolve) => server.close(resolve));

  for (const filename of createdFiles) {
    const filePath = path.resolve("uploads", filename);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
});

test("valid PNG image upload updates profile and generates safe server-controlled filename", async () => {
  const formData = new FormData();
  formData.append(
    "avatar",
    new Blob(["fake-valid-png-content"], { type: "image/png" }),
    "my-avatar.png",
  );
  formData.append("bio", "Updated bio");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.avatar_url);
  assert.match(data.avatar_url, /^\/uploads\/avatar-\d+-[a-f0-9]+\.png$/);

  const filename = path.basename(data.avatar_url);
  createdFiles.add(filename);
  const filePath = path.resolve("uploads", filename);
  assert.equal(fs.existsSync(filePath), true);
  // Verify filename does NOT contain user-controlled path
  assert.equal(filename.includes("my-avatar"), false);
});

test("non-image file upload (.txt) is rejected with 400", async () => {
  const uploadsBefore = new Set(fs.readdirSync("uploads"));

  const formData = new FormData();
  formData.append(
    "avatar",
    new Blob(["plain text content"], { type: "text/plain" }),
    "document.txt",
  );

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /invalid file type/i);

  const uploadsAfter = new Set(fs.readdirSync("uploads"));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("disguised non-image extension (.php with image/png) is rejected with 400", async () => {
  const uploadsBefore = new Set(fs.readdirSync("uploads"));

  const formData = new FormData();
  formData.append(
    "avatar",
    new Blob(["<?php echo 'evil'; ?>"], { type: "image/png" }),
    "shell.php",
  );

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /invalid file type/i);

  const uploadsAfter = new Set(fs.readdirSync("uploads"));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("oversized avatar upload (> 5MB) returns clear 4xx response", async () => {
  const uploadsBefore = new Set(fs.readdirSync("uploads"));

  // 5.5 MB payload
  const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024, "a");
  const formData = new FormData();
  formData.append("avatar", new Blob([largeBuffer], { type: "image/jpeg" }), "huge-photo.jpg");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.ok(res.status >= 400 && res.status < 500);
  const data = await res.json();
  assert.match(data.message, /too large/i);

  const uploadsAfter = new Set(fs.readdirSync("uploads"));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("profile update without avatar succeeds and leaves existing avatar intact", async () => {
  mockUser.avatar_url = "/uploads/avatar-existing.png";

  const formData = new FormData();
  formData.append("firstName", "Jane");
  formData.append("bio", "New bio without new avatar");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.firstName, "Jane");
  assert.equal(data.avatar_url, "/uploads/avatar-existing.png");
});

test("failed profile update cleans up temporary file (no orphaned files)", async () => {
  const uploadsBefore = new Set(fs.readdirSync("uploads"));

  const formData = new FormData();
  formData.append("avatar", new Blob(["fake-avatar-data"], { type: "image/webp" }), "avatar.webp");
  // Send invalid email to trigger 400 from updateProfileSchema
  formData.append("email", "invalid-email-address");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);

  // Wait a small tick for the response finish cleanup to complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  const uploadsAfter = new Set(fs.readdirSync("uploads"));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("failed profile update on duplicate email cleans up temporary file", async () => {
  // Simulate email already in use
  User.findOne = async () => ({ id: 99, email: "taken@example.com" });

  const uploadsBefore = new Set(fs.readdirSync("uploads"));

  const formData = new FormData();
  formData.append("avatar", new Blob(["fake-avatar-data"], { type: "image/png" }), "avatar.png");
  formData.append("email", "taken@example.com");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.message, "Email already in use");

  // Wait a small tick for cleanup
  await new Promise((resolve) => setTimeout(resolve, 50));

  const uploadsAfter = new Set(fs.readdirSync("uploads"));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});
