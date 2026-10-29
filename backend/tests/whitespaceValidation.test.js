/**
 * Tests for Issue #406 — Whitespace-only values rejected for required text fields
 *
 * Covers: courseSchema, authSchema, communitySchema, aiSchema, userSchema
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { addCourseSchema, addModulesSchema, addLessonsSchema, addSubtopicsSchema } from "../schemas/courseSchema.js";
import { registerSchema } from "../schemas/authSchema.js";
import { createPostSchema, replySchema, editPostSchema, editReplySchema } from "../schemas/communitySchema.js";
import { generateVideoSchema } from "../schemas/aiSchema.js";
import { updateProfileSchema } from "../schemas/userSchema.js";

// Helper — assert schema rejects the given value
function rejects(schema, value, label) {
  const result = schema.safeParse(value);
  assert.equal(result.success, false, `Expected ${label} to be rejected but it was accepted`);
}

// Helper — assert schema accepts the given value
function accepts(schema, value, label) {
  const result = schema.safeParse(value);
  assert.equal(result.success, true, `Expected ${label} to be accepted but it was rejected: ${JSON.stringify(result.error?.issues)}`);
}

// ──────────────────────────────────────────────
// courseSchema
// ──────────────────────────────────────────────
describe("courseSchema — whitespace validation", () => {
  it("rejects whitespace-only course title", () => {
    rejects(addCourseSchema, { title: "   ", category: "Math" }, "whitespace-only title");
  });

  it("rejects tab-only course title", () => {
    rejects(addCourseSchema, { title: "\t", category: "Math" }, "tab-only title");
  });

  it("rejects empty course title", () => {
    rejects(addCourseSchema, { title: "", category: "Math" }, "empty title");
  });

  it("rejects whitespace-only category", () => {
    rejects(addCourseSchema, { title: "Intro to AI", category: "   " }, "whitespace-only category");
  });

  it("accepts valid course title and category", () => {
    accepts(addCourseSchema, { title: "Intro to AI", category: "Technology" }, "valid course");
  });

  it("accepts title with leading/trailing spaces (trimmed to valid)", () => {
    accepts(addCourseSchema, { title: "  Intro to AI  ", category: "Tech" }, "padded title");
  });

  it("rejects whitespace-only module title", () => {
    rejects(addModulesSchema, { modules: [{ title: "   " }] }, "whitespace-only module title");
  });

  it("accepts valid module title", () => {
    accepts(addModulesSchema, { modules: [{ title: "Module 1" }] }, "valid module title");
  });

  it("rejects whitespace-only lesson title", () => {
    rejects(
      addLessonsSchema,
      { lessons: [{ id: "l1", title: "  " }] },
      "whitespace-only lesson title",
    );
  });

  it("rejects whitespace-only lesson id", () => {
    rejects(
      addLessonsSchema,
      { lessons: [{ id: "   ", title: "Lesson 1" }] },
      "whitespace-only lesson id",
    );
  });

  it("accepts valid lesson", () => {
    accepts(
      addLessonsSchema,
      { lessons: [{ id: "l1", title: "Introduction" }] },
      "valid lesson",
    );
  });

  it("rejects whitespace-only subtopic", () => {
    rejects(addSubtopicsSchema, { subtopics: ["Variables", "   "] }, "whitespace-only subtopic");
  });

  it("accepts valid subtopics", () => {
    accepts(addSubtopicsSchema, { subtopics: ["Variables", "Loops"] }, "valid subtopics");
  });
});

// ──────────────────────────────────────────────
// authSchema
// ──────────────────────────────────────────────
describe("authSchema — whitespace validation", () => {
  const validUser = {
    firstName: "John",
    lastName: "Doe",
    name: "John Doe",
    email: "john@example.com",
    password: "Password1!",
  };

  it("rejects whitespace-only firstName", () => {
    rejects(registerSchema, { ...validUser, firstName: "   " }, "whitespace-only firstName");
  });

  it("rejects whitespace-only lastName", () => {
    rejects(registerSchema, { ...validUser, lastName: "\t" }, "whitespace-only lastName");
  });

  it("rejects whitespace-only name", () => {
    rejects(registerSchema, { ...validUser, name: "  " }, "whitespace-only name");
  });

  it("rejects empty firstName", () => {
    rejects(registerSchema, { ...validUser, firstName: "" }, "empty firstName");
  });

  it("accepts valid registration data", () => {
    accepts(registerSchema, validUser, "valid registration");
  });
});

// ──────────────────────────────────────────────
// communitySchema
// ──────────────────────────────────────────────
describe("communitySchema — whitespace validation", () => {
  it("rejects whitespace-only post content", () => {
    rejects(
      createPostSchema,
      { type: "global", category: "Tech", content: "   " },
      "whitespace-only post content",
    );
  });

  it("rejects empty post content", () => {
    rejects(
      createPostSchema,
      { type: "global", category: "Tech", content: "" },
      "empty post content",
    );
  });

  it("accepts valid global post", () => {
    accepts(
      createPostSchema,
      { type: "global", category: "Tech", content: "Hello world" },
      "valid global post",
    );
  });

  it("rejects whitespace-only reply text", () => {
    rejects(replySchema, { text: "   " }, "whitespace-only reply");
  });

  it("rejects whitespace-only editPost content", () => {
    rejects(editPostSchema, { content: "\t\n" }, "tab/newline-only edit content");
  });

  it("rejects whitespace-only editReply text", () => {
    rejects(editReplySchema, { text: "   " }, "whitespace-only editReply");
  });

  it("accepts valid reply", () => {
    accepts(replySchema, { text: "Great point!" }, "valid reply");
  });
});

// ──────────────────────────────────────────────
// aiSchema
// ──────────────────────────────────────────────
describe("aiSchema — whitespace validation", () => {
  it("rejects whitespace-only celebrity name", () => {
    rejects(
      generateVideoSchema,
      { courseId: 1, lessonId: 1, celebrity: "   " },
      "whitespace-only celebrity",
    );
  });

  it("rejects empty celebrity name", () => {
    rejects(
      generateVideoSchema,
      { courseId: 1, lessonId: 1, celebrity: "" },
      "empty celebrity",
    );
  });

  it("accepts valid generate video request", () => {
    accepts(
      generateVideoSchema,
      { courseId: 1, lessonId: 2, celebrity: "Albert Einstein" },
      "valid generate video",
    );
  });
});

// ──────────────────────────────────────────────
// userSchema
// ──────────────────────────────────────────────
describe("userSchema — whitespace validation", () => {
  it("rejects whitespace-only firstName in updateProfile", () => {
    rejects(updateProfileSchema, { firstName: "   " }, "whitespace-only firstName in profile");
  });

  it("rejects whitespace-only lastName in updateProfile", () => {
    rejects(updateProfileSchema, { lastName: "\t" }, "whitespace-only lastName in profile");
  });

  it("accepts valid profile update", () => {
    accepts(updateProfileSchema, { firstName: "Jane", lastName: "Smith" }, "valid profile update");
  });

  it("accepts profile update with no fields (all optional)", () => {
    accepts(updateProfileSchema, {}, "empty profile update — all fields optional");
  });
});
