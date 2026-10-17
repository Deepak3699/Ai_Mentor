import React from "react";
import { Flame, Info, TrendingUp } from "lucide-react";

const trendingTopics = [
  { id: 1, rank: 1, title: "React.js Best Practices", posts: 124, trend: "+12%" },
  { id: 2, rank: 2, title: "Node.js Deployment", posts: 98, trend: "+8%" },
  { id: 3, rank: 3, title: "Python for Data Science", posts: 76, trend: "+6%" },
  { id: 4, rank: 4, title: "System Design Concepts", posts: 64, trend: "+5%" },
  { id: 5, rank: 5, title: "AI Tools & Resources", posts: 52, trend: "+4%" },
];

const SectionHeading = ({ icon, title, subtitle }) => (
  <div className="mb-5 flex items-center gap-3">
    <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500/10 text-[#3867D6]">
      {React.createElement(icon, { className: "h-5 w-5" })}
    </span>
    <div>
      <h3 className="text-lg font-extrabold text-main">{title}</h3>
      <p className="text-xs text-muted">{subtitle}</p>
    </div>
  </div>
);

const DiscussionSidebar = () => (
  <aside className="hidden w-[280px] shrink-0 border-l border-border bg-canvas-alt p-4 2xl:block">
    <div className="sticky top-5 space-y-5">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <SectionHeading icon={Flame} title="Trending Topics" subtitle="Curated learning topics" />
        <div className="space-y-2">
          {trendingTopics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-center gap-3 rounded-2xl bg-canvas-alt p-3 transition hover:border-[#3867D6]/30"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-xs font-extrabold text-main shadow-sm">
                {topic.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-main">{topic.title}</p>
                <p className="mt-0.5 text-xs text-muted">{topic.posts} posts</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-500">
                <TrendingUp className="h-3 w-3" />
                {topic.trend}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <SectionHeading
          icon={Info}
          title="Community guide"
          subtitle="A better space for everyone"
        />
        <ul className="space-y-3 text-xs leading-5 text-muted">
          <li className="rounded-xl bg-canvas-alt p-3">
            Ask clear, course-related questions and include useful context.
          </li>
          <li className="rounded-xl bg-canvas-alt p-3">
            Keep feedback respectful and protect personal information.
          </li>
          <li className="rounded-xl bg-canvas-alt p-3">
            Use reactions and replies to keep related ideas together.
          </li>
        </ul>
      </section>
    </div>
  </aside>
);

export default DiscussionSidebar;
