import React, { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart2, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";

/* ─── helpers ──────────────────────────────────────────────────────────────── */

const fmt = (v) => (Number.isInteger(v) ? String(v) : Number(v || 0).toFixed(1));

/** Return the Monday-to-Sunday ISO dates for the week that contains `anchor`. */
function getCurrentWeekDates(anchor = new Date()) {
  const dow = anchor.getDay(); // 0 = Sun … 6 = Sat
  const diffToMon = (dow + 6) % 7; // days back to Monday
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - diffToMon);
  mon.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    // YYYY-MM-DD
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

/** Localised narrow weekday names Mon-Sun (e.g. "Mon", "Tue" in en). */
function weekdayLabels(locale) {
  // 2021-01-04 was a Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2021, 0, 4 + i);
    return d.toLocaleDateString(locale, { weekday: "short" });
  });
}

/* ─── custom tooltip ────────────────────────────────────────────────────────── */

const StudyTooltip = ({ active, payload, label }) => {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div
      role="tooltip"
      className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md"
    >
      <div className="font-semibold text-main">{label}</div>
      <div className="text-muted">
        {fmt(payload[0].value)} {t("analytics.weekly_study.hours_unit")}
      </div>
    </div>
  );
};

/* ─── custom bar label (above each bar) ─────────────────────────────────────── */

const BarTopLabel = (props) => {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      textAnchor="middle"
      fontSize={10}
      fill="var(--color-text-muted, #888)"
    >
      {fmt(value)}h
    </text>
  );
};

/* ─── visually-hidden table for screen readers ───────────────────────────────── */

const SrTable = ({ data, t }) => (
  <table className="sr-only">
    <caption>{t("analytics.weekly_study.sr_caption")}</caption>
    <thead>
      <tr>
        <th scope="col">{t("analytics.weekly_study.sr_day")}</th>
        <th scope="col">{t("analytics.weekly_study.sr_hours")}</th>
      </tr>
    </thead>
    <tbody>
      {data.map((row) => (
        <tr key={row.day}>
          <td>{row.day}</td>
          <td>{fmt(row.hours)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ─── empty state ───────────────────────────────────────────────────────────── */

const EmptyState = ({ t }) => (
  <div
    className="dashboard-empty-chart min-h-52 overflow-hidden rounded-2xl border border-dashed border-border bg-canvas-alt p-5"
    data-testid="weekly-study-time-empty"
  >
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-[#3867D6]">
        <Clock3 className="h-5 w-5" />
      </span>
      <div>
        <h3 className="font-extrabold text-main">
          {t("analytics.weekly_study.empty_title")}
        </h3>
        <p className="mt-0.5 text-sm text-muted">
          {t("analytics.weekly_study.empty_subtitle")}
        </p>
      </div>
    </div>

    {/* ghost bars */}
    <div className="dashboard-empty-chart__plot relative mt-5 h-28" aria-hidden="true">
      <div className="absolute inset-0 flex items-end justify-between gap-3 opacity-30">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="flex h-full flex-1 flex-col justify-end gap-2">
            <div className="h-px w-full bg-border" />
            <span className="text-center text-[10px] text-muted">{d}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ─── main component ─────────────────────────────────────────────────────────── */

/**
 * WeeklyStudyTimeCard
 *
 * Props
 *  studySessions  – array of { date: "YYYY-MM-DD", hours: number } objects
 *                   (the raw list from the analytics API)
 */
const WeeklyStudyTimeCard = ({ studySessions = [] }) => {
  const { t, i18n } = useTranslation();

  /* Aggregate hours by day of this calendar week (Mon-Sun) */
  const { chartData, totalHours, peakDay } = useMemo(() => {
    const weekDates = getCurrentWeekDates();
    const labels = weekdayLabels(i18n.language);
    const sessions = Array.isArray(studySessions) ? studySessions : [];

    // Sum hours per ISO date
    const byDate = {};
    for (const s of sessions) {
      if (!s?.date) continue;
      const dateKey = s.date.slice(0, 10); // keep only "YYYY-MM-DD"
      byDate[dateKey] = (byDate[dateKey] || 0) + Number(s.hours || s.duration || 0);
    }

    const chartData = weekDates.map((isoDate, i) => ({
      day: labels[i],
      hours: Math.round((byDate[isoDate] || 0) * 10) / 10,
    }));

    const totalHours = chartData.reduce((s, r) => s + r.hours, 0);
    const peakEntry = chartData.reduce((best, r) => (r.hours > best.hours ? r : best), chartData[0]);
    const peakDay = peakEntry?.hours > 0 ? peakEntry.day : null;

    return { chartData, totalHours, peakDay };
  }, [studySessions, i18n.language]);

  const hasData = chartData.some((r) => r.hours > 0);

  /* Y-axis ceiling rounded to a sensible step */
  const maxHours = Math.max(...chartData.map((r) => r.hours), 0);
  const yMax = maxHours <= 0 ? 8 : Math.ceil(maxHours / 2) * 2 + 2;

  /* aria-label summary */
  const ariaLabel = hasData
    ? t("analytics.weekly_study.aria_summary", {
        total: fmt(totalHours),
        peak: peakDay || "",
      })
    : t("analytics.weekly_study.aria_empty");

  return (
    <section
      aria-labelledby="weekly-study-time-title"
      className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      {/* Header */}
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-[#3867D6]">
          <BarChart2 className="h-5 w-5" />
        </div>
        <div>
          <h2 id="weekly-study-time-title" className="text-lg font-extrabold text-main">
            {t("analytics.weekly_study.title")}
          </h2>
          <p className="text-xs text-muted">{t("analytics.weekly_study.subtitle")}</p>
        </div>
      </header>

      {/* Chart or empty state */}
      {hasData ? (
        <>
          {/* Accessible hidden table */}
          <SrTable data={chartData} t={t} />

          {/* Bar chart */}
          <div
            className="h-56 min-w-0"
            role="img"
            aria-label={ariaLabel}
            data-testid="weekly-study-time-chart"
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 8, left: -28, bottom: 0 }}
              >
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                />
                <YAxis
                  domain={[0, yMax]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                />
                <Tooltip
                  content={<StudyTooltip />}
                  cursor={{ fill: "rgba(56,103,214,.08)" }}
                />
                <Bar dataKey="hours" radius={[7, 7, 0, 0]} maxBarSize={36}>
                  <LabelList dataKey="hours" content={<BarTopLabel />} />
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.hours > 0 ? "#3867D6" : "var(--color-border, #e2e8f0)"}
                      fillOpacity={entry.hours > 0 ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Total summary */}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-canvas-alt px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
              {t("analytics.weekly_study.total_label")}
            </span>
            <span className="text-xl font-extrabold text-main" data-testid="weekly-study-total">
              {fmt(totalHours)}{" "}
              <span className="text-sm font-medium text-muted">
                {t("analytics.weekly_study.hours_unit")}
              </span>
            </span>
          </div>
        </>
      ) : (
        <EmptyState t={t} />
      )}
    </section>
  );
};

export default WeeklyStudyTimeCard;
