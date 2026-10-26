export const buildUserContext = (user, preferences) => {
  const courses = Array.isArray(user?.purchasedCourses) ? user.purchasedCourses : [];

  const studentName = user?.firstName || user?.name || "Student";

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

  const enrolledCourses = courses.map((course) => course?.courseTitle).filter(Boolean);

  let completedLessons = 0;
  let activeCourseContext = "None identified";
  let hasActiveCourse = false;

  const courseProgress = courses.map((course) => {
    const courseTitle = course?.courseTitle || "Untitled course";
    const progress = course?.progress || {};
    const completed = Array.isArray(progress.completedLessons) ? progress.completedLessons : [];

    completedLessons += completed.length;

    const completedDetails = completed
      .map((lesson) => {
        const details = getLessonDetails(lesson);

        if (details.title && details.id != null) {
          return `${details.title} (ID: ${details.id})`;
        }

        if (details.title) {
          return details.title;
        }

        if (details.id != null) {
          return `Lesson ID: ${details.id}`;
        }

        return null;
      })
      .filter(Boolean);

    const currentLesson = getLessonDetails(progress.currentLesson);

    if (!hasActiveCourse && progress.currentLesson != null) {
      hasActiveCourse = true;

      const lessonDescription = currentLesson.title
        ? `${currentLesson.title}${currentLesson.id != null ? ` (ID: ${currentLesson.id})` : ""}`
        : currentLesson.id != null
          ? `Lesson ID: ${currentLesson.id}`
          : "Current lesson details unavailable";

      activeCourseContext = `Course: ${courseTitle}\nCurrent Lesson: ${lessonDescription}`;
    }

    const currentLessonDescription =
      progress.currentLesson == null
        ? "Not specified"
        : currentLesson.title
          ? `${currentLesson.title}${currentLesson.id != null ? ` (ID: ${currentLesson.id})` : ""}`
          : currentLesson.id != null
            ? `Lesson ID: ${currentLesson.id}`
            : "Details unavailable";

    return [
      `Course: ${courseTitle}`,
      `Completed Lessons (${completed.length}): ${
        completedDetails.join(", ") || "No lesson details available"
      }`,
      `Current Lesson: ${currentLessonDescription}`,
    ].join("\n");
  });

  return `
User Information

Name:
${studentName}

Learning Goal:
${preferences?.learning_goal || "Unknown"}

Experience Level:
${preferences?.experience_level || "Unknown"}

Explanation Type:
${preferences?.explanation_type || "Unknown"}

Learning Style:
${preferences?.learning_style || "Unknown"}

Teaching Pace:
${preferences?.teaching_pace || "Unknown"}

Example Type:
${preferences?.example_type || "Unknown"}

Focus Area:
${preferences?.focus_area || "Unknown"}

Enrolled Courses:
${enrolledCourses.join(", ") || "None"}

Active Course and Current Lesson:
${activeCourseContext}

Per-Course Progress:
${courseProgress.join("\n\n") || "No course progress available"}

Completed Lessons:
${completedLessons}

Language:
${user?.settings?.appearance?.language || "en"}

Theme:
${user?.settings?.appearance?.theme || "light"}
`;
};
