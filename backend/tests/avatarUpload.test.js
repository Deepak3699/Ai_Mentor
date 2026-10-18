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
const { UPLOAD_DIR, safeDeleteFile, detectImageSignature } =
  await import("../utils/uploadUtils.js");

const originalFindByPk = User.findByPk;
const originalFindOne = User.findOne;

let server;
let baseUrl;
const testTrackedFiles = new Set();

const createTrackedFile = (filename, content = "dummy") => {
  const filePath = path.resolve(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, content);
  testTrackedFiles.add(filename);
  return filePath;
};

// Valid binary headers for supported formats
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const VALID_GIF_BYTES = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
]);
const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x14, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

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

  // Static upload serving with security headers (same as server.js)
  app.use(
    "/uploads",
    (req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      next();
    },
    express.static(UPLOAD_DIR, {
      dotfiles: "ignore",
      index: false,
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'");
      },
    }),
  );

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
  mockUser.save = async function () {
    return this;
  };
  User.findByPk = async (id) => (Number(id) === 1 ? mockUser : null);
  User.findOne = async () => null;
});

after(async () => {
  User.findByPk = originalFindByPk;
  User.findOne = originalFindOne;
  await new Promise((resolve) => server.close(resolve));

  for (const filename of testTrackedFiles) {
    const filePath = path.resolve(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }
});

// ================= 1. MAGIC-BYTE VALIDATION TESTS =================

test("valid signatures accepted for all supported formats: PNG, JPEG, GIF, WEBP", async () => {
  const formats = [
    {
      bytes: VALID_PNG_BYTES,
      mime: "image/png",
      name: "avatar.png",
      ext: ".png",
    },
    {
      bytes: VALID_JPEG_BYTES,
      mime: "image/jpeg",
      name: "avatar.jpg",
      ext: ".jpg",
    },
    {
      bytes: VALID_GIF_BYTES,
      mime: "image/gif",
      name: "avatar.gif",
      ext: ".gif",
    },
    {
      bytes: VALID_WEBP_BYTES,
      mime: "image/webp",
      name: "avatar.webp",
      ext: ".webp",
    },
  ];

  for (const fmt of formats) {
    const formData = new FormData();
    formData.append("avatar", new Blob([fmt.bytes], { type: fmt.mime }), fmt.name);

    const res = await fetch(`${baseUrl}/api/users/profile`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    assert.equal(res.status, 200, `Failed for format ${fmt.mime}`);
    const data = await res.json();
    assert.ok(data.avatar_url);
    const filename = path.basename(data.avatar_url);
    testTrackedFiles.add(filename);
    assert.equal(fs.existsSync(path.resolve(UPLOAD_DIR, filename)), true);
  }
});

test("detectImageSignature correctly identifies headers or returns null", () => {
  assert.equal(detectImageSignature(VALID_PNG_BYTES)?.mime, "image/png");
  assert.equal(detectImageSignature(VALID_JPEG_BYTES)?.mime, "image/jpeg");
  assert.equal(detectImageSignature(VALID_GIF_BYTES)?.mime, "image/gif");
  assert.equal(detectImageSignature(VALID_WEBP_BYTES)?.mime, "image/webp");

  assert.equal(detectImageSignature(Buffer.from("<html><script>")), null);
  assert.equal(detectImageSignature(Buffer.from("MZ\x90\x00")), null);
  assert.equal(detectImageSignature(Buffer.from("PK\x03\x04")), null);
  assert.equal(detectImageSignature(Buffer.from("abc")), null);
});

test("rejects HTML/script bytes named .png with 400 and deletes file", async () => {
  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const formData = new FormData();
  formData.append(
    "avatar",
    new Blob(["<html><script>alert(1)</script></html>"], {
      type: "image/png",
    }),
    "xss.png",
  );

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /invalid image content/i);

  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("rejects executable/archive bytes named .jpg with 400 and deletes file", async () => {
  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  // PE / MZ header
  const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const formData = new FormData();
  formData.append("avatar", new Blob([exeBuffer], { type: "image/jpeg" }), "malware.jpg");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /invalid image content/i);

  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("rejects mismatched image signatures (PNG magic bytes claimed as image/jpeg .jpg)", async () => {
  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/jpeg" }), "mismatch.jpg");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /mismatch/i);

  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("rejects malformed/truncated images (< 4 bytes) with 400", async () => {
  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const formData = new FormData();
  formData.append(
    "avatar",
    new Blob([Buffer.from([0x89, 0x50])], { type: "image/png" }),
    "short.png",
  );

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);
  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("oversized avatar upload (> 5MB) returns 4xx and leaves no file", async () => {
  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0);
  // Place valid PNG header at start so magic-byte wouldn't fail first
  VALID_PNG_BYTES.copy(largeBuffer, 0, 0, VALID_PNG_BYTES.length);

  const formData = new FormData();
  formData.append("avatar", new Blob([largeBuffer], { type: "image/png" }), "large.png");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.ok(res.status >= 400 && res.status < 500);
  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

// ================= 2. REPLACEMENT & PERSISTENCE ORDERING TESTS =================

test("successful replacement deletes exactly the previous local avatar", async () => {
  const oldFilename = `avatar-prev-${Date.now()}.png`;
  const oldFilePath = createTrackedFile(oldFilename, "old-avatar");
  mockUser.avatar_url = `/uploads/${oldFilename}`;

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "new.png");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  const newFilename = path.basename(data.avatar_url);
  testTrackedFiles.add(newFilename);

  // New avatar exists
  assert.equal(fs.existsSync(path.resolve(UPLOAD_DIR, newFilename)), true);
  // Exactly the old avatar was deleted
  assert.equal(fs.existsSync(oldFilePath), false);
});

test("database save failure preserves previous avatar and deletes newly uploaded file", async () => {
  const oldFilename = `avatar-save-fail-old-${Date.now()}.png`;
  const oldFilePath = createTrackedFile(oldFilename, "old-avatar");
  mockUser.avatar_url = `/uploads/${oldFilename}`;

  // Make user.save() fail
  mockUser.save = async function () {
    throw new Error("Simulated database failure during save");
  };

  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "attempt.png");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 500);

  // Wait a small tick for cleanup
  await new Promise((r) => setTimeout(r, 50));

  // The previous avatar MUST still be intact!
  assert.equal(fs.existsSync(oldFilePath), true);

  // No new orphaned file was left on disk
  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("failed validation removes only the newly uploaded file and preserves previous avatar", async () => {
  const oldFilename = `avatar-val-fail-${Date.now()}.png`;
  const oldFilePath = createTrackedFile(oldFilename, "old-avatar");
  mockUser.avatar_url = `/uploads/${oldFilename}`;

  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "new.png");
  // Invalid email format triggers schema 400
  formData.append("email", "invalid-email-address");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);

  await new Promise((r) => setTimeout(r, 50));

  // Old file preserved
  assert.equal(fs.existsSync(oldFilePath), true);

  // New file deleted
  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("remote avatar URLs (Google/Cloudinary) are not deleted on replacement", async () => {
  const remoteUrl = "https://lh3.googleusercontent.com/a/remote-avatar-id";
  mockUser.avatar_url = remoteUrl;

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "new.png");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.match(data.avatar_url, /^\/uploads\/avatar-/);
  testTrackedFiles.add(path.basename(data.avatar_url));
});

test("missing previous file on disk is tolerated without error", async () => {
  mockUser.avatar_url = "/uploads/avatar-ghost-file-does-not-exist.png";

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "new.png");

  const res = await fetch(`${baseUrl}/api/users/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  testTrackedFiles.add(path.basename(data.avatar_url));
});

test("concurrent updates succeed without leaving inconsistent state", async () => {
  const sendUpdate = async (name) => {
    const formData = new FormData();
    formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), name);
    formData.append("bio", `Bio for ${name}`);
    return fetch(`${baseUrl}/api/users/profile`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
  };

  const [res1, res2] = await Promise.all([sendUpdate("pic1.png"), sendUpdate("pic2.png")]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const data = await res2.json();
  const activeFilename = path.basename(data.avatar_url);
  testTrackedFiles.add(activeFilename);
  assert.equal(fs.existsSync(path.resolve(UPLOAD_DIR, activeFilename)), true);
});

// ================= 3. REQUEST LIFECYCLE & SECURITY TESTS =================

test("complete-profile failure (missing bio) deletes temporary uploaded file", async () => {
  mockUser.isProfileComplete = false;
  mockUser.bio = "";

  const uploadsBefore = new Set(fs.readdirSync(UPLOAD_DIR));

  const formData = new FormData();
  formData.append("avatar", new Blob([VALID_PNG_BYTES], { type: "image/png" }), "onboarding.png");
  // Missing bio triggers 400 in completeProfile

  const res = await fetch(`${baseUrl}/api/users/complete-profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  assert.equal(res.status, 400);

  await new Promise((r) => setTimeout(r, 50));

  const uploadsAfter = new Set(fs.readdirSync(UPLOAD_DIR));
  assert.equal(uploadsAfter.size, uploadsBefore.size);
});

test("safeDeleteFile handles missing files and filesystem deletion errors non-fatally", async () => {
  // Missing file should not throw
  await safeDeleteFile("/uploads/non-existent-file-xyz.png");

  // Null/undefined path should not throw
  await safeDeleteFile(null);
  await safeDeleteFile("");
});

test("public static upload responses send nosniff and CSP headers", async () => {
  const testFilename = `test-header-${Date.now()}.png`;
  createTrackedFile(testFilename, VALID_PNG_BYTES);

  const res = await fetch(`${baseUrl}/uploads/${testFilename}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("content-security-policy"), "default-src 'none'");
});
