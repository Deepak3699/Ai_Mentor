import React from 'react';
import { Flame, Clock, TrendingUp, ChevronRight } from 'lucide-react';

const trendingTopics = [
  { id: 1, rank: 1, title: 'React.js Best Practices', posts: 124, trend: '+12%', color: 'bg-orange-100 text-orange-600' },
  { id: 2, rank: 2, title: 'Node.js Deployment', posts: 98, trend: '+8%', color: 'bg-blue-100 text-blue-600' },
  { id: 3, rank: 3, title: 'Python for Data Science', posts: 76, trend: '+6%', color: 'bg-pink-100 text-pink-600' },
  { id: 4, rank: 4, title: 'System Design Concepts', posts: 64, trend: '+5%', color: 'bg-slate-100 text-slate-600' },
  { id: 5, rank: 5, title: 'AI Tools & Resources', posts: 52, trend: '+4%', color: 'bg-slate-100 text-slate-600' },
];

const recentActivity = [
  { id: 1, initials: 'RS', name: 'Rahul Sharma', action: 'replied to your post', preview: '"useEffect cleanup function works like this..."', time: '1h ago', color: 'bg-blue-500' },
  { id: 2, initials: 'SV', name: 'Sneha Verma', action: 'started a new discussion', preview: '"How to deploy Node.js on Render?"', time: '3h ago', color: 'bg-orange-500' },
  { id: 3, initials: 'AM', name: 'Arjun Mehta', action: 'commented on React Hooks', preview: '"Great explanation! Thanks for sharing."', time: '5h ago', color: 'bg-slate-800' },
];

const DiscussionSidebar = () => {
  return (
    <aside className="hidden lg:block w-[320px] xl:w-[350px] shrink-0 overflow-y-auto bg-canvas-alt border-l border-border p-4 xl:p-6 space-y-6">
      
      {/* Trending Topics */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-main">Trending Topics</h3>
          </div>
          <button className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 flex items-center">
            View All <ChevronRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
        <div className="space-y-4">
          {trendingTopics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-3 group cursor-pointer">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${topic.color}`}>
                {topic.rank}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-main truncate group-hover:text-indigo-500 transition-colors">
                  {topic.title}
                </h4>
                <p className="text-xs text-muted">{topic.posts} posts</p>
              </div>
              <div className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
                <TrendingUp className="w-3 h-3" />
                {topic.trend}
              </div>
              <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-main">Recent Activity</h3>
          </div>
          <button className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 flex items-center">
            View All <ChevronRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
        <div className="space-y-4">
          {recentActivity.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 group cursor-pointer">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 ${activity.color}`}>
                {activity.initials}
              </div>
              <div className="flex-1 min-w-0 pb-3 border-b border-border group-last:border-0 group-last:pb-0">
                <p className="text-xs text-main">
                  <span className="font-semibold">{activity.name}</span> {activity.action}
                </p>
                <p className="text-xs text-muted mt-1 truncate italic">
                  {activity.preview}
                </p>
                <p className="text-[10px] text-muted mt-1 font-medium">
                  {activity.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </aside>
  );
};

export default DiscussionSidebar;
