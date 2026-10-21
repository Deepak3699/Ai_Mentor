import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { History, CheckCircle2, BookOpen, Award, Clock, ArrowRight, Sparkles } from "lucide-react";

const formatRelativeTime = (dateString) => {
  if (!dateString) return "Recently";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const RecentActivityCard = ({
  purchasedCourses = [],
  enrolledCourses = [],
  studySessions = [],
  certificateData = null,
}) => {
  const navigate = useNavigate();

  // Aggregate real events from user activity
  const activities = [];

  // 1. Course Enrollments & Progress
  purchasedCourses.forEach((entry) => {
    const course = enrolledCourses.find((c) => String(c.id) === String(entry.courseId || entry.id));
    const title = course?.title || entry.courseTitle || `Course #${entry.courseId || entry.id}`;
    const completedCount = entry.progress?.completedLessons?.length || 0;
    const lastWatched = entry.progress?.lastWatched;

    if (lastWatched) {
      activities.push({
        id: `watched-${entry.courseId}-${lastWatched}`,
        type: "progress",
        icon: CheckCircle2,
        tone: "text-emerald-500 bg-emerald-500/10",
        title: `Studied "${title}"`,
        subtitle: `${completedCount} lesson${completedCount === 1 ? "" : "s"} completed`,
        timestamp: lastWatched,
        link: `/learning/${entry.courseId || entry.id}`,
        actionLabel: "Resume",
      });
    }

    if (entry.purchaseDate) {
      activities.push({
        id: `enrolled-${entry.courseId}-${entry.purchaseDate}`,
        type: "enrollment",
        icon: BookOpen,
        tone: "text-[#3867D6] bg-blue-500/10",
        title: `Enrolled in "${title}"`,
        subtitle: "Ready to learn",
        timestamp: entry.purchaseDate,
        link: `/learning/${entry.courseId || entry.id}`,
        actionLabel: "Open",
      });
    }
  });

  // 2. Study Sessions
  studySessions.slice(-3).forEach((session, idx) => {
    activities.push({
      id: `session-${idx}-${session.date}`,
      type: "study",
      icon: Clock,
      tone: "text-amber-500 bg-amber-500/10",
      title: "Completed Study Session",
      subtitle: `${Number(session.hours || session.duration || 0).toFixed(1)} hours logged`,
      timestamp: session.date,
      link: "/analytics",
      actionLabel: "Stats",
    });
  });

  // 3. Certificates
  if (Array.isArray(certificateData?.certificates)) {
    certificateData.certificates.forEach((cert) => {
      activities.push({
        id: `cert-${cert.id || cert.courseId}`,
        type: "certificate",
        icon: Award,
        tone: "text-violet-500 bg-violet-500/10",
        title: `Earned Certificate`,
        subtitle: cert.courseTitle || "Course Completion",
        timestamp: cert.issueDate || cert.createdAt,
        link: "/certificates",
        actionLabel: "View",
      });
    });
  }

  // Sort latest first
  activities.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const displayList = activities.slice(0, 4);

  return (
    <article
      className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm"
      aria-label="Recent Activity"
    >
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-[#3867D6]">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-main">Recent Activity</h2>
            <p className="text-xs text-muted">Your latest learning milestones</p>
          </div>
        </div>

        {displayList.length > 0 && (
          <Link
            to="/analytics"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#3867D6] hover:underline"
          >
            <span>Full History</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      {displayList.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list">
          {displayList.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-canvas-alt p-3.5 transition-colors hover:border-[#3867D6]/40 hover:bg-[#3867D6]/5"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs sm:text-sm font-bold text-main">{item.title}</p>
                    <p className="truncate text-[11px] text-muted mt-0.5">{item.subtitle}</p>
                    <p className="text-[10px] text-muted/80 mt-1">
                      {formatRelativeTime(item.timestamp)}
                    </p>
                  </div>
                </div>

                {item.link && (
                  <div className="mt-3 flex items-center justify-end border-t border-border/60 pt-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(item.link)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#3867D6] hover:underline"
                    >
                      <span>{item.actionLabel || "View"}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-canvas-alt p-5 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[#3867D6]/60" />
          <p className="mt-2 text-sm font-bold text-main">Start your learning journey</p>
          <p className="mt-1 text-xs text-muted">
            Enrolling in courses and watching lessons will automatically log your progress here.
          </p>
          <button
            type="button"
            onClick={() => navigate("/courses")}
            className="mt-3 inline-flex items-center gap-1 rounded-xl bg-[#3867D6] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#315BC0]"
          >
            Explore Courses
          </button>
        </div>
      )}
    </article>
  );
};

export default RecentActivityCard;
