import { apiFetch as fetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import RecommendedForYou from "../components/RecommendedForYou";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { Play, ChevronLeft, ChevronRight, CheckCircle, Clock, Award, Database, X } from "lucide-react";
import Preferences from "../components/Preferences";
import API_BASE_URL from "../lib/api";
import FloatingAssistant from "../components/common/FloatingAssistant";
import CourseCardMeta from "../components/common/CourseCardMeta";
import LearningActivityCard from "../components/dashboard/LearningActivityCard";
import { Helmet } from "react-helmet-async";

const latestLessons = [
  { id: 1, title: "React Components", category: "Web Dev", duration: "8 min", type: "react" },
  { id: 2, title: "Python OOP Concepts", category: "Python", duration: "12 min", type: "python" },
  { id: 3, title: "SQL Joins & Relationships", category: "Database", duration: "10 min", type: "database" },
];

const Dashboard = () => {
  const { t } = useTranslation();
  const [coursesData, setCoursesData] = useState({ statsCards: [], allCourses: [] });
  const [loading, setLoading] = useState(true);
  const { user, fetchUserProfile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const [coursesRes, statsRes, certRes] = await Promise.all([
          fetch("/api/courses", { headers }),
          fetch("/api/courses/stats/cards", { headers }),
          fetch("/api/certificate/list", { headers }),
        ]);
        if(certRes.ok){ const json = await certRes.json(); setData(json); }
        const allCourses = await coursesRes.json();
        const { statsCards } = await statsRes.json();
        setCoursesData({ allCourses, statsCards });
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    fetchAllData();
  }, []);

  const calculateStats = () => {
     const base = [
      { icon: <Play className="w-5 h-5 text-blue-600" />, value: data?.stats?.inProgress ?? 0, label: "Ongoing", bgColor: "bg-blue-50", iconBg: "bg-blue-100", change:"+0%" },
      { icon: <CheckCircle className="w-5 h-5 text-green-600" />, value: data?.stats?.completed ?? 0, label: "Completed", bgColor: "bg-green-50", iconBg: "bg-green-100", change:"+0" },
      { icon: <Award className="w-5 h-5 text-purple-600" />, value: data?.stats?.certificatesEarned ?? 0, label: "Certificates", bgColor: "bg-purple-50", iconBg: "bg-purple-100", change:"+0" },
      { icon: <Clock className="w-5 h-5 text-orange-600" />, value: "0h", label: "Hours", bgColor: "bg-orange-50", iconBg: "bg-orange-100", change:"+0h" },
    ];
    return base;
  }

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-canvas-alt p-6">
      <Helmet><title>Dashboard | UptoSkills</title></Helmet>
      <div className="max-w-7xl pt-16 mx-auto space-y-8">
        
        {/* STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {calculateStats().map((card, i) => (
            <div key={i} className="bg-card rounded-2xl p-6 shadow-sm border">
              <div className={`p-3 rounded-xl ${card.iconBg} w-fit`}>{card.icon}</div>
              <div className="text-2xl font-bold mt-4">{card.value}</div>
              <div className="text-sm text-muted">{card.label}</div>
            </div>
          ))}
        </div>

        {/* YOUR TASK #61 - RECOMMENDED FOR YOU */}
        <div className="w-full">
          <RecommendedForYou />
        </div>

        {/* POPULAR COURSES */}
        <h2 className="text-xl font-bold">Popular Courses</h2>
        <div className="flex gap-6 overflow-x-auto pb-6">
          {coursesData.allCourses.slice(0,5).map((course, idx) => (
            <div key={idx} className="bg-card rounded-xl border w-64 flex-shrink-0">
              <div className="p-4">
                <h3 className="font-semibold">{course.title}</h3>
                <p className="text-xs text-muted">{course.level}</p>
              </div>
            </div>
          ))}
        </div>
        
        <LearningActivityCard />
      </div>
      <FloatingAssistant />
    </main>
  );
};
export default Dashboard;