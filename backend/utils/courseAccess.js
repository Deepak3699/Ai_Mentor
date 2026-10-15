const hasCourseAccess = (user, courseId) => {
  if (!user) {
    return false;
  }

  const role = String(user.role || "").toLowerCase();

  if (role === "admin" || role === "superadmin") {
    return true;
  }

  const purchasedCourses = Array.isArray(user.purchasedCourses) ? user.purchasedCourses : [];

  return purchasedCourses.some((course) => {
    const purchasedCourseId =
      course !== null && typeof course === "object" ? (course.courseId ?? course.id) : course;

    return String(purchasedCourseId) === String(courseId);
  });
};

export default hasCourseAccess;
