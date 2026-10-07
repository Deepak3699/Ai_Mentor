import React from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Quote } from "lucide-react";
import { WEEKLY_ACTIVITY, WEEKLY_SUMMARY } from "./learningActivityData";

const formatHours = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const ActivityTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md"
    >
      <div className="font-semibold text-main">{label}</div>
      <div className="text-muted">{formatHours(payload[0].value)} hours</div>
    </div>
  );
};

const LearningActivityCard = ({
  data = WEEKLY_ACTIVITY,
  summary = WEEKLY_SUMMARY,
}) => (
  <section
    aria-labelledby="learning-activity-title"
    className="bg-card rounded-2xl border border-border p-5 shadow-sm"
  >
    <header className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-blue-100">
        <BarChart3 className="w-5 h-5 text-blue-600" aria-hidden="true" />
      </div>
      <div>
        <h2 id="learning-activity-title" className="text-base font-bold text-main">
          Your Learning Activity
        </h2>
        <p className="text-xs text-muted">Hours spent learning this week</p>
      </div>
    </header>

    <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
      <div
        className="h-56 w-full min-w-0 md:flex-1"
        data-testid="learning-activity-chart"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="learningBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            />
            <YAxis
              domain={[0, 8]}
              ticks={[0, 2, 4, 6, 8]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            />
            <Tooltip
              content={<ActivityTooltip />}
              cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
            />
            <Bar
              dataKey="hours"
              fill="url(#learningBarGradient)"
              radius={[6, 6, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-3 md:w-56 md:shrink-0">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted">This week</div>
          <div
            className="text-2xl font-bold text-main"
            data-testid="weekly-total"
          >
            {formatHours(summary.hours)}{" "}
            <span className="text-base font-semibold">hours</span>
          </div>
          <div className="text-xs text-muted" data-testid="weekly-change">
            <span className="font-semibold text-green-600">
              ↑ {summary.changePercent}%
            </span>{" "}
            compared to last week
          </div>
        </div>

        <figure className="flex flex-1 items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 p-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-200">
            <Quote className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <blockquote className="text-xs italic text-main">
              &ldquo;Small steps every day lead to big results.&rdquo;
            </blockquote>
            <figcaption className="mt-2 text-right text-[11px] text-muted">
              — AI Mentor
            </figcaption>
          </div>
        </figure>
      </div>
    </div>
  </section>
);

export default LearningActivityCard;
