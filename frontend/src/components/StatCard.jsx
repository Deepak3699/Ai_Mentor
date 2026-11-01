import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function StatCard({
  icon: Icon,
  iconBgColor = "bg-blue-50 dark:bg-blue-950/40",
  iconColor = "text-blue-500 dark:text-blue-400",
  label,
  value,
  unit,
  change = null, // e.g. { label: "+2 this month", direction: "up" | "down" | "flat" }
  to = null,
}) {
  const isClickable = Boolean(to);

  const cardInner = (
    <div className="flex items-center justify-between p-5">
      <div className="flex items-center gap-4 min-w-0">
        {/* Left: Icon Tile */}
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBgColor} ${iconColor} transition-transform ${
            isClickable ? "group-hover:scale-105" : ""
          }`}
        >
          {Icon && <Icon className="h-6 w-6" aria-hidden="true" />}
        </div>

        {/* Center: Label, Value with Unit, Optional Change Line */}
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>

          <div className="mt-0.5 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {value}
            </span>
            {unit && (
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {unit}
              </span>
            )}
          </div>

          {/* Optional Change Line: Only rendered if real comparison data exists */}
          {change && change.label && (
            <div className="mt-1 flex items-center gap-1 text-xs font-medium">
              {change.direction === "up" && (
                <>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500">{change.label}</span>
                </>
              )}
              {change.direction === "down" && (
                <>
                  <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                  <span className="text-rose-500">{change.label}</span>
                </>
              )}
              {change.direction === "flat" && (
                <>
                  <Minus className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-500 dark:text-slate-400">{change.label}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Far Right: Chevron shown only for navigable cards */}
      {isClickable && (
        <div className="ml-2 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
    </div>
  );

  const containerClasses = `group block rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
    isClickable
      ? "cursor-pointer transition-all hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
      : ""
  }`;

  if (isClickable) {
    return (
      <Link to={to} className={containerClasses}>
        {cardInner}
      </Link>
    );
  }

  return <div className={containerClasses}>{cardInner}</div>;
}
