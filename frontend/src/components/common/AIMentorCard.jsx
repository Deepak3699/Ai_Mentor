import React from "react";
import { Sparkles, Bot, ArrowRight } from "lucide-react";

const AIMentorCard = ({
  onAskMentor,
  onGenerateLesson,
}) => {
  return (
    <div className="relative h-full min-h-[300px] overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 p-6 shadow-sm transition-all duration-300 hover:shadow-lg">
      
      {/* Decorative sparkles */}
      <Sparkles
        className="absolute right-6 top-6 h-5 w-5 text-indigo-400 opacity-70"
        aria-hidden="true"
      />

      <Sparkles
        className="absolute right-24 top-20 h-4 w-4 text-purple-400 opacity-60"
        aria-hidden="true"
      />

      <Sparkles
        className="absolute bottom-10 right-12 h-4 w-4 text-blue-400 opacity-60"
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col">
        
        {/* AI Badge */}
        <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-indigo-700 backdrop-blur-sm">
          <Bot className="h-4 w-4" />
          <span>AI</span>
        </div>

        {/* Heading */}
        <h2 className="max-w-[260px] text-2xl font-bold leading-tight text-gray-900">
          Meet Your AI Mentor
        </h2>

        {/* Description */}
        <p className="mt-3 max-w-[310px] text-sm leading-6 text-gray-600">
          Ask questions, generate lessons, get personalized guidance and
          learn smarter with AI.
        </p>

        {/* Buttons */}
        <div className="mt-auto flex flex-wrap gap-3 pt-6">
          <button
            type="button"
            onClick={onAskMentor}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-indigo-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Ask AI Mentor
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onGenerateLesson}
            className="inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-white/70 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-all duration-200 hover:border-indigo-500 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Generate AI Lesson
          </button>
        </div>
      </div>

      {/* Robot illustration */}
      <div className="pointer-events-none absolute bottom-0 right-0 hidden w-[42%] max-w-[190px] sm:block">
        <img
          src="/AI_Tutor_New_UI/Dashboard/robot.png"
          alt="AI Mentor robot"
          className="h-auto w-full object-contain drop-shadow-md"
          loading="lazy"
        />
      </div>

      {/* Decorative glow */}
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-purple-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-blue-300/20 blur-3xl" />
    </div>
  );
};

export default AIMentorCard;