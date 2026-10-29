import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Award, BarChart2, BookOpen, Check, Clock3 } from "lucide-react";

/**
 * LearningProgressCard
 *
 * Displays "Your Learning Progress" card featuring:
 * 1. Header with title and "View Details ->" navigation link.
 * 2. Left Side: Circular SVG donut chart displaying overall progress %.
 * 3. Right Side: Vertical metric list with icons for enrolled courses,
 *    completed lessons, certificates, and learning time.
 */
const LearningProgressCard = ({
  progress = 68,
  enrolledCourses = 3,
  completedLessons = 4,
  certificates = 2,
  learningTime = "12h 30m",
  onViewDetails,
  className = "",
}) => {
  const navigate = useNavigate();

  const handleViewDetails = () => {
    if (typeof onViewDetails === "function") {
      onViewDetails();
      return;
    }
    navigate("/analytics");
  };

  const clampedProgress = Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  return (
    <section
      aria-labelledby="learning-progress-title"
      data-testid="learning-progress-card"
      className={`rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`}
    >
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
            aria-hidden="true"
          >
            <BarChart2 className="h-4 w-4" />
          </span>
          <h2
            id="learning-progress-title"
            className="text-base font-extrabold tracking-tight text-main sm:text-lg"
          >
            Your Learning Progress
          </h2>
        </div>
        <button
          type="button"
          onClick={handleViewDetails}
          className="group inline-flex items-center gap-1 text-xs font-bold text-[#3867D6] transition hover:text-[#2d52ab] focus-visible:outline-none focus-visible:underline dark:text-blue-400 dark:hover:text-blue-300 sm:text-sm"
          aria-label="View learning progress details"
        >
          <span>View Details</span>
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </header>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* Left Side: Circular Donut Chart */}
        <div
          className="relative flex h-28 w-28 shrink-0 items-center justify-center"
          data-testid="learning-progress-donut"
          aria-label={`Overall progress: ${clampedProgress}%`}
          role="img"
        >
          <svg className="h-full w-full" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="learningProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#0EA5E9" />
              </linearGradient>
            </defs>
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="9"
              className="stroke-slate-100 dark:stroke-slate-800"
            />
            {/* Progress Arc */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="url(#learningProgressGrad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 50 50)"
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              className="text-2xl font-black tracking-tight text-main"
              data-testid="learning-progress-percentage"
            >
              {clampedProgress}%
            </span>
            <span className="text-[10px] font-semibold text-muted">Overall Progress</span>
          </div>
        </div>

        {/* Right Side: Vertical Metric List */}
        <div className="w-full flex-1 space-y-3 sm:w-auto" role="list">
          {/* 1. Enrolled Courses */}
          <div className="flex items-center gap-3" role="listitem">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
              aria-hidden="true"
            >
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium text-muted sm:text-sm">
              <strong className="font-extrabold text-main">{enrolledCourses}</strong> Enrolled
              Courses
            </span>
          </div>

          {/* 2. Completed Lessons */}
          <div className="flex items-center gap-3" role="listitem">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              aria-hidden="true"
            >
              <Check className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium text-muted sm:text-sm">
              <strong className="font-extrabold text-main">{completedLessons}</strong> Completed
              Lessons
            </span>
          </div>

          {/* 3. Certificates */}
          <div className="flex items-center gap-3" role="listitem">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"
              aria-hidden="true"
            >
              <Award className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium text-muted sm:text-sm">
              <strong className="font-extrabold text-main">{certificates}</strong> Certificates
            </span>
          </div>

          {/* 4. Learning Time */}
          <div className="flex items-center gap-3" role="listitem">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
              aria-hidden="true"
            >
              <Clock3 className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium text-muted sm:text-sm">
              <strong className="font-extrabold text-main">{learningTime}</strong> Learning Time
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LearningProgressCard;
