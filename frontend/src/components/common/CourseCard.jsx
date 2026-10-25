import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Atom,
  Braces,
  Clock3,
  GraduationCap,
  Layers,
  MoreVertical,
} from "lucide-react";

const badges = {
  Enrolled: "bg-blue-600 text-white",
  "In Progress": "bg-emerald-600 text-white",
  Completed: "bg-cyan-600 text-white",
};

export default function CourseCard({ course, progress }) {
  const [failedImage, setFailedImage] = useState(null);
  const legacyCount = String(course.lessons ?? "")
    .split(" of ")
    .pop();
  const count = Number(course.lessonsCount ?? Number.parseInt(legacyCount, 10));
  const total = Number.isFinite(count) && count > 0 ? count : 0;
  const completed = new Set(
    (Array.isArray(progress?.completedLessons) ? progress.completedLessons : [])
      .map((lesson) => (typeof lesson === "object" ? lesson?.lessonId : lesson))
      .filter((id) => id != null)
      .map(String),
  ).size;
  const started = completed > 0 || progress?.currentLesson != null;
  const finished = total > 0 && completed >= total;
  const status = finished ? "Completed" : started ? "In Progress" : "Enrolled";
  const percentage = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const action = finished ? "View Certificate" : started ? "Continue" : "Start Course";
  const learningPath = `/learning/${course.id}`;
  const Logo = /react/i.test(course.title)
    ? Atom
    : /node/i.test(course.title)
      ? Braces
      : /system/i.test(course.title)
        ? Layers
        : GraduationCap;

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-2 shadow-sm">
      <div className="relative flex aspect-[16/7] items-center justify-center gap-3 overflow-hidden rounded-xl bg-gradient-to-br from-[#0c2445] to-[#203b68] px-4 pt-5 text-white">
        {course.image && failedImage !== course.image ? (
          <img
            src={course.image}
            alt={course.title}
            loading="lazy"
            onError={() => setFailedImage(course.image)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <Logo className="h-12 w-12 shrink-0 text-cyan-300" aria-hidden="true" />
            <span className="line-clamp-2 text-lg font-bold">{course.title}</span>
          </>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${badges[status]}`}
        >
          {status}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-extrabold leading-5 text-main">{course.title}</h3>
          <details
            className="relative shrink-0"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary").focus();
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
          >
            <summary
              aria-label={`Options for ${course.title}`}
              className="cursor-pointer list-none rounded p-1 text-muted focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-border bg-card p-1 shadow-lg">
              <Link
                to={learningPath}
                className="block rounded px-3 py-2 text-sm text-main hover:bg-blue-500/10"
              >
                Open course
              </Link>
            </div>
          </details>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
          <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
            {course.category || "Course"}
          </span>
          <span className="text-muted">{course.level || "All levels"}</span>
        </div>

        <div className="mt-4 min-h-5">
          {started && total > 0 && (
            <div className="flex items-center gap-2">
              <div
                role="progressbar"
                aria-label={`${course.title} progress`}
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-alt"
              >
                <div
                  className={`h-full rounded-full ${finished ? "bg-emerald-500" : "bg-cyan-500"}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-main">{percentage}%</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs">
          <span className="flex items-center gap-1 text-muted">
            <Clock3 size={14} aria-hidden="true" />
            {course.duration || "Duration unavailable"}
          </span>
          <Link
            to={finished ? "/certificates" : learningPath}
            aria-label={`${action}: ${course.title}`}
            className="inline-flex items-center gap-1 rounded font-semibold text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300"
          >
            {action} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
