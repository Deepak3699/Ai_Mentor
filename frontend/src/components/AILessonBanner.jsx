import { ArrowRight, Lightbulb } from "lucide-react";

const AILessonBanner = ({ onGenerate }) => (
  <section className="ai-lesson-banner" aria-labelledby="ai-lesson-banner-title">
    <div className="ai-lesson-banner__info">
      <span className="ai-lesson-banner__icon" aria-hidden="true">
        <Lightbulb />
      </span>
      <div className="ai-lesson-banner__text">
        <div className="ai-lesson-banner__title-row">
          <h2 id="ai-lesson-banner-title">Try AI Generated Lessons</h2>
          <span className="ai-lesson-banner__badge">New</span>
        </div>
        <p>Create personalized video lessons with your favorite celebrity and learn faster!</p>
      </div>
    </div>

    <button type="button" className="ai-lesson-banner__button" onClick={onGenerate}>
      <span>Generate AI Lesson</span>
      <ArrowRight aria-hidden="true" />
    </button>

    <svg
      className="ai-lesson-banner__robot"
      viewBox="0 0 96 110"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ai-banner-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9dcff" />
        </linearGradient>
        <linearGradient id="ai-banner-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b2f6b" />
          <stop offset="1" stopColor="#0d1b44" />
        </linearGradient>
      </defs>
      <line x1="48" y1="6" x2="48" y2="18" stroke="#6aa8ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="6" r="5" fill="#4aa3ff" />
      <rect x="4" y="38" width="9" height="20" rx="4.5" fill="#4a8cff" />
      <rect x="83" y="38" width="9" height="20" rx="4.5" fill="#4a8cff" />
      <rect
        x="12"
        y="16"
        width="72"
        height="56"
        rx="22"
        fill="url(#ai-banner-body)"
        stroke="#a9c4f5"
        strokeWidth="2"
      />
      <rect x="20" y="26" width="56" height="34" rx="15" fill="url(#ai-banner-visor)" />
      <circle cx="37" cy="41" r="5" fill="#5fe3ff" />
      <circle cx="59" cy="41" r="5" fill="#5fe3ff" />
      <path
        d="M41 51 Q48 57 55 51"
        stroke="#5fe3ff"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="26" y="74" width="44" height="34" rx="14" fill="#3b82f6" />
      <text
        x="48"
        y="97"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="Inter, system-ui, sans-serif"
      >
        AI
      </text>
    </svg>
  </section>
);

export default AILessonBanner;
