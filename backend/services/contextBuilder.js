/**
 * USER CONTEXT BUDGET
 * -------------------
 * The user-context block is sent to Gemini on EVERY chat message, so its size
 * directly affects cost and latency. It is capped at MAX_USER_CONTEXT_CHARS.
 *
 * Total prompt = context (<= 4000) + history (<= 8000, see chatHistory.js) + message.
 * If you add fields here, keep them bounded and re-run tests/contextBuilder.test.js.
 *
 * Strategy: the active course/lesson is detailed; everything else is summarized.
 * Full course/progress lists are answered by the controller's intent shortcuts
 * (course_info, progress_info) and are intentionally NOT included here.
 *
 * Sections are ordered by priority. If the hard cap is ever hit, the tail
 * (settings, then course summary) is cut first, never the active lesson.
 */
export const MAX_USER_CONTEXT_CHARS = 4000;

const MAX_NAME_CHARS = 60;
const MAX_FIELD_CHARS = 120; // each preference value
const MAX_TITLE_CHARS = 80; // course / lesson titles
const MAX_SETTING_CHARS = 20; // language / theme values
const MAX_COURSES_LISTED = 10; // courses shown in the summary before "+N more"
const MAX_ACTIVE_COMPLETED = 10; // recent completed lessons of the active course

// Same character rules as chatHistory.js: keep tab/newline, drop other control characters.
const isAllowedChar = (char) => {
  const code = char.codePointAt(0);

  return code === 9 || code === 10 || (code >= 32 && code !== 127);
};

// Counts and cuts by Unicode characters, so an emoji is never split.
const cutChars = (text, max) => {
  const characters = Array.from(text);

  return characters.length > max ? `${characters.slice(0, max - 1).join("")}…` : text;
};

// Cleans untrusted text (titles, preferences), collapses whitespace, and bounds its length.
const truncate = (value, max) => {
  if (value == null) return "";

  const clean = Array.from(String(value).toWellFormed()).filter(isAllowedChar).join("");

  return cutChars(clean.replace(/\s+/g, " ").trim(), max);
};

const getLessonDetails = (lesson) => {
  if (lesson == null) {
    return { id: null, title: null };
  }

  if (typeof lesson === "object") {
    return {
      id: lesson.lessonId ?? lesson.id ?? null,
      title: lesson.title ?? lesson.lessonTitle ?? null,
    };
  }

  return { id: lesson, title: null };
};

const describeLesson = (lesson, fallback) => {
  const { id, title } = getLessonDetails(lesson);
  const shortTitle = truncate(title, MAX_TITLE_CHARS);
  const shortId = truncate(id, MAX_TITLE_CHARS);

  if (shortTitle && shortId) return `${shortTitle} (ID: ${shortId})`;
  if (shortTitle) return shortTitle;
  if (shortId) return `Lesson ID: ${shortId}`;
  return fallback;
};

const getCompleted = (course) =>
  Array.isArray(course?.progress?.completedLessons) ? course.progress.completedLessons : [];

export const buildUserContext = (user, preferences) => {
  const courses = Array.isArray(user?.purchasedCourses) ? user.purchasedCourses : [];
  const studentName = truncate(user?.firstName || user?.name || "Student", MAX_NAME_CHARS);

  const totalCompleted = courses.reduce((sum, course) => sum + getCompleted(course).length, 0);
  const activeCourse = courses.find((course) => course?.progress?.currentLesson != null);

  const sections = [];

  // 1. Identity
  sections.push(`User Information\n\nName:\n${studentName}`);

  // 2. Active course + current lesson (highest priority, full detail)
  if (activeCourse) {
    const completed = getCompleted(activeCourse);
    const recent = completed
      .slice(-MAX_ACTIVE_COMPLETED)
      .map((lesson) => describeLesson(lesson, null))
      .filter(Boolean);
    const omitted = completed.length - Math.min(completed.length, MAX_ACTIVE_COMPLETED);

    const lines = [
      "Active Course and Current Lesson:",
      `Course: ${truncate(activeCourse.courseTitle, MAX_TITLE_CHARS) || "Untitled course"}`,
      `Current Lesson: ${describeLesson(activeCourse.progress.currentLesson, "Details unavailable")}`,
      `Completed in this course: ${completed.length}`,
    ];

    if (recent.length) {
      lines.push(
        `Most recent completed: ${recent.join(", ")}${omitted > 0 ? ` (+${omitted} earlier)` : ""}`,
      );
    }

    sections.push(lines.join("\n"));
  } else {
    sections.push("Active Course and Current Lesson:\nNone identified");
  }

  // 3. Preferences (each value bounded)
  const prefFields = [
    ["Learning Goal", preferences?.learning_goal],
    ["Experience Level", preferences?.experience_level],
    ["Explanation Type", preferences?.explanation_type],
    ["Learning Style", preferences?.learning_style],
    ["Teaching Pace", preferences?.teaching_pace],
    ["Example Type", preferences?.example_type],
    ["Focus Area", preferences?.focus_area],
  ];

  sections.push(
    prefFields
      .map(([label, value]) => `${label}:\n${truncate(value, MAX_FIELD_CHARS) || "Unknown"}`)
      .join("\n\n"),
  );

  // 4. Enrolled courses: titles + counts only (no lesson lists)
  const shown = courses.slice(0, MAX_COURSES_LISTED);
  const extra = courses.length - shown.length;
  const titles = shown
    .map((course) => truncate(course?.courseTitle, MAX_TITLE_CHARS))
    .filter(Boolean);
  const progressLines = shown.map(
    (course) =>
      `${truncate(course?.courseTitle, MAX_TITLE_CHARS) || "Untitled course"}: ${getCompleted(course).length} completed`,
  );

  sections.push(
    [
      `Enrolled Courses:\n${titles.join(", ") || "None"}${extra > 0 ? `, +${extra} more` : ""}`,
      `Course Progress (counts only; only the active course is detailed):\n${
        progressLines.join("\n") || "No course progress available"
      }`,
      `Completed Lessons:\n${totalCompleted}`,
    ].join("\n\n"),
  );

  // 5. Settings (lowest priority, cut first if the budget is hit)
  sections.push(
    `Language:\n${truncate(user?.settings?.appearance?.language, MAX_SETTING_CHARS) || "en"}\n\n` +
      `Theme:\n${truncate(user?.settings?.appearance?.theme, MAX_SETTING_CHARS) || "light"}`,
  );

  // Final safety net: hard cap, counted in Unicode characters
  return cutChars(sections.join("\n\n"), MAX_USER_CONTEXT_CHARS);
};
