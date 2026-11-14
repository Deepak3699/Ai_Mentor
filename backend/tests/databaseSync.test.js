import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const readmeSource = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");

test("server startup does not enable auto-alter in development or production (Issue #488)", () => {
  assert.equal(
    serverSource.includes("alter: true"),
    false,
    "server.js must not contain 'alter: true'",
  );
  assert.equal(
    serverSource.includes("development auto-alter enabled"),
    false,
    "server.js must not log 'development auto-alter enabled'",
  );
  assert.match(
    serverSource,
    /await\s+sequelize\.sync\(\s*\);/,
    "server.js should call sequelize.sync() without alter option",
  );
});

test("backend README accurately documents that auto-alter is disabled and migrations are used", () => {
  assert.equal(
    readmeSource.includes("sequelize.sync({ alter: true })"),
    false,
    "README.md must not reference 'sequelize.sync({ alter: true })'",
  );
  assert.match(
    readmeSource,
    /sequelize\.sync\(\)/,
    "README.md should document sequelize.sync() without auto-altering schemas",
  );
});

test("migration files export callable up and down functions", () => {
  const migrationsDir = path.join(__dirname, "../migrations");
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".js"));

  assert.ok(files.length > 0, "migrations directory should contain migration scripts");

  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const code = fs.readFileSync(migrationPath, "utf8");
    const cjsModule = { exports: {} };
    const context = vm.createContext({
      module: cjsModule,
      exports: cjsModule.exports,
      require: () => {},
      __dirname: migrationsDir,
      __filename: migrationPath,
    });
    vm.runInContext(code, context);

    assert.equal(
      typeof cjsModule.exports.up,
      "function",
      `Migration ${file} must export an async 'up' function`,
    );
    assert.equal(
      typeof cjsModule.exports.down,
      "function",
      `Migration ${file} must export an async 'down' function`,
    );
  }
});
