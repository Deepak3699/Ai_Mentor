import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Clock, Loader2 } from "lucide-react";
import { callApi } from "../utils/api";

export default function CourseDetailsPage({ courseId }) {
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId) {
      setError("Course ID is missing.");
      setLoading(false);
      return;
    }

    let active = true;

    const fetchCourseDetails = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await callApi(`/admin/courses/${courseId}/learning`);

        if (!active) return;

        setCourse(response.course || null);
        setModules(Array.isArray(response.modules) ? response.modules : []);
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load course details.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCourseDetails();

    return () => {
      active = false;
    };
  }, [courseId]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <button
        type="button"
        onClick={() => navigate("/courses")}
        className="flex items-center gap-2 text-sm font-semibold text-teal-600 hover:text-teal-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Courses
      </button>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-muted">
          <Loader2 className="w-6 h-6 animate-spin" />
          Loading course details...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-red-600">
          {error}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600">
              Course Details
            </p>

            <h1 className="mt-2 text-2xl font-bold text-main">
              {course?.title || "Untitled Course"}
            </h1>

            <p className="mt-2 text-sm text-muted">
              Category: {course?.category || "Not specified"}
            </p>

            <p className="mt-1 text-xs text-muted">Course ID: {course?.id || courseId}</p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-main">Modules and Lessons</h2>
            <span className="text-sm text-muted">{modules.length} modules</span>
          </div>

          {modules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted" />
              <p className="font-semibold text-main">No course content available</p>
              <p className="mt-1 text-sm text-muted">This course does not have any modules yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {modules.map((module, index) => (
                <div
                  key={module.id || index}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="border-b border-border bg-canvas-alt p-5">
                    <h3 className="font-bold text-main">
                      Module {index + 1}: {module.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted">{module.lessons?.length || 0} lessons</p>
                  </div>

                  <div className="divide-y divide-border">
                    {module.lessons?.length > 0 ? (
                      module.lessons.map((lesson, lessonIndex) => (
                        <div
                          key={lesson.id || lessonIndex}
                          className="flex flex-wrap items-center justify-between gap-3 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/10 text-xs font-bold text-teal-600">
                              {lessonIndex + 1}
                            </span>
                            <span className="text-sm font-medium text-main">{lesson.title}</span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted">
                            {lesson.duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {lesson.duration}
                              </span>
                            )}
                            {lesson.type && (
                              <span className="rounded-md bg-canvas-alt px-2 py-1 uppercase">
                                {lesson.type}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="p-4 text-sm italic text-muted">No lessons in this module.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
