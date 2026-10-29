import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "avatar-test-secret";

const { default: express } = await import("express");
const { default: userRoutes } = await import("../routes/userRoutes.js");
const { default: User } = await import("../models/User.js");

const originals = {
  userFindByPk: User.findByPk,
};

let server;
let baseUrl;

before(async () => {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  User.findByPk = async (id) => ({
    id: String(id),
    name: "Test User",
    email: "test@example.com",
    role: "user",
    avatar_url: null,
    isProfileComplete: true,
    isBlocked: false,
    passwordChangedAt: null,
    purchasedCourses: [],
    async save() {},
  });

  const app = express();
  app.use("/api/users", userRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  User.findByPk = originals.userFindByPk;
  await new Promise((resolve) => server.close(resolve));
});

test("avatar upload rejects files larger than 2MB", async () => {
  const token = jwt.sign({ id: "user-1" }, process.env.JWT_SECRET);
  const boundary = "----WebKitFormBoundaryTest";
  const oversizedData = Buffer.alloc(2.5 * 1024 * 1024, "a");

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    oversizedData,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.deepEqual(data, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "Avatar file size must not exceed 2MB",
      details: [],
    },
  });
});

test("avatar upload rejects disallowed mime types and SVG/HTML", async () => {
  const token = jwt.sign({ id: "user-1" }, process.env.JWT_SECRET);
  const boundary = "----WebKitFormBoundaryTest";
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`,
    ),
    Buffer.from(svgContent),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.deepEqual(data, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "Only JPEG, PNG, and WebP images are allowed",
      details: [],
    },
  });
});

test("avatar upload accepts valid image and saves with safe random name", async () => {
  const token = jwt.sign({ id: "user-1" }, process.env.JWT_SECRET);
  const boundary = "----WebKitFormBoundaryTest";
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  let updatedAvatarUrl;
  User.findByPk = async (id) => ({
    id: String(id),
    name: "Test User",
    email: "test@example.com",
    role: "user",
    avatar_url: null,
    isProfileComplete: true,
    isBlocked: false,
    passwordChangedAt: null,
    purchasedCourses: [],
    async save() {
      updatedAvatarUrl = this.avatar_url;
    },
  });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    validPng,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  assert.equal(res.status, 200);
  assert.ok(updatedAvatarUrl.startsWith("/uploads/"));
  assert.ok(updatedAvatarUrl.endsWith(".png"));
  // Ensure the filename is not the original client-provided "photo.png" or just a timestamp
  const savedFilename = path.basename(updatedAvatarUrl);
  assert.notEqual(savedFilename, "photo.png");
  // Clean up uploaded file
  const fullPath = path.join(process.cwd(), "uploads", savedFilename);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
});
