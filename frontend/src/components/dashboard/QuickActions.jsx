import React from "react";
import { useNavigate } from "react-router-dom";
import { Award, Bot, ChevronRight, Compass, Users, Zap, Code2 } from "lucide-react";

export const OPEN_ASSISTANT_EVENT = "ai-mentor:open";

const actions = [
  {
    id: "explore-courses",
    title: "Explore Courses",
    subtitle: "Browse the course catalog",
    icon: Compass,
    tone: "bg-blue-500/10 text-[#3867D6]",
    to: "/courses",
  },
  {
    id: "ai-mentor",
    title: "AI Mentor",
    subtitle: "Ask your AI assistant",
    icon: Bot,
    tone: "bg-violet-500/10 text-violet-500",
    assistant: true,
  },
  {
    id: "ai-code-explainer",
    title: "AI Code Explainer",
    subtitle: "Analyze & debug code with AI",
    icon: Code2,
    tone: "bg-cyan-500/10 text-cyan-500",
    to: "/code-explainer",
  },
  {
    id: "join-community",
    title: "Join Community",
    subtitle: "Discuss with other learners",
    icon: Users,
    tone: "bg-emerald-500/10 text-emerald-500",
    to: "/discussions",
  },
  {
    id: "view-certificates",
    title: "View Certificates",
    subtitle: "See your earned certificates",
    icon: Award,
    tone: "bg-amber-500/10 text-amber-500",
    to: "/certificates",
  },
];

const QuickActions = ({ className = "" }) => {
  const navigate = useNavigate();

  const handleSelect = (action) => {
    if (action.assistant) {
      window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
      return;
    }
    navigate(action.to);
  };

  return (
    <section
      aria-labelledby="quick-actions-title"
      className={`rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`}
      data-testid="quick-actions-card"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-[#3867D6]">
          <Zap className="h-5 w-5" />
        </div>
        <div>
          <h2 id="quick-actions-title" className="text-lg font-extrabold text-main">
            Quick Actions
          </h2>
          <p className="text-xs text-muted">Jump straight to what you need</p>
        </div>
      </header>

      <div className="space-y-3.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleSelect(action)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-canvas-alt p-3.5 text-left transition-colors duration-200 hover:border-[#3867D6]/30 hover:bg-[#3867D6]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3867D6]/40"
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${action.tone}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-main">{action.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{action.subtitle}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#3867D6]" />
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default QuickActions;
