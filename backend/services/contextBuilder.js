export const buildUserContext = (
  user,
  preferences
) => {
  const courses =
    user.purchasedCourses || [];

  const enrolledCourses =
    courses.map(c => c.courseTitle);

  let completedLessons = 0;

  courses.forEach(course => {
    completedLessons +=
      course.progress?.completedLessons
        ?.length || 0;
  });

  return `
User Information

Name:
${user.name}

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

Completed Lessons:
${completedLessons}

Language:
${user.settings?.appearance?.language || "en"}

Theme:
${user.settings?.appearance?.theme || "light"}
`;
};