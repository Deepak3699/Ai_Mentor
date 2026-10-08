import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const probe = `
  const [{ sequelize }, { default: cloudinary }, { default: admin }] = await Promise.all([
    import("./config/db.js"),
    import("./config/cloudinary.js"),
    import("firebase-admin"),
  ]);
  await import("./controllers/authController.js");
  const cloudinaryConfig = cloudinary.config();
  console.log(JSON.stringify({
    database: sequelize.config.database,
    host: sequelize.config.host,
    cloudName: cloudinaryConfig.cloud_name ?? null,
    firebaseApps: admin.apps.length,
  }));
`;

test("test mode ignores production database, Cloudinary, and Firebase settings", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      NEON_DATABASE_URL: "postgresql://prod-user:prod-password@prod.invalid/prod?sslmode=require",
      CLOUDINARY_CLOUD_NAME: "production-cloud",
      CLOUDINARY_API_KEY: "production-key",
      CLOUDINARY_API_SECRET: "production-secret",
      FIREBASE_PROJECT_ID: "production-project",
      FIREBASE_CLIENT_EMAIL: "firebase@example.com",
      FIREBASE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\\n${"x".repeat(80)}\\n-----END PRIVATE KEY-----\\n`,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stderr, /SECURITY WARNING/);
  assert.doesNotMatch(result.stdout, /Firebase initialized successfully/);

  const lines = result.stdout.trim().split(/\r?\n/);
  const details = JSON.parse(lines.at(-1));
  assert.deepEqual(details, {
    database: "ai_mentor_test",
    host: "127.0.0.1",
    cloudName: null,
    firebaseApps: 0,
  });
});
