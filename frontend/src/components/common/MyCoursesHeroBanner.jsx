import React from "react";
import { Sparkles } from "lucide-react";

const MyCoursesHeroBanner = () => {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-[22px] bg-gradient-to-r from-[#eef7ff] via-[#f5f9ff] to-[#e4f1fd] dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900 border border-[#d2e7fc] dark:border-slate-700/60 px-5 py-4 sm:px-8 sm:py-5 shadow-[0_4px_20px_-4px_rgba(186,215,255,0.45)] dark:shadow-none transition-all mb-6">
      
      {/* Background Soft Glow & Blur Accents */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-52 w-52 rounded-full bg-blue-200/40 dark:bg-blue-600/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-36 h-36 w-36 rounded-full bg-sky-200/40 dark:bg-teal-500/10 blur-2xl"
        aria-hidden="true"
      />
      
      {/* Subtle Right Background Platform/Blob */}
      <div 
        className="pointer-events-none absolute -right-4 -bottom-6 w-32 h-24 bg-sky-200/50 dark:bg-sky-500/10 rounded-full blur-sm"
        aria-hidden="true"
      />

      {/* Floating Sparkles Effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <Sparkles className="absolute top-3 left-1/3 h-4 w-4 text-sky-400/60 dark:text-sky-300 animate-pulse" />
        <Sparkles className="absolute bottom-4 left-1/2 h-3.5 w-3.5 text-blue-400/50 dark:text-blue-300 animate-pulse delay-700" />
      </div>

      {/* Main Flexbox Container */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
        
        {/* Left Content: Badge + Titles (Horizontal Row) */}
        <div className="flex items-center gap-3.5 sm:gap-5 w-full sm:w-auto">
          {/* Circular Badge with 3D Graduation Cap */}
          <div className="relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#dbeefe]/70 dark:bg-sky-900/40 border border-[#c4e0fb] dark:border-sky-800/60 shadow-sm shrink-0 overflow-hidden p-2">
            <img
              src="/AI_Tutor_New_UI/Courses_Page/grad_cap.png"
              alt="Graduation Cap"
              className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal drop-shadow-sm transform hover:scale-105 transition-transform"
            />
          </div>

          {/* Text: Title & Subtitle */}
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-[26px] font-bold text-[#1e293b] dark:text-white tracking-tight">
              My Courses
            </h1>
            <p className="mt-0.5 text-xs sm:text-[13px] text-[#64748b] dark:text-slate-300 max-w-sm sm:max-w-md lg:max-w-lg leading-relaxed">
              Access your enrolled courses, track progress and continue learning where you left off.
            </p>
          </div>
        </div>

        {/* Right Content: Stepped Handwritten Text + 3D AI Robot */}
        <div className="flex items-center justify-end shrink-0 relative mt-2 sm:mt-0 w-full sm:w-auto">
          
          {/* Stepped Handwritten Text: "Better Skills Brighter Future" with the exact curved arrow doodle */}
          <div className="hidden md:flex flex-col items-start select-none transform -rotate-6 mr-3 lg:mr-6 text-sky-700 dark:text-sky-300 font-caveat text-xl lg:text-2xl font-bold leading-tight">
            <span className=" caveat-uniquifier">Better</span>
            <span className="pl-3 caveat-uniquifier">Skills</span>
            <span className="pl-6 caveat-uniquifier">Brighter</span>
            <span className="pl-9 flex items-center gap-1.5 caveat-uniquifier">
              Future
              {/* Exact Swoop Arrow Doodle from your design */}
              <svg
                className="w-10 h-6 text-blue-500 dark:text-blue-400 inline-block ml-0.5"
                viewBox="0 0 52 26"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Gentle downward dip then upward swoop */}
                <path d="M 4 12 C 14 18, 30 18, 46 9" />
                {/* Arrowhead pointing up-right */}
                <path d="M 36 7 L 46 9 L 40 18" />
              </svg>
            </span>
          </div>

          {/* 3D AI Robot Illustration */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 shrink-0 flex items-center justify-end -mb-4 sm:-mb-5 self-end">
            <div className="absolute inset-0 bg-blue-300/30 dark:bg-blue-500/20 rounded-full blur-lg pointer-events-none" />
            <img
              src="/AI_Tutor_New_UI/Courses_Page/ai_robot_banner.png"
              alt="AI Robot"
              className="relative z-10 w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal drop-shadow-md transform hover:scale-105 transition-transform duration-300"
            />
          </div>

        </div>

      </div>
    </div>
  );
};

export default MyCoursesHeroBanner;