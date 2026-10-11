import { Clock3, Layers3, Sparkles } from "lucide-react";
import { recommendedCourses } from "../data/recommendedCourses";
import { Link } from "react-router-dom";

const CourseCard = ({ course }) => (
  <article className="group relative flex min-h-[190px] flex-col rounded-2xl border border-border/80 bg-canvas-alt p-4 transition-all duration-200 hover:-translate-y-1 hover:border-blue-500/30 hover:shadow-lg dark:hover:border-blue-400/30">
    {course.isPopular && (
      <span className="absolute right-3 top-3 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
        Popular
      </span>
    )}
    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-lg shadow-sm group-hover:scale-105 ">
      {course.icon}
    </div>
    <h3 className="line-clamp-1 pr-14 text-[15px] font-bold tracking-tight text-main">
      {course.title}
    </h3>
    <p className="mt-1 text-xs font-medium text-muted">{course.category}</p>
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-medium text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Clock3
          className="h-3.5 w-3.5 text-blue-500 dark:text-blue-300"
          aria-hidden="true"
        />
        {course.duration}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Layers3
          className="h-3.5 w-3.5 text-violet-500 dark:text-violet-300"
          aria-hidden="true"
        />
        {course.level}
      </span>
    </div>
    <Link
      to="/courses"
      className="mt-auto inline-flex w-fit items-center pt-4 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
    >
      Enroll Now →
    </Link>
  </article>
);

const RecommendedForYou = () => (
  <section className="mt-6 w-full rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 ">
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 ring-1 ring-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-main">
            Recommended For You
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Based on your learning history and goals
          </p>
        </div>
      </div>
      <Link
        to="/courses"
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-500/10 dark:text-blue-300"
      >
        View All →
      </Link>
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {recommendedCourses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  </section>
);
export default RecommendedForYou;
