import React, { useState } from "react";
import { Calendar, Radio } from "lucide-react";
import toast from "react-hot-toast";

const UpcomingLiveSession = ({ sessions = [], onJoin, className = "" }) => {
  const [joiningId, setJoiningId] = useState(null);
  const validSessions = Array.isArray(sessions) ? sessions : [];
  const handleJoin = (session) => {
    const key = session.id || session.title;
    setJoiningId(key);
    toast.success(`Joining live session: ${session.title}`, { icon: "🎥" });
    window.setTimeout(() => setJoiningId(null), 1500);
    if (typeof session.onJoin === "function") session.onJoin(session);
    else if (typeof onJoin === "function") onJoin(session);
  };
  return (
    <section
      className={`rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`}
      data-testid="upcoming-live-session-card"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-main">Upcoming live sessions</h2>
          <p className="text-xs text-muted">Scheduled classes and workshops</p>
        </div>
      </header>
      {validSessions.length ? (
        <div className="space-y-3">
          {validSessions.slice(0, 3).map((session, index) => {
            const key = session.id || `session-${index}`;
            return (
              <article key={key} className="rounded-2xl border border-border bg-canvas-alt p-4">
                <div className="flex gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-500">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-extrabold text-main">{session.title}</h3>
                    <p className="mt-1 truncate text-xs text-muted">{session.time}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleJoin(session)}
                  className="mt-4 w-full rounded-xl bg-[#3867D6] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#315BC0]"
                  aria-label={`Join session ${session.title}`}
                >
                  {joiningId === key ? "Joining..." : "Join session"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-canvas-alt px-5 text-center">
          <div>
            <Calendar className="mx-auto h-8 w-8 text-violet-500" />
            <h3 className="mt-3 font-extrabold text-main">No live sessions scheduled</h3>
            <p className="mt-1 text-sm text-muted">Scheduled sessions will appear here.</p>
          </div>
        </div>
      )}
    </section>
  );
};
export default UpcomingLiveSession;
