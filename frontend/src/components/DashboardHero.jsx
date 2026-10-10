import React from "react";
import { ArrowRight, ArrowUpRight, Flame } from "lucide-react";
import PageBanner from "./common/PageBanner";

const DashboardHero = ({ name, streak, onContinue }) => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const firstName = name?.trim().split(/\s+/)[0] || "there";

  const artNote = (
    <>
      Better<br />Skills<br />Brighter<br />Future
      <ArrowUpRight />
    </>
  );

  const streakContent = (
    <>
      <Flame aria-hidden="true" />
      <span>
        {streak} {streak === 1 ? "Day" : "Days"} Learning Streak
      </span>
    </>
  );

  return (
    <PageBanner
      title={
        <>Good {greeting}, {firstName} <span aria-label="waving hand">👋</span></>
      }
      subtitle="Keep going! You're closer to your goals than you think."
      streakContent={streakContent}
      artNote={artNote}
    >
      <button className="dashboard-hero__button" onClick={onContinue}>
        <span>Continue Learning</span>
        <ArrowRight aria-hidden="true" />
      </button>
    </PageBanner>
  );
};

export default DashboardHero;