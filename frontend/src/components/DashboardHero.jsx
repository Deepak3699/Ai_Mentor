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
          <span className="dashboard-hero__antenna" />
          <div className="dashboard-hero__head">
            <div className="dashboard-hero__visor">
              <span />
              <span />
            </div>
          </div>
          <span className="dashboard-hero__neck" />
          <div className="dashboard-hero__body">
            <span>AI</span>
          </div>
          <span className="dashboard-hero__arm dashboard-hero__arm--left" />
          <span className="dashboard-hero__arm dashboard-hero__arm--right" />
        </div>
      </div>
    </section>
  );
};

export default DashboardHero;