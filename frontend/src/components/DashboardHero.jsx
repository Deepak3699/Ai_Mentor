import { ArrowRight, ArrowUpRight, Flame } from "lucide-react";

const DashboardHero = ({ name, streak, onContinue }) => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const firstName = name?.trim().split(/\s+/)[0] || "there";

  return (
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title">
      <div className="dashboard-hero__ridge dashboard-hero__ridge--far" aria-hidden="true" />
      <div className="dashboard-hero__ridge dashboard-hero__ridge--near" aria-hidden="true" />

      <div className="dashboard-hero__content">
        <h1 id="dashboard-hero-title">
          Good {greeting}, {firstName} <span aria-label="waving hand">👋</span>
        </h1>
        <p className="dashboard-hero__subtitle">
          Keep going! You&apos;re closer to your goals than you think.
        </p>
        <div className="dashboard-hero__streak">
          <Flame aria-hidden="true" />
          <span>
            {streak} {streak === 1 ? "Day" : "Days"} Learning Streak
          </span>
        </div>
        <button className="dashboard-hero__button" onClick={onContinue}>
          <span>Continue Learning</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <div className="dashboard-hero__art" aria-hidden="true">
        <p className="dashboard-hero__note">
          Better<br />Skills<br />Brighter<br />Future
          <ArrowUpRight />
        </p>
        <div className="dashboard-hero__robot">
          <div className="absolute inset-0 bg-blue-300/30 dark:bg-blue-500/20 rounded-full blur-lg pointer-events-none" />
          <img
            src="/AI_Tutor_New_UI/Courses_Page/ai_robot_banner.png"
            alt="AI Robot"
            className="relative z-10 w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal drop-shadow-md transform hover:scale-105 transition-transform duration-300"
          />
        </div>
      </div>
    </section>
  );
};

export default DashboardHero;