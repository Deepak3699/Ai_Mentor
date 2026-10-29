import assert from "node:assert/strict";
import { test } from "node:test";
import { DataTypes, Sequelize } from "sequelize";
import { persistSyllabus } from "../services/syllabusService.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "rolls back all generated rows when a lesson insert fails",
  { skip: !databaseUrl && "Set TEST_DATABASE_URL to run the Postgres rollback integration test." },
  async () => {
    const database = new Sequelize(databaseUrl, { logging: false });
    const suffix = `${process.pid}_${Date.now()}`;
    const modules = database.define(
      `SyllabusModule${suffix}`,
      {
        courseId: { type: DataTypes.INTEGER, allowNull: false },
        title: { type: DataTypes.STRING, allowNull: false },
        order: { type: DataTypes.INTEGER, allowNull: false },
      },
      { tableName: `syllabus_modules_${suffix}`, timestamps: false },
    );
    const lessons = database.define(
      `SyllabusLesson${suffix}`,
      {
        moduleId: { type: DataTypes.INTEGER, allowNull: false },
        title: { type: DataTypes.STRING, allowNull: false },
        duration: { type: DataTypes.STRING, allowNull: false },
        type: { type: DataTypes.STRING, allowNull: false },
        order: { type: DataTypes.INTEGER, allowNull: false },
      },
      { tableName: `syllabus_lessons_${suffix}`, timestamps: false },
    );

    try {
      await database.authenticate();
      await database.sync({ force: true });
      let insertCount = 0;
      const failingLessonModel = {
        create: async (...args) => {
          insertCount += 1;
          if (insertCount === 2) throw new Error("simulated lesson insert failure");
          return lessons.create(...args);
        },
      };

      await assert.rejects(
        persistSyllabus(
          88,
          {
            modules: [
              {
                title: "First",
                lessons: [
                  { title: "One", duration: "5 mins", type: "video" },
                  { title: "Two", duration: "5 mins", type: "video" },
                ],
              },
              {
                title: "Second",
                lessons: [{ title: "Three", duration: "5 mins", type: "video" }],
              },
            ],
          },
          { database, ModuleModel: modules, LessonModel: failingLessonModel },
        ),
        /simulated lesson insert failure/,
      );

      assert.equal(await modules.count(), 0);
      assert.equal(await lessons.count(), 0);
    } finally {
      await database.drop();
      await database.close();
    }
  },
);
