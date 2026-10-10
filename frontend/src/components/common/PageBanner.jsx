import React from "react";
import { ArrowUpRight } from "lucide-react";

const PageBanner = ({ 
  title, 
  subtitle, 
  children,
  streakContent,
  artNote,
  robotImage = "/AI_Tutor_New_UI/Courses_Page/ai_robot_banner.png"
}) => {
  return (
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
      <div className="dashboard-hero__ridge dashboard-hero__ridge--far" aria-hidden="true" />
      <div className="dashboard-hero__ridge dashboard-hero__ridge--near" aria-hidden="true" />

      <div className="dashboard-hero__content">
        {typeof title === 'string' ? (
          <h1 id="dashboard-hero-title">{title}</h1>
        ) : (
          <h1 id="dashboard-hero-title">{title}</h1>
        )}
        
        {subtitle && (
          <div className="dashboard-hero__subtitle">
            {subtitle}
          </div>
        )}
        
        {streakContent && (
          <div className="dashboard-hero__streak">
            {streakContent}
          </div>
        )}
        
        {children}
      </div>

      <div className="dashboard-hero__art" aria-hidden="true">
        {artNote && (
          <p className="dashboard-hero__note">
            {artNote}
          </p>
        )}
        {robotImage && (
          <div className="dashboard-hero__robot">
            <div className="absolute inset-0 bg-blue-300/30 dark:bg-blue-500/20 rounded-full blur-lg pointer-events-none" />
            <img
              src={robotImage}
              alt="Banner AI Robot"
              className="relative z-10 w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal drop-shadow-md transform hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default PageBanner;
