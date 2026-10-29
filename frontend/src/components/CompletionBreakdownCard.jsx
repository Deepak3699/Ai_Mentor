import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon, BookOpen } from "lucide-react";
import { calculatePercentages } from "../utils/completionBreakdown.js";

const SEGMENT_COLORS = {
  completed: "#0d9488", // teal
  inProgress: "#3b82f6", // blue
  notStarted: "#94a3b8", // grey
};

export default function CompletionBreakdownCard({ courses = [], className = "" }) {
  const { t } = useTranslation();

  const totalCourses = courses.length;

  const counts = courses.reduce(
    (acc, course) => {
      const progress = Number(course.progress) || 0;
      if (progress >= 100) {
        acc.completed += 1;
      } else if (progress > 0) {
        acc.inProgress += 1;
      } else {
        acc.notStarted += 1;
      }
      return acc;
    },
    { completed: 0, inProgress: 0, notStarted: 0 },
  );

  const percentages = calculatePercentages(counts);

  const chartData = [
    { key: "completed", value: percentages.completed, color: SEGMENT_COLORS.completed },
    { key: "inProgress", value: percentages.inProgress, color: SEGMENT_COLORS.inProgress },
    { key: "notStarted", value: percentages.notStarted, color: SEGMENT_COLORS.notStarted },
  ].filter((item) => item.value > 0);

  const ariaSummary = t("analytics.completion_breakdown.aria_summary", {
    completed: counts.completed,
    inProgress: counts.inProgress,
    notStarted: counts.notStarted,
    defaultValue: `Course completion: ${counts.completed} completed, ${counts.inProgress} in progress, ${counts.notStarted} not started`,
  });

  return (
    <article
      className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-400">
            <PieChartIcon className="h-4 w-4" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {t("analytics.completion_breakdown.title", { defaultValue: "Completion Breakdown" })}
          </h2>
        </div>
      </div>

      {totalCourses === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4 max-w-xs">
            {t("analytics.completion_breakdown.empty_state_message", {
              defaultValue: "Enrol in a course to see your progress",
            })}
          </p>
          <Link
            to="/courses"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t("analytics.browse_courses_btn", { defaultValue: "Browse Courses" })}
          </Link>
        </div>
      ) : (
        /* Donut Chart & Legend */
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Donut Container */}
          <div role="img" aria-label={ariaSummary} className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={64}
                  dataKey="value"
                  isAnimationActive={false}
                  strokeWidth={0}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Centre Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {percentages.completed}%
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t("analytics.completion_breakdown.completed", { defaultValue: "Completed" })}
              </span>
            </div>
          </div>

          {/* Visually Hidden Data Table */}
          <table className="sr-only">
            <caption>
              {t("analytics.completion_breakdown.table_caption", {
                defaultValue: "Course completion breakdown",
              })}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  {t("analytics.completion_breakdown.status_header", { defaultValue: "Status" })}
                </th>
                <th scope="col">
                  {t("analytics.completion_breakdown.count_header", { defaultValue: "Courses" })}
                </th>
                <th scope="col">
                  {t("analytics.completion_breakdown.percentage_header", {
                    defaultValue: "Percentage",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {t("analytics.completion_breakdown.completed_courses", {
                    defaultValue: "Completed Courses",
                  })}
                </td>
                <td>{counts.completed}</td>
                <td>{percentages.completed}%</td>
              </tr>
              <tr>
                <td>
                  {t("analytics.completion_breakdown.in_progress", {
                    defaultValue: "In Progress",
                  })}
                </td>
                <td>{counts.inProgress}</td>
                <td>{percentages.inProgress}%</td>
              </tr>
              <tr>
                <td>
                  {t("analytics.completion_breakdown.not_started", {
                    defaultValue: "Not Started",
                  })}
                </td>
                <td>{counts.notStarted}</td>
                <td>{percentages.notStarted}%</td>
              </tr>
            </tbody>
          </table>

          {/* Legend */}
          <div className="flex flex-1 flex-col justify-center gap-3 w-full min-w-0">
            {/* Completed */}
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600 dark:bg-teal-500"
                  aria-hidden="true"
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {t("analytics.completion_breakdown.completed_courses", {
                    defaultValue: "Completed Courses",
                  })}
                </span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white shrink-0">
                {percentages.completed}%
              </span>
            </div>

            {/* In Progress */}
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400"
                  aria-hidden="true"
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {t("analytics.completion_breakdown.in_progress", {
                    defaultValue: "In Progress",
                  })}
                </span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white shrink-0">
                {percentages.inProgress}%
              </span>
            </div>

            {/* Not Started */}
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"
                  aria-hidden="true"
                />
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {t("analytics.completion_breakdown.not_started", {
                    defaultValue: "Not Started",
                  })}
                </span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white shrink-0">
                {percentages.notStarted}%
              </span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
