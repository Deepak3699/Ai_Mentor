/**
 * Utilities for course lesson parsing and deterministic AI lesson course selection.
 */

export const parseLessonCount = (course) =>
  Number(course?.total) ||
  Number(course?.lessonsCount) ||
  Number.parseInt(String(course?.lessons || "0"), 10) ||
  0;

/**
 * Calculates progress percentage (0 to 100) for a course.
 */
export const calculateCourseProgress = (course) => {
  const total = parseLessonCount(course);
  if (total <= 0) return 0;
  const completed = Number(course?.completed) || 0;
  return Math.min(100, Math.max(0, (completed / total) * 100));
};

/**
 * Deterministic comparator for courses:
 * 1. Progress ratio descending (highest progress % first)
 * 2. Alphabetical by title/name ascending (A to Z) as tie-breaker
 * 3. Course ID ascending as final stable tie-breaker
 */
export const compareCoursesDeterministically = (a, b) => {
  const progressA = calculateCourseProgress(a);
  const progressB = calculateCourseProgress(b);

  if (progressB !== progressA) {
    return progressB - progressA;
  }

  const titleA = String(a?.title || a?.name || "")
    .trim()
    .toLowerCase();
  const titleB = String(b?.title || b?.name || "")
    .trim()
    .toLowerCase();
  const titleDiff = titleA.localeCompare(titleB);
  if (titleDiff !== 0) {
    return titleDiff;
  }

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
};

/**
 * Deterministically selects the best enrolled course for AI lesson generation.
 * Priority rule:
 * 1. In-progress courses (0 < completed < total): sorted by highest progress % first, then alphabetical title, then ID.
 * 2. Not-yet-started courses (completed === 0, total > 0): sorted by alphabetical title, then ID.
 * 3. Completed courses (completed >= total, total > 0): sorted by alphabetical title, then ID.
 * Courses with 0 lessons are ineligible and filtered out.
 */
export const selectEligibleAICourse = (enrolledList = []) => {
  if (!Array.isArray(enrolledList) || enrolledList.length === 0) return null;
  const withLessons = enrolledList.filter((c) => parseLessonCount(c) > 0);
  if (withLessons.length === 0) return null;

  // 1. In-progress courses (0 < completed < total)
  const inProgress = withLessons
    .filter((c) => {
      const completed = Number(c?.completed) || 0;
      const total = parseLessonCount(c);
      return completed > 0 && completed < total;
    })
    .sort(compareCoursesDeterministically);

  if (inProgress.length > 0) return inProgress[0];

  // 2. Not-yet-started courses (completed === 0, total > 0)
  const notStarted = withLessons
    .filter((c) => (Number(c?.completed) || 0) === 0)
    .sort(compareCoursesDeterministically);

  if (notStarted.length > 0) return notStarted[0];

  // 3. Completed courses (completed >= total)
  const completed = withLessons
    .filter((c) => (Number(c?.completed) || 0) >= parseLessonCount(c))
    .sort(compareCoursesDeterministically);

  if (completed.length > 0) return completed[0];

  return null;
};
