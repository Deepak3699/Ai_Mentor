import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserContext, MAX_USER_CONTEXT_CHARS } from "../services/contextBuilder.js";

const size = (text) => Array.from(text).length;

const makeCourse = (i, lessons = 30) => ({
  courseId: i,
  courseTitle: `Course ${i}: A Fairly Long Descriptive Course Title`,
  progress: {
    completedLessons: Array.from({ length: lessons }, (_, j) => ({
      lessonId: j,
      title: `Lesson ${j}: Some topic name here`,
    })),
    currentLesson: { lessonId: lessons, title: `Current lesson of course ${i}` },
  },
});

const makeUser = (courseCount, lessons) => ({
  name: "Test Learner",
  purchasedCourses: Array.from({ length: courseCount }, (_, i) => makeCourse(i, lessons)),
  settings: { appearance: { language: "en", theme: "dark" } },
});

// ---------- existing behavior (unchanged) ----------

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

// ---------- updated: other courses are now summarized (#659) ----------

test("summarizes course progress as counts and keeps the total completed lessons", () => {
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

  assert.match(context, /JavaScript: 2 completed/);
  assert.match(context, /Python: 1 completed/);
  assert.match(context, /Completed Lessons:\n3/);

  // Intentional change (#659): lesson lists of non-active courses are no longer sent.
  assert.doesNotMatch(context, /Variables/);
  assert.doesNotMatch(context, /Loops/);
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
  assert.match(context, /Enrolled Courses:\nJavaScript, Python/);
  assert.match(context, /JavaScript: 0 completed/);
  assert.match(context, /Python: 0 completed/);
});

// ---------- new: size budget (#659) ----------

test("stays under the budget for a 20-course x 30-lesson learner", () => {
  const context = buildUserContext(makeUser(20, 30), { learning_goal: "Get a job" });

  assert.ok(size(context) <= MAX_USER_CONTEXT_CHARS);
});

test("stays under the budget for extreme data", () => {
  const huge = "x".repeat(5000);
  const preferences = {
    learning_goal: huge,
    experience_level: huge,
    explanation_type: huge,
    learning_style: huge,
    teaching_pace: huge,
    example_type: huge,
    focus_area: huge,
  };
  const context = buildUserContext(makeUser(200, 500), preferences);

  assert.ok(size(context) <= MAX_USER_CONTEXT_CHARS);
});

test("handles a new user with no courses or preferences", () => {
  const context = buildUserContext({ name: "New" }, null);

  assert.match(context, /None identified/);
  assert.match(context, /Enrolled Courses:\nNone/);
  assert.ok(size(context) <= MAX_USER_CONTEXT_CHARS);
});

test("never splits emoji and strips control characters", () => {
  const preferences = { learning_goal: "🚀".repeat(500) + "\u0000\u0007bad" };
  const context = buildUserContext({ name: "T" }, preferences);

  assert.doesNotMatch(context, /[\u0000-\u0008\u000B-\u001F\u007F]/);
  assert.equal(context.toWellFormed(), context);
  assert.ok(size(context) <= MAX_USER_CONTEXT_CHARS);
});

// ---------- new: content kept for the active course ----------

test("keeps only the most recent completed lessons of the active course", () => {
  const context = buildUserContext(makeUser(20, 30), {});

  assert.match(context, /Current lesson of course 0 \(ID: 30\)/);
  assert.match(context, /Lesson 29: Some topic name here \(ID: 29\)/);
  assert.match(context, /\(\+20 earlier\)/);
  assert.doesNotMatch(context, /Lesson 5: Some topic name here/);
  assert.match(context, /Enrolled Courses:\nCourse 0: /);
  assert.match(context, /\+10 more/);
  assert.match(context, /Completed Lessons:\n600/);
});