import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, MessageSquare, Zap, Code2, BookOpenCheck, BrainCircuit } from "lucide-react";
import { OPEN_ASSISTANT_EVENT } from "./QuickActions";

const MeetAiMentorCard = ({ continueCourse = null }) => {
  const navigate = useNavigate();

  const handleAskMentor = (initialPrompt = "") => {
    window.dispatchEvent(
      new CustomEvent(OPEN_ASSISTANT_EVENT, {
        detail: initialPrompt ? { prompt: initialPrompt } : {},
      }),
    );
  };

  const handleGenerateLesson = () => {
    if (continueCourse?.id) {
      navigate(`/learning/${continueCourse.id}`);
    } else {
      navigate("/code-explainer");
    }
  };

  const handleChipClick = (type) => {
    if (type === "explain") {
      const topic = continueCourse?.title
        ? `Explain the key concepts of "${continueCourse.title}"`
        : "Explain how AI Mentor can help me learn faster";
      handleAskMentor(topic);
    } else if (type === "code") {
      navigate("/code-explainer");
    } else if (type === "lesson") {
      if (continueCourse?.id) {
        navigate(`/learning/${continueCourse.id}`);
      } else {
        handleAskMentor("Can you recommend the best lessons for me to study today?");
      }
    }
  };

  return (
    <article
      className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-blue-500/10 p-5 sm:p-6 shadow-sm transition hover:shadow-md"
      aria-label="Meet Your AI Mentor"
    >
      {/* Soft Ambient Background Glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-indigo-500/10 blur-2xl" />

      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        {/* Top Header & Content */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* AI Badge & Title */}
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4B79E8] via-[#3867D6] to-[#254FB4] text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/20">
                  <span className="text-xs font-black tracking-wider">AI</span>
                  <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-blue-200" />
                </div>
                <h2 className="truncate text-lg sm:text-xl font-extrabold text-main tracking-tight">
                  Meet Your AI Mentor
                </h2>
              </div>

              {/* Description */}
              <p className="mt-2.5 text-xs sm:text-sm text-muted leading-relaxed">
                Ask questions, generate lessons, get personalized guidance and learn smarter with
                AI.
              </p>
            </div>

            {/* 3D Robot Image */}
            <div className="shrink-0 -mt-2">
              <img
                src="/AI_Tutor_New_UI/Ai Mentor/robot.png"
                alt="AI Mentor"
                className="h-28 sm:h-32 w-auto object-contain drop-shadow-[0_12px_24px_rgba(56,103,214,0.35)] transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          </div>

          {/* Capabilities Section: "Your AI can help with" */}
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
              Your AI can help with
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-canvas-alt/70 p-2.5">
                <BookOpenCheck className="h-4 w-4 shrink-0 text-[#3867D6]" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-main truncate">Concept Breakdown</p>
                  <p className="text-[10px] text-muted truncate">Step-by-step guidance</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-canvas-alt/70 p-2.5">
                <Code2 className="h-4 w-4 shrink-0 text-cyan-500" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-main truncate">Code Debugging</p>
                  <p className="text-[10px] text-muted truncate">Fix errors & explain</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-canvas-alt/70 p-2.5">
                <BrainCircuit className="h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-main truncate">Smart Practice</p>
                  <p className="text-[10px] text-muted truncate">Active recall & quiz</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
              Quick prompts
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleChipClick("explain")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#3867D6]/30 bg-[#3867D6]/5 px-3 py-1.5 text-xs font-semibold text-main hover:border-[#3867D6] hover:bg-[#3867D6]/10 hover:text-[#3867D6] transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#3867D6]" />
                <span>Explain a concept</span>
              </button>
              <button
                type="button"
                onClick={() => handleChipClick("code")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-xs font-semibold text-main hover:border-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-500 transition"
              >
                <Code2 className="h-3.5 w-3.5 text-cyan-500" />
                <span>Help with code</span>
              </button>
              <button
                type="button"
                onClick={() => handleChipClick("lesson")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/5 px-3 py-1.5 text-xs font-semibold text-main hover:border-violet-500 hover:bg-violet-500/10 hover:text-violet-500 transition"
              >
                <Zap className="h-3.5 w-3.5 text-violet-500" />
                <span>Recommend a lesson</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-3 border-t border-border/50">
          <button
            type="button"
            onClick={() => handleAskMentor()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3867D6] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-[#315BC0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3867D6]"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Ask AI Mentor</span>
          </button>

          <button
            type="button"
            onClick={handleGenerateLesson}
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#3867D6] bg-card px-4 py-2 text-xs sm:text-sm font-bold text-[#3867D6] transition hover:-translate-y-0.5 hover:bg-[#3867D6]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3867D6]"
          >
            <Zap className="h-4 w-4" />
            <span>Generate AI Lesson</span>
          </button>
        </div>
      </div>
    </article>
  );
};

export default MeetAiMentorCard;
