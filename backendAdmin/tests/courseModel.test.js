import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DataTypes } from "sequelize";

process.env.NODE_ENV = "test";
process.env.NEON_DATABASE_URL = "postgres://test:test@localhost:5432/testdb";

const { default: Course } = await import("../models/Course.js");
const { defineCourse } = await import("../../packages/shared-models/Course.js");

const EXPECTED_FIELDS = [
  "id",
  "title",
  "category",
  "categoryColor",
  "lessons",
  "lessonsCount",
  "level",
  "price",
  "priceValue",
  "currency",
  "rating",
  "students",
  "studentsCount",
  "image",
  "status",
  "createdAt",
  "updatedAt",
];

after(async () => {
  await Course.sequelize.close();
});

test("admin backend registers the shared Course schema", () => {
  assert.equal(Course.getTableName(), "Courses");
  assert.deepEqual(Object.keys(Course.rawAttributes), EXPECTED_FIELDS);
  assert.equal(Course.rawAttributes.priceValue.type.toString(), "INTEGER");
  assert.equal(Course.rawAttributes.rating.type.toString(), "FLOAT");
  assert.equal(Course.rawAttributes.currency.defaultValue, "INR");
  assert.equal(Course.rawAttributes.status.defaultValue, "published");
  assert.equal(Course.options.timestamps, true);
});

test("defining the shared model twice is safe", () => {
  assert.equal(defineCourse(Course.sequelize, DataTypes), Course);
});
