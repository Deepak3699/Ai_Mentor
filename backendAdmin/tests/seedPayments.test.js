import { describe, test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { sequelize } from "../config/db.js";
import { User, Course } from "../models/index.js";
import { assertSeedingAllowed, seedPaymentData } from "../scripts/seedPayments.js";

const ENV_KEYS = ["NODE_ENV", "ALLOW_SEED_ON_REMOTE_DB"];

// In-memory stand-in for the database. Nothing here touches a real DB.
const installFakeDb = ({ users = new Map() } = {}) => {
  const courses = new Map();
  let nextId = 1;

  mock.method(sequelize, "authenticate", async () => {});
  mock.method(sequelize, "transaction", async (callback) => callback({}));

  mock.method(Course, "findOne", async ({ where }) => courses.get(where.title) ?? null);
  mock.method(Course, "findOrCreate", async ({ where, defaults }) => {
    const existing = courses.get(where.title);
    if (existing) return [existing, false];
    const row = { id: nextId++, ...defaults };
    courses.set(row.title, row);
    return [row, true];
  });

  mock.method(User, "findOne", async ({ where }) => users.get(where.email) ?? null);
  mock.method(User, "findOrCreate", async ({ where, defaults }) => {
    const existing = users.get(where.email);
    if (existing) return [existing, false];
    const row = { ...defaults };
    users.set(row.email, row);
    return [row, true];
  });

  return { courses, users };
};

describe("seedPayments", () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.NODE_ENV = "test";
    process.env.ALLOW_SEED_ON_REMOTE_DB = "true"; // safe: the DB is fully mocked
    mock.method(console, "log", () => {});
  });

  afterEach(() => {
    mock.restoreAll();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  describe("assertSeedingAllowed", () => {
    test("allows development and test", () => {
      for (const env of ["development", "test"]) {
        assert.doesNotThrow(() => assertSeedingAllowed({ env, remoteDb: false }));
      }
    });

    test("refuses production and staging", () => {
      for (const env of ["production", "staging"]) {
        assert.throws(
          () => assertSeedingAllowed({ env, remoteDb: false }),
          /Refusing to seed/
        );
      }
    });

    test("refuses when NODE_ENV is not set at all", () => {
      delete process.env.NODE_ENV; // afterEach restores it
      assert.throws(
        () => assertSeedingAllowed({ remoteDb: false }),
        /Refusing to seed/
      );
    });

    test("refuses a remote DB without explicit opt-in", () => {
      assert.throws(
        () => assertSeedingAllowed({ env: "development", remoteDb: true, allowRemote: false }),
        /remote database/
      );
      assert.doesNotThrow(() =>
        assertSeedingAllowed({ env: "development", remoteDb: true, allowRemote: true })
      );
    });
  });

  test("production run is blocked before any DB access", async () => {
    const db = installFakeDb();
    process.env.NODE_ENV = "production";

    await assert.rejects(() => seedPaymentData(), /Refusing to seed/);

    assert.equal(sequelize.authenticate.mock.callCount(), 0);
    assert.equal(Course.findOrCreate.mock.callCount(), 0);
    assert.equal(User.findOrCreate.mock.callCount(), 0);
    assert.equal(db.courses.size, 0);
    assert.equal(db.users.size, 0);
  });

  test("first run creates 3 courses and 3 users with linked purchases", async () => {
    const db = installFakeDb();

    const summary = await seedPaymentData();

    assert.deepEqual(summary, {
      coursesCreated: 3,
      coursesExisting: 0,
      usersCreated: 3,
      usersExisting: 0,
    });
    assert.equal(db.courses.size, 3);
    assert.equal(db.users.size, 3);

    const rahul = db.users.get("rahul@example.com");
    assert.equal(rahul.purchasedCourses.length, 2);
    assert.equal(rahul.purchasedCourses[0].courseId, db.courses.get("Mastering React").id);
  });

  test("re-running creates no duplicates", async () => {
    const db = installFakeDb();

    await seedPaymentData();
    const second = await seedPaymentData();

    assert.deepEqual(second, {
      coursesCreated: 0,
      coursesExisting: 3,
      usersCreated: 0,
      usersExisting: 3,
    });
    assert.equal(db.courses.size, 3);
    assert.equal(db.users.size, 3);
  });

  test("never overwrites an existing real user", async () => {
    const users = new Map([
      ["rahul@example.com", { email: "rahul@example.com", name: "Real Rahul", purchasedCourses: [] }],
    ]);
    const db = installFakeDb({ users });

    const summary = await seedPaymentData();

    assert.equal(summary.usersExisting, 1);
    assert.equal(summary.usersCreated, 2);
    assert.equal(db.users.get("rahul@example.com").name, "Real Rahul");
    assert.deepEqual(db.users.get("rahul@example.com").purchasedCourses, []);
  });

  test("--dry-run reports what would happen and writes nothing", async () => {
    const db = installFakeDb();

    const summary = await seedPaymentData({ dryRun: true });

    assert.deepEqual(summary, {
      coursesCreated: 3,
      coursesExisting: 0,
      usersCreated: 3,
      usersExisting: 0,
    });
    assert.equal(Course.findOrCreate.mock.callCount(), 0);
    assert.equal(User.findOrCreate.mock.callCount(), 0);
    assert.equal(db.courses.size, 0);
    assert.equal(db.users.size, 0);
  });
});