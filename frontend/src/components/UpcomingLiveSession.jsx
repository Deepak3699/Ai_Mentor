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
      className={`bg-card rounded-2xl border border-border p-5 shadow-sm transition-all duration-200 ${className}`}
      data-testid="upcoming-live-session-card"
    >
      {/* Card Header with Live/Broadcast Icon and Title */}
      <div className="flex items-center gap-2.5 mb-4">
        <Radio
          className="w-4.5 h-4.5 text-purple-600 dark:text-purple-400 shrink-0"
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold text-main tracking-tight">
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
              <div className="flex items-center gap-3.5">
                {/* Calendar Icon inside rounded square */}
                <div
                  className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Calendar className="w-5 h-5" />
                </div>

                {/* Title & Time */}
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-main truncate">
                    {sessionTitle}
                  </h4>
                  <p className="text-xs text-muted mt-0.5 truncate">
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
