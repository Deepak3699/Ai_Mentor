import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { detectIntent } = await import("../services/intentService.js");
const { buildUserContext } = await import("../services/contextBuilder.js");
const { detectNavigation } = await import("../services/navigationService.js");
const { generateCertificatePDF } = await import("../templates/certificateTemplate.js");

test("intent detection prioritizes information requests before navigation", () => {
  assert.deepEqual(detectIntent("What courses am I enrolled in?"), { type: "course_info" });
  assert.deepEqual(detectIntent("Show my learning style"), { type: "preference_info" });
  assert.deepEqual(detectIntent("How is my course progress?"), { type: "progress_info" });
  assert.deepEqual(detectIntent("Open settings"), { type: "navigation", route: "/settings" });
  assert.deepEqual(detectIntent("Explain closures"), { type: "ai" });
});

test("intent navigation routes match the application paths", () => {
  assert.equal(detectIntent("open community").route, "/discussions");
  assert.equal(detectIntent("browse courses").route, "/courses");
  assert.equal(detectIntent("open watch history").route, "/watchedvideos");
  assert.equal(detectIntent("open certificates").route, "/certificates");
});

test("navigation service maps supported destinations and ignores unrelated messages", () => {
  assert.ok(detectNavigation("show preferences"));
  assert.ok(detectNavigation("change theme in settings"));
  assert.ok(detectNavigation("open my profile"));
  assert.ok(detectNavigation("browse a course"));
  assert.ok(detectNavigation("visit community"));
  assert.equal(detectNavigation("explain binary search"), null);
});

test("user context summarizes courses, progress, preferences, language, and theme", () => {
  const context = buildUserContext(
    {
      name: "Learner",
      purchasedCourses: [
        { courseTitle: "JavaScript", progress: { completedLessons: [1, 2] } },
        { courseTitle: "Node", progress: { completedLessons: [1] } },
      ],
      settings: { appearance: { language: "hi", theme: "dark" } },
    },
    {
      experience_level: "Intermediate",
      learning_goal: "Backend",
      learning_style: "Practice",
      weekly_commitment: "5 hours",
      interested_topics: ["APIs", "Databases"],
    },
  );
  for (const expected of ["Learner", "Intermediate", "Backend", "JavaScript, Node", "Completed Lessons:\n3", "Language:\nhi", "Theme:\ndark"]) {
    assert.match(context, new RegExp(expected));
  }
});

test("user context supplies safe defaults for missing optional information", () => {
  const context = buildUserContext({ name: "Learner" }, null);
  assert.match(context, /Experience Level:\nUnknown/);
  assert.match(context, /Enrolled Courses:\nNone/);
  assert.match(context, /Completed Lessons:\n0/);
  assert.match(context, /Language:\nen/);
  assert.match(context, /Theme:\nlight/);
});

test("certificate template produces a valid PDF for ordinary input", async () => {
  const bytes = await generateCertificatePDF("Neeraj Kumar Saini", "Backend Engineering", "October 5, 2026");
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.length > 1000);
});

test("certificate template safely handles long course titles", async () => {
  const bytes = await generateCertificatePDF(
    "Learner Name",
    "A very long course title designed to exceed the certificate display limit and verify safe truncation behavior",
    "October 5, 2026",
  );
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(bytes.length > 1000);
});
