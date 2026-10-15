import { ArrowRight, GraduationCap, Play } from "lucide-react";
import { Link } from "react-router-dom";

const ContinueLearningCard = ({
  course,
  onContinue,
  onExplore,
  artworkFor,
  buttonClass,
}) => {
  const progress = Math.min(100, Math.max(0, Number(course?.progress) || 0));
  const isCompleted =
    course?.total > 0 && course.completed >= course.total;
  const isInProgress = course?.completed > 0 && !isCompleted;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-main">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3867D6] text-white">
            <Play className="h-4 w-4 fill-current" />
          </span>
          Continue Learning
        </h2>

        <Link
          to="/courses"
          className="shrink-0 text-sm font-bold text-[#3867D6] hover:underline"
        >
          View All →
        </Link>
      </div>

      {course ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-canvas-alt p-3 sm:flex-row sm:items-center">
          <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-slate-950 sm:h-28 sm:w-32">
            <img
              src={artworkFor(course.title)}
              alt={course.title}
              className="h-full w-full object-cover"
            />

            <span
              className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-bold text-white ${
                isCompleted
                  ? "bg-blue-600"
                  : isInProgress
                    ? "bg-emerald-500"
                    : "bg-slate-600"
              }`}
            >
              {isCompleted
                ? "Completed"
                : isInProgress
                  ? "In Progress"
                  : "Not Started"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                title={course.title}
                className="min-w-0 truncate font-extrabold text-main"
              >
                {course.title}
              </h3>

              <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-600">
                {course.category || "Web Development"}
              </span>
            </div>

            <p
              title={course.currentLessonTitle || ""}
              className="mt-1 truncate text-sm text-muted"
            >
              {course.currentLessonTitle ||
                (course.completed > 0
                  ? `${course.completed} of ${course.total || "?"} lessons completed`
                  : "Ready for the first lesson")}
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-label="Course progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <span className="shrink-0 text-xs font-semibold text-muted">
                {progress}%
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
              <span>
                ⏱{" "}
                {typeof course.duration === "number"
                  ? `${course.duration} min`
                  : course.duration || "15 min"}
              </span>
              <span>📊 {course.level || "Beginner"}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className={`${buttonClass} w-full shrink-0 active:scale-[0.98] active:bg-[#2A4FA0] sm:w-auto`}
          >
            Continue Learning
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-[#3867D6]" />
          <h3 className="mt-3 font-extrabold text-main">
            Choose the next skill to learn
          </h3>
          <p className="mt-1 text-sm text-muted">
            Explore the course catalog to begin a learning path.
          </p>
          <button
            type="button"
            onClick={onExplore}
            className={`${buttonClass} mt-5`}
          >
            Explore courses
          </button>
        </div>
      )}
    </section>
  );
};

export default ContinueLearningCard;