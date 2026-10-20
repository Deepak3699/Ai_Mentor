import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Plus,
  Play,
  Trash2,
  Code2,
  Flame,
  Clock,
  Target,
} from "lucide-react";

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const TodaysLearningPlan = ({
  continueCourse = null,
  weeklyActivity = [],
  streak = 0,
}) => {
  const navigate = useNavigate();
  const todayKey = getTodayKey();
  const storageKey = `ai_mentor_daily_plan_${todayKey}`;

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore parsing error
    }

    const defaultTasks = [];

    if (continueCourse) {
      defaultTasks.push({
        id: "course-lesson",
        title: `Continue "${continueCourse.title}"`,
        subtitle: `Lesson ${(continueCourse.completed || 0) + 1} of ${continueCourse.total || 0}`,
        completed: false,
        actionType: "resume",
        link: `/learning/${continueCourse.id}`,
      });
    } else {
      defaultTasks.push({
        id: "explore-courses",
        title: "Start a new course from catalog",
        subtitle: "Choose from 10+ AI and tech courses",
        completed: false,
        actionType: "explore",
        link: "/courses",
      });
    }

    defaultTasks.push(
      {
        id: "ai-challenge",
        title: "Practice AI Code or Concept Explainer",
        subtitle: "Debug or explain a code snippet",
        completed: false,
        actionType: "code",
        link: "/code-explainer",
      },
      {
        id: "daily-review",
        title: "Review Key Notes & Flashcards",
        subtitle: "15 min active recall session",
        completed: false,
        actionType: "review",
        link: continueCourse ? `/learning/${continueCourse.id}` : "/courses",
      },
    );

    return defaultTasks;
  });

  const [newGoalText, setNewGoalText] = useState("");
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks));
    } catch {
      // ignore storage error
    }
  }, [tasks, storageKey]);

  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  const handleAddGoal = (e) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;
    const newTask = {
      id: `custom-${Date.now()}`,
      title: newGoalText.trim(),
      subtitle: "Custom daily goal",
      completed: false,
      custom: true,
    };
    setTasks((prev) => [...prev, newTask]);
    setNewGoalText("");
    setShowInput(false);
  };

  const removeCustomTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const remainingCount = Math.max(0, tasks.length - completedCount);
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const estimatedMins = remainingCount * 15;

  const activeDaysCount = useMemo(() => {
    if (Array.isArray(weeklyActivity) && weeklyActivity.length > 0) {
      const activeDays = weeklyActivity.filter((d) => Number(d.hours) > 0).length;
      if (activeDays > 0) return Math.min(5, activeDays);
    }
    if (streak > 0) return Math.min(5, streak);
    return completedCount > 0 ? 1 : 0;
  }, [weeklyActivity, streak, completedCount]);

  return (
    <article
      className="flex h-full flex-col justify-between rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm"
      aria-label="Today's Learning Plan"
    >
      <div className="flex h-full flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-[#3867D6]">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg sm:text-xl font-extrabold text-main">
                  Today's Learning Plan
                </h2>
                <p className="text-xs text-muted">{formattedDate}</p>
              </div>
            </div>

            <span className="shrink-0 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-[#3867D6]">
              {completedCount}/{tasks.length} Done
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-3.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-alt border border-border/50">
              <div
                className="h-full rounded-full bg-[#3867D6] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Daily Progress Summary Pill */}
          <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-canvas-alt/70 p-2.5 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Completed</p>
              <p className="mt-0.5 text-sm font-extrabold text-emerald-500">{completedCount}</p>
            </div>
            <div className="border-x border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Remaining</p>
              <p className="mt-0.5 text-sm font-extrabold text-main">{remainingCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Est. Time</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#3867D6]">
                {remainingCount === 0 ? "Done! 🎉" : `~${estimatedMins}m`}
              </p>
            </div>
          </div>

          {/* Task List */}
          <ul className="mt-3.5 space-y-2.5" role="list">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`group flex items-center justify-between gap-3 rounded-2xl border p-3 transition ${
                  task.completed
                    ? "border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10 text-muted"
                    : "border-border bg-canvas-alt hover:border-[#3867D6]/30 hover:bg-[#3867D6]/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className="shrink-0 text-muted transition hover:text-[#3867D6] focus:outline-none"
                    aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                  >
                    {task.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted/60 group-hover:text-[#3867D6]" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs sm:text-sm font-bold ${
                        task.completed ? "line-through text-muted" : "text-main"
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.subtitle && (
                      <p className="truncate text-[11px] text-muted">{task.subtitle}</p>
                    )}
                  </div>
                </div>

                {/* Action Button / Delete */}
                <div className="shrink-0 flex items-center gap-1.5">
                  {task.link && !task.completed && (
                    <button
                      type="button"
                      onClick={() => navigate(task.link)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#3867D6]/10 px-2.5 py-1 text-xs font-bold text-[#3867D6] hover:bg-[#3867D6] hover:text-white transition"
                    >
                      {task.actionType === "code" ? (
                        <Code2 className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
                      <span>Go</span>
                    </button>
                  )}

                  {task.custom && (
                    <button
                      type="button"
                      onClick={() => removeCustomTask(task.id)}
                      className="text-muted hover:text-red-500 p-1 transition"
                      title="Delete goal"
                      aria-label="Delete goal"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Add custom goal form */}
          {showInput ? (
            <form onSubmit={handleAddGoal} className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                placeholder="e.g., Complete 2 quizzes today"
                autoFocus
                className="flex-1 rounded-xl border border-border bg-canvas-alt px-3 py-1.5 text-xs text-main placeholder:text-muted focus:border-[#3867D6] focus:outline-none"
              >
              </input>
              <button
                type="submit"
                className="rounded-xl bg-[#3867D6] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#315BC0]"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowInput(false)}
                className="text-xs text-muted hover:text-main px-1"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowInput(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#3867D6] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Custom Goal</span>
            </button>
          )}
        </div>

        {/* Weekly Goal Progress Bar at bottom */}
        <div className="mt-4 pt-3.5 border-t border-border/60">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-main flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-amber-500" />
              <span>Weekly Target</span>
            </span>
            <span className="text-[11px] font-semibold text-muted">
              {activeDaysCount}/5 days active
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {["M", "T", "W", "T", "F"].map((day, idx) => {
              const isActive = idx < activeDaysCount;
              return (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <div
                    className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                      isActive ? "bg-[#3867D6]" : "bg-canvas-alt border border-border/60"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold ${
                      isActive ? "text-[#3867D6]" : "text-muted/60"
                    }`}
                  >
                    {day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
};

export default TodaysLearningPlan;
