import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserContext } from "../services/contextBuilder.js";

test("uses firstName, then name, then Student as fallback", () => {
  const preferences = {};

  assert.match(
    buildUserContext({ firstName: "Sam", name: "Samruddhi" }, preferences),
    /Name:\nSam/,
  );

  assert.match(buildUserContext({ name: "Samruddhi" }, preferences), /Name:\nSamruddhi/);

  assert.match(buildUserContext({}, preferences), /Name:\nStudent/);
});

test("includes the active course and current lesson details", () => {
  const context = buildUserContext(
    {
      firstName: "Sam",
      purchasedCourses: [
        {
          courseTitle: "JavaScript",
          progress: {
            currentLesson: {
              lessonId: "lesson-12",
              title: "Closures",
            },
            completedLessons: [],
          },
        },
      ],
    },
    {},
  );

  assert.match(context, /Active Course and Current Lesson:/);
  assert.match(context, /Course: JavaScript/);
  assert.match(context, /Closures/);
  assert.match(context, /lesson-12/);
});

test("includes course-specific progress and total completed lessons", () => {
  const context = buildUserContext(
    {
      purchasedCourses: [
        {
          courseTitle: "JavaScript",
          progress: {
            completedLessons: [
              { id: "lesson-1", title: "Variables" },
              { id: "lesson-2", title: "Functions" },
            ],
          },
        },
        {
          courseTitle: "Python",
          progress: {
            completedLessons: [{ id: "lesson-3", title: "Loops" }],
          },
        },
      ],
    },
    {},
  );

  assert.match(context, /JavaScript/);
  assert.match(context, /Variables/);
  assert.match(context, /Functions/);
  assert.match(context, /Python/);
  assert.match(context, /Loops/);
  assert.match(context, /Completed Lessons:\n3/);
});

test("handles missing courses and incomplete progress safely", () => {
  const context = buildUserContext(
    {
      purchasedCourses: [
        { courseTitle: "JavaScript" },
        { courseTitle: "Python", progress: { completedLessons: null } },
      ],
    },
    {},
  );

  assert.match(context, /Active Course and Current Lesson:\nNone identified/);
  assert.match(context, /Completed Lessons:\n0/);
  assert.match(context, /Current Lesson: Not specified/);
});
