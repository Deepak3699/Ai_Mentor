import React, { useState } from "react";
import { Radio, Calendar } from "lucide-react";
import toast from "react-hot-toast";

/**
 * UpcomingLiveSession Component
 * Displays upcoming live class details with date/time and a join session button.
 *
 * @param {Object} props
 * @param {string} [props.title="React Advanced Concepts"] - Session title
 * @param {string} [props.time="Today • 7:00 PM – 8:00 PM"] - Session time range
 * @param {Function} [props.onJoin] - Click handler for the join button
 * @param {Array<Object>} [props.sessions] - Optional array of sessions for multi-session support
 * @param {string} [props.className=""] - Additional CSS classes
 */
const UpcomingLiveSession = ({
  title = "React Advanced Concepts",
  time = "Today • 7:00 PM – 8:00 PM",
  onJoin,
  sessions,
  className = "",
}) => {
  const [joiningId, setJoiningId] = useState(null);

  // Support both single session props and a list of sessions
  const sessionList =
    Array.isArray(sessions) && sessions.length > 0
      ? sessions
      : [{ id: "session-default", title, time, onJoin }];

  const handleJoinClick = (session) => {
    const sessionTitle = session.title || title;
    const sessionKey = session.id || sessionTitle;

    // Log to console as required by Issue #147
    console.log(`Joining session: ${sessionTitle}`);

    // Provide visual feedback to the user via toast
    try {
      toast.success(`Joining live session: ${sessionTitle}`, {
        icon: "🎥",
      });
    } catch {
      // In case toast environment is not mounted
    }

    // Brief visual button click state
    setJoiningId(sessionKey);
    setTimeout(() => {
      setJoiningId(null);
    }, 1500);

    // Call onJoin handler if provided
    if (typeof session.onJoin === "function") {
      session.onJoin(session);
    } else if (typeof onJoin === "function") {
      onJoin(session);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md  sm:p-6 ${className}`}
      data-testid="upcoming-live-session-card"
    >
      {/* Card Header with Live/Broadcast Icon and Title */}
      <div className="mb-5 flex items-center gap-3">
        <Radio
          className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300"
          aria-hidden="true"
        />
        <h3 className="text-base font-extrabold tracking-tight text-main">
          Upcoming Live Session
        </h3>
      </div>

      {/* Sessions Container */}
      <div className="space-y-4">
        {sessionList.map((session, index) => {
          const sessionTitle = session.title || "React Advanced Concepts";
          const sessionTime = session.time || "Today • 7:00 PM – 8:00 PM";
          const key = session.id || `session-${index}`;
          const isJoining = joiningId === key;

          return (
            <div key={key} className="space-y-4">
              {/* Session Details */}
              <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-canvas-alt p-3.5 ">
                {/* Calendar Icon inside rounded square */}
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 ring-1 ring-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20"
                  aria-hidden="true"
                >
                  <Calendar className="w-5 h-5" />
                </div>

                {/* Title & Time */}
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-bold text-main">
                    {sessionTitle}
                  </h4>
                  <p className="mt-1 truncate text-xs leading-5 text-muted">
                    {sessionTime}
                  </p>
                </div>
              </div>

              {/* Outlined Full-Width Button */}
              <button
                type="button"
                onClick={() => handleJoinClick(session)}
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium border border-blue-400 text-blue-500 dark:border-blue-500 dark:text-blue-400 bg-transparent hover:bg-blue-50/80 dark:hover:bg-blue-950/30 hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-2 dark:focus:ring-offset-zinc-800 transition-all duration-200 active:scale-[0.99] cursor-pointer ${
                  isJoining ? "opacity-75" : ""
                }`}
                aria-label={`Join session ${sessionTitle}`}
              >
                {isJoining ? "Joining..." : "Join Session"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UpcomingLiveSession;
