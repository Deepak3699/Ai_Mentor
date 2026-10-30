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
  onClick = null,
  ariaLabel = null,
  subtext = null,
  progressBar = null,
  children = null,
}) {
  const isClickable = Boolean(to || onClick);

  const cardInner = (
    <div className="flex items-center justify-between p-3.5 sm:p-5">
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
        {/* Left: Icon Tile */}
        <div
          className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl ${iconBgColor} ${iconColor} transition-transform ${
            isClickable ? "group-hover:scale-105" : ""
          }`}
        >
          {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />}
        </div>

        {/* Center: Label, Value with Unit, Progress Bar, Subtext, Optional Change Line */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>

          <div className="mt-0.5 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {value}
            </span>
            {unit && (
              <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 truncate">
                {unit}
              </span>
            )}
          </div>

          {/* Progress Bar: accessible with role="progressbar" and aria attributes */}
          {progressBar && (
            <div
              role="progressbar"
              aria-valuenow={progressBar.value ?? 0}
              aria-valuemin={progressBar.min ?? 0}
              aria-valuemax={progressBar.max ?? 100}
              aria-label={progressBar.ariaLabel || (typeof label === "string" ? label : undefined)}
              className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden"
            >
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progressBar.value ?? 0))}%` }}
              />
            </div>
          )}

          {/* Children / Custom Content */}
          {children}

          {/* Subtext: shown when no change line */}
          {subtext && !change && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">{subtext}</p>
          )}

          {/* Optional Change Line: Only rendered if real comparison data exists */}
          {change && change.label && (
            <div className="mt-1 flex items-center gap-1 text-xs font-medium truncate">
              {change.direction === "up" && (
                <>
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span className="text-emerald-500 truncate">{change.label}</span>
                </>
              )}
              {change.direction === "down" && (
                <>
                  <TrendingDown className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  <span className="text-rose-500 truncate">{change.label}</span>
                </>
              )}
              {change.direction === "flat" && (
                <>
                  <Minus className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    {change.label}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Far Right: Chevron shown only for navigable cards */}
      {isClickable && (
        <div className="ml-1 sm:ml-2 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500">
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

  if (to) {
    return (
      <Link to={to} className={containerClasses}>
        {cardInner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || (typeof label === "string" ? `${label}: ${value}` : undefined)}
        className={`${containerClasses} w-full text-left`}
      >
        {cardInner}
      </button>
    );
  }

  return <div className={containerClasses}>{cardInner}</div>;
}
