import React from 'react';
import { Pencil, Play, Flame, Award, BookOpen, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ProfileSummaryCard = () => {
  const { user } = useAuth();

  // Placeholder data - in a real app, this might come from props or API
  const name = user?.name || user?.email?.split('@')[0] || "Deepak Deepak";
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  const subtitle = "BTech CSE";
  const level = 12;
  const currentXP = 1240;
  const maxXP = 1500;
  const progressPercent = (currentXP / maxXP) * 100;
  const streak = 7;
  const certificates = 4;
  const coursesEnrolled = 3;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      {/* Cover Image */}
      <div className="h-28 w-full bg-cover bg-center" style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1542224566-6e85f2e6772f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80")' }}></div>

      <div className="relative px-6 pb-6">
        {/* Avatar & Edit Button */}
        <div className="flex justify-between items-start -mt-10 mb-3">
          <div className="w-20 h-20 rounded-full border-4 border-white bg-blue-700 flex items-center justify-center text-white text-2xl font-bold">
            {initials}
          </div>
          <button className="mt-12 w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
            <Pencil size={14} />
          </button>
        </div>

        {/* User Info */}
        <div className="mb-5">
          <h2 className="text-xl font-bold text-gray-900">{name}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>

        {/* Level Card */}
        <div className="bg-gray-50/50 rounded-xl p-4 mb-6 flex items-center justify-between border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
          <div className="flex items-center flex-1">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4">
              <Play size={18} fill="currentColor" />
            </div>
            <div className="flex-1 mr-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-1">Level {level}</h3>
              <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                <span>{currentXP.toLocaleString()} / {maxXP.toLocaleString()} XP</span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-400" />
        </div>

        {/* Quick Stats */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Stats</h3>
          <div className="space-y-4">
            <div className="flex items-center text-sm font-medium text-gray-700">
              <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center mr-3">
                <Flame size={16} className="text-orange-500" fill="currentColor" />
              </div>
              <span>{streak} Day Streak</span>
            </div>
            <div className="flex items-center text-sm font-medium text-gray-700">
              <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center mr-3">
                <Award size={16} className="text-yellow-500" />
              </div>
              <span>{certificates} Certificates</span>
            </div>
            <div className="flex items-center text-sm font-medium text-gray-700">
              <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center mr-3">
                <BookOpen size={16} className="text-purple-500" />
              </div>
              <span>{coursesEnrolled} Courses Enrolled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSummaryCard;
