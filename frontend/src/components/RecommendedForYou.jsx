import React from "react";
import { Sparkles, BarChart2 } from "lucide-react";

const RecommendedForYou = ({ items = [], onViewAll }) => {
  return (
    <section className="bg-card rounded-2xl border border-border shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-main">
            <Sparkles className="w-4 h-4 text-teal-500" />
            Recommended For You
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            Based on your interests and learning history
          </p>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-teal-500 hover:text-teal-400 whitespace-nowrap"
        >
          View All →
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-border bg-card"
          >
            <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center text-base shrink-0">
              {item.icon}
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-main">{item.title}</span>
              <span className="flex items-center gap-1 text-[10px] text-muted">
                <BarChart2 className="w-3 h-3" />
                {item.level}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default RecommendedForYou;