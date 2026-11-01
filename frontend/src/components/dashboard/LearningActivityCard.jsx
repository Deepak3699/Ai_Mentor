import React from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Clock3 } from "lucide-react";

const formatHours = (value) =>
  Number.isInteger(value) ? String(value) : Number(value || 0).toFixed(1);
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

const LearningActivityCard = ({ data = [], summary = null }) => {
  const hasActivity = Array.isArray(data) && data.some((entry) => Number(entry?.hours) > 0);
  const total =
    summary?.hours ??
    (hasActivity ? data.reduce((sum, entry) => sum + Number(entry.hours || 0), 0) : null);
  return (
    <section
      aria-labelledby="learning-activity-title"
      className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-[#3867D6]">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h2 id="learning-activity-title" className="text-lg font-extrabold text-main">
            Learning activity
          </h2>
          <p className="text-xs text-muted">Recorded learning time for this week</p>
        </div>
      </header>
      {hasActivity ? (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_190px]">
          <div className="h-60 min-w-0" data-testid="learning-activity-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                />
                <Tooltip content={<ActivityTooltip />} cursor={{ fill: "rgba(59,130,246,.08)" }} />
                <Bar dataKey="hours" fill="#3867D6" radius={[7, 7, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-canvas-alt p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">This week</p>
            <p className="mt-2 text-3xl font-extrabold text-main" data-testid="weekly-total">
              {formatHours(total)} <span className="text-base">hours</span>
            </p>
            {summary?.changePercent != null && (
              <p className="mt-2 text-xs text-muted" data-testid="weekly-change">
                <span className="font-bold text-emerald-500">
                  {summary.changePercent >= 0 ? "↑" : "↓"} {Math.abs(summary.changePercent)}%
                </span>{" "}
                compared to last week
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          className="dashboard-empty-chart min-h-52 overflow-hidden rounded-2xl border border-dashed border-border bg-canvas-alt p-5"
          data-testid="learning-activity-empty"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-[#3867D6]">
              <Clock3 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-main">Activity will appear here</h3>
              <p className="mt-0.5 text-sm text-muted">
                Complete lessons to start building the weekly chart.
              </p>
            </div>
          </div>
          <div className="dashboard-empty-chart__plot relative mt-5 h-28" aria-hidden="true">
            <div className="absolute inset-0 flex items-end justify-between gap-3 opacity-35">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="flex h-full flex-1 flex-col justify-end gap-2">
                  <div className="h-px w-full bg-border" />
                  <span className="text-center text-[10px] text-muted">{day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
export default LearningActivityCard;
