import {
  BookOpen,
  Calendar,
  TrendingUp,
  Award,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle,
  Clock,
  AlertCircle,
  Target,
  Zap,
  BarChart3,
  User,
  Settings,
  LogOut,
  Bell,
  Search,
  Moon,
  Sun,
  Menu,
  Users,
  Flame,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import FloatingAssistant from "../components/common/FloatingAssistant";
import LoadingSpinner from "../components/common/LoadingSpinner";
import StatCard from "../components/StatCard";

const Analytics = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [courses, setCourses] = useState([]);
  const [studySessions, setStudySessions] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [tasks, setTasks] = useState({});
  const [newTask, setNewTask] = useState("");
  const [streak, setStreak] = useState(0);
  const [activeTab, setActiveTab] = useState("courses");
  const [pageLoading, setPageLoading] = useState(true);
  const searchQuery = "";

  // Initialize dark mode from localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const statusEmojis = {
    Completed: "✅",
    Ongoing: "🔄",
    Upcoming: "📅",
  };

  const statusIcons = {
    Completed: <CheckCircle className="w-4 h-4 text-[#28A745]" />,
    Ongoing: <Clock className="w-4 h-4 text-[#FFC107]" />,
    Upcoming: <AlertCircle className="w-4 h-4 text-[#CCCCCC]" />,
  };

  const formatDateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // Fetch courses and analytics
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const coursesRes = await fetch("/api/courses", { headers });
        const analyticsRes = await fetch("/api/analytics", { headers });

        const coursesData = await coursesRes.json();
        const analyticsData = await analyticsRes.json();

        setCourses(coursesData);
        setStudySessions(analyticsData.studySessions || []);
      } catch (err) {
        console.error(err);
      } finally {
        setPageLoading(false);
      }
    };

    if (user) fetchData();
    else setPageLoading(false);
  }, [user]);

  // Streak calculation
  useEffect(() => {
    const todayStr = new Date().toDateString();
    const lastLoginStr = localStorage.getItem("lastLogin");
    let currentStreak = parseInt(localStorage.getItem("streak")) || 0;

    if (lastLoginStr !== todayStr) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastLoginStr === yesterday.toDateString()) currentStreak += 1;
      else currentStreak = 1;

      localStorage.setItem("streak", currentStreak);
      localStorage.setItem("lastLogin", todayStr);
      setStreak(currentStreak);
    } else setStreak(currentStreak);
  }, []);

  // Load tasks
  useEffect(() => {
    const saved = localStorage.getItem("calendarTasks");
    if (saved) setTasks(JSON.parse(saved));
    setSelectedDate(formatDateKey(new Date()));
  }, []);

  useEffect(() => {
    localStorage.setItem("calendarTasks", JSON.stringify(tasks));
  }, [tasks]);

  const totalCourses = user?.purchasedCourses?.length || 0;

  const certificates =
    user?.purchasedCourses?.filter((course) => {
      const courseInfo = courses.find((c) => c.id == course.courseId);
      const totalLessons = courseInfo?.lessonsCount || 0;
      const completedLessons = course.progress?.completedLessons?.length || 0;
      return totalLessons > 0 && completedLessons === totalLessons;
    }).length || 0;

  const calculateAttendance = () => {
    const today = new Date();
    const last30 = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      last30.push(d.toDateString());
    }
    const studiedDays = studySessions.map((s) => new Date(s.date).toDateString());
    const uniqueDays = [...new Set(studiedDays)];
    const attended = uniqueDays.filter((d) => last30.includes(d)).length;
    return Math.round((attended / 30) * 100);
  };

  const attendance = calculateAttendance();

  const addTask = () => {
    if (!newTask.trim()) return;
    const dateKey = selectedDate || formatDateKey(new Date());
    setTasks((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] || []), { text: newTask.trim(), status: "Upcoming" }],
    }));
    setNewTask("");
  };

  const updateTaskStatus = (index, status) => {
    if (!tasks[selectedDate]) return;
    setTasks((prev) => {
      const updated = [...prev[selectedDate]];
      updated[index].status = status;
      return { ...prev, [selectedDate]: updated };
    });
  };

  const deleteTask = (index) => {
    if (!tasks[selectedDate]) return;
    const updated = [...tasks[selectedDate]];
    updated.splice(index, 1);
    setTasks({ ...tasks, [selectedDate]: updated });
  };

  const handlePrevMonth = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const myCourses =
    user?.purchasedCourses?.map((c) => {
      const courseInfo = courses.find((course) => course.id == c.courseId);
      const completedLessons = c.progress?.completedLessons?.length || 0;
      const totalLessons = courseInfo?.lessonsCount || 0;
      const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      const remaining = totalLessons - completedLessons;
      return {
        id: c.courseId,
        title: courseInfo?.title || "Course",
        level: courseInfo?.level || "Beginner",
        image:
          courseInfo?.image ||
          "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80",
        category: courseInfo?.category || "Education",
        completedLessons,
        totalLessons,
        progress,
        remaining,
      };
    }) || [];

  // Filter courses based on search
  const filteredCourses = myCourses.filter(
    (course) =>
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Calculate total study time for the month shown by the card with decimal safety
  const now = new Date();
  const totalStudyTime = studySessions.reduce((total, session) => {
    const sessionDate = new Date(session.date);
    const hours = Number(session.hours || session.duration / 3600);
    if (
      !isNaN(sessionDate.getTime()) &&
      sessionDate.getFullYear() === now.getFullYear() &&
      sessionDate.getMonth() === now.getMonth() &&
      Number.isFinite(hours)
    ) {
      return total + hours;
    }
    return total;
  }, 0);

  const averageProgress =
    myCourses.length > 0
      ? Math.round(myCourses.reduce((acc, c) => acc + c.progress, 0) / myCourses.length)
      : 0;

  if (pageLoading) {
    return <LoadingSpinner label={t("analytics.loading")} />;
  }

  return (
    <>
      <main className="p-4 md:p-6 lg:p-8">
        {/* Dark Mode Toggle Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-3 rounded-full bg-white dark:bg-[#1A1A1A] shadow-lg hover:shadow-xl transition-all duration-300 border border-[#CCCCCC] dark:border-gray-700"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5 text-[#ff6d34]" />
            ) : (
              <Moon className="w-5 h-5 text-[#ff6d34]" />
            )}
          </button>
        </div>

        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#2D3436] dark:text-white">
            {t("analytics.welcome_back_user", { name: user?.name || "Learner" })}
          </h1>
          <p className="text-[#2D3436]/70 dark:text-gray-400 mt-2 text-lg">
            {t("analytics.analytics_subtitle")}
          </p>
        </div>

        {/* METRICS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={BookOpen}
            iconBgColor="bg-blue-50 dark:bg-blue-950/40"
            iconColor="text-blue-500 dark:text-blue-400"
            label={t("analytics.enrolled_courses")}
            value={totalCourses}
            unit={t("analytics.units.course", { count: totalCourses })}
            to="/courses"
            change={null}
          />

          <StatCard
            icon={Users}
            iconBgColor="bg-emerald-50 dark:bg-emerald-950/40"
            iconColor="text-emerald-500 dark:text-emerald-400"
            label={t("analytics.attendance_rate")}
            value={`${attendance}%`}
            to={null}
            change={null}
          />

          <StatCard
            icon={Flame}
            iconBgColor="bg-orange-50 dark:bg-orange-950/40"
            iconColor="text-orange-500 dark:text-orange-400"
            label={t("analytics.current_streak_label")}
            value={streak}
            unit={t("analytics.units.day", { count: streak })}
            to={null}
            change={null}
          />

          <StatCard
            icon={Award}
            iconBgColor="bg-purple-50 dark:bg-purple-950/40"
            iconColor="text-purple-500 dark:text-purple-400"
            label={t("analytics.certificates")}
            value={certificates}
            unit={t("analytics.units.certificate", { count: certificates })}
            to="/certificates"
            change={null}
          />
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-[#27272A] rounded-xl p-4 shadow-sm">
            <div className="text-sm text-[#2D3436]/60 dark:text-gray-400">
              {t("analytics.average_progress")}
            </div>
            <div className="text-xl font-bold text-[#00bea3]">{averageProgress}%</div>
            <div className="w-full bg-[#F5F5F5] dark:bg-gray-700 rounded-full h-1.5 mt-2">
              <div
                className="bg-gradient-to-r from-[#00bea3] to-[#ff6d34] h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${averageProgress}%` }}
              ></div>
            </div>
          </div>
          <div className="bg-white dark:bg-[#27272A] rounded-xl p-4 shadow-sm">
            <div className="text-sm text-[#2D3436]/60 dark:text-gray-400">
              {t("analytics.completed_lessons_count")}
            </div>
            <div className="text-xl font-bold text-[#28A745]">
              {myCourses.reduce((acc, c) => acc + c.completedLessons, 0)}
            </div>
            <div className="text-xs text-[#2D3436]/50 dark:text-gray-500 mt-2">
              {t("analytics.across_all_courses")}
            </div>
          </div>
          <div className="bg-white dark:bg-[#27272A] rounded-xl p-4 shadow-sm">
            <div className="text-sm text-[#2D3436]/60 dark:text-gray-400">
              {t("analytics.total_study_time_label")}
            </div>
            <div className="text-xl font-bold text-[#ff6d34]">
              {Number(totalStudyTime.toFixed(1))}{" "}
              {t("analytics.hours_unit", { defaultValue: "hrs" })}
            </div>
            <div className="text-xs text-[#2D3436]/50 dark:text-gray-500 mt-2">
              {t("analytics.this_month")}
            </div>
          </div>
          <div className="bg-white dark:bg-[#27272A] rounded-xl p-4 shadow-sm">
            <div className="text-sm text-[#2D3436]/60 dark:text-gray-400">
              {t("analytics.upcoming_tasks_count")}
            </div>
            <div className="text-xl font-bold text-[#FFC107]">
              {
                Object.values(tasks)
                  .flat()
                  .filter((t) => t.status === "Upcoming").length
              }
            </div>
            <div className="text-xs text-[#2D3436]/50 dark:text-gray-500 mt-2">
              {t("analytics.need_attention")}
            </div>
          </div>
        </div>

                {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-[#CCCCCC] dark:border-gray-700">
          <button
            onClick={() => setActiveTab("courses")}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === "courses"
                ? "text-[#ff6d34] dark:text-[#ff6d34]"
                : "text-[#2D3436]/60 hover:text-[#2D3436] dark:text-gray-400"
            }`}
          >
            {t("analytics.my_courses_tab")}
            {activeTab === "courses" && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ff6d34]"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === "calendar"
                ? "text-[#ff6d34] dark:text-[#ff6d34]"
                : "text-[#2D3436]/60 hover:text-[#2D3436] dark:text-gray-400"
            }`}
          >
            {t("analytics.calendar_tasks_tab")}
            {activeTab === "calendar" && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#ff6d34]"></span>
            )}
          </button>
        </div>

        {activeTab === "courses" && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#2D3436] dark:text-white flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-[#00bea3]" />
                {t("analytics.my_courses_tab")}
                <span className="text-sm font-normal text-[#2D3436]/60 dark:text-gray-400 bg-[#F5F5F5] dark:bg-gray-700 px-2 py-1 rounded-full">
                  {filteredCourses.length}
                </span>
              </h2>
              <Link
                to="/courses"
                className="text-[#ff6d34] hover:text-[#ff6d34]/80 text-sm font-medium flex items-center gap-1"
              >
                {t("analytics.browse_all_courses")}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl shadow-lg overflow-hidden border border-[#CCCCCC]/30 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#F5F5F5] dark:bg-gray-700/50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-semibold text-[#2D3436]/70 dark:text-gray-300 uppercase tracking-wider">
                        {t("analytics.table_course")}
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#2D3436]/70 dark:text-gray-300 uppercase tracking-wider">
                        {t("analytics.table_progress")}
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#2D3436]/70 dark:text-gray-300 uppercase tracking-wider">
                        {t("analytics.table_lessons")}
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#2D3436]/70 dark:text-gray-300 uppercase tracking-wider">
                        {t("analytics.table_level")}
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-[#2D3436]/70 dark:text-gray-300 uppercase tracking-wider">
                        {t("analytics.table_action")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#CCCCCC]/50 dark:divide-gray-700">
                    {filteredCourses.length > 0 ? (
                      filteredCourses.map((course) => (
                        <tr
                          key={course.id}
                          className="hover:bg-[#F5F5F5] dark:hover:bg-gray-700/30 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <Link to={`/learning/${course.id}`} className="flex items-center gap-4">
                              <div className="relative">
                                <img
                                  src={course.image}
                                  alt={course.title}
                                  className="w-12 h-12 rounded-xl object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                              <div>
                                <div className="font-semibold text-[#2D3436] dark:text-white line-clamp-1">
                                  {course.title}
                                </div>
                                <div className="text-xs text-[#2D3436]/60 dark:text-gray-400 mt-0.5">
                                  {course.category}
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-full bg-[#F5F5F5] dark:bg-gray-700 rounded-full h-2 w-28">
                                <div
                                  className="bg-[#00bea3] h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${course.progress}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-semibold text-[#2D3436] dark:text-white">
                                {course.progress}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#2D3436]/70 dark:text-gray-300">
                            {course.completedLessons}/{course.totalLessons}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 text-xs font-medium rounded-full bg-[#ff6d34]/10 text-[#ff6d34]">
                              {course.level}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              to={`/learning/${course.id}`}
                              className="px-4 py-2 bg-[#ff6d34] hover:bg-[#ff6d34]/90 text-white rounded-xl text-xs font-semibold transition shadow-sm inline-flex items-center gap-1.5"
                            >
                              {t("analytics.resume_btn")}
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-[#2D3436]/60 dark:text-gray-400">
                          {t("analytics.no_courses_found", { defaultValue: "No courses enrolled yet." })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-white dark:bg-[#1A1A1A] rounded-2xl p-6 shadow-lg border border-[#CCCCCC]/30 dark:border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-[#2D3436] dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#ff6d34]" />
                  {currentDate.toLocaleString("default", { month: "long" })} {currentDate.getFullYear()}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevMonth}
                    className="p-2 rounded-xl bg-[#F5F5F5] dark:bg-gray-800 hover:bg-[#CCCCCC]/30 dark:hover:bg-gray-700 transition"
                  >
                    <ChevronLeft className="w-4 h-4 text-[#2D3436] dark:text-white" />
                  </button>
                  <button
                    onClick={handleNextMonth}
                    className="p-2 rounded-xl bg-[#F5F5F5] dark:bg-gray-800 hover:bg-[#CCCCCC]/30 dark:hover:bg-gray-700 transition"
                  >
                    <ChevronRight className="w-4 h-4 text-[#2D3436] dark:text-white" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid Header */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-xs font-semibold text-[#2D3436]/50 dark:text-gray-400 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-2">
                {(() => {
                  const year = currentDate.getFullYear();
                  const month = currentDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const totalDays = new Date(year, month + 1, 0).getDate();
                  const days = [];

                  for (let i = 0; i < firstDayIndex; i++) {
                    days.push(<div key={`empty-${i}`} className="h-24 bg-transparent"></div>);
                  }

                  for (let day = 1; day <= totalDays; day++) {
                    const dateObj = new Date(year, month, day);
                    const dateKey = formatDateKey(dateObj);
                    const dayTasks = tasks[dateKey] || [];
                    const isSelected = selectedDate === dateKey;
                    const isToday = formatDateKey(new Date()) === dateKey;

                    days.push(
                      <div
                        key={dateKey}
                        onClick={() => setSelectedDate(dateKey)}
                        className={`h-24 p-2 rounded-xl border transition cursor-pointer flex flex-col justify-between
                          ${
                            isSelected
                              ? "border-[#ff6d34] bg-[#ff6d34]/5 dark:bg-[#ff6d34]/10"
                              : "border-[#CCCCCC]/30 dark:border-gray-800 bg-white dark:bg-[#27272A]/50 hover:border-[#ff6d34]/50"
                          } ${isToday && !isSelected ? "ring-2 ring-[#00bea3]" : ""}`}
                      >
                        <div className="flex justify-between items-center">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isToday
                                ? "bg-[#00bea3] text-white"
                                : "text-[#2D3436] dark:text-gray-300"
                            }`}
                          >
                            {day}
                          </span>
                          {dayTasks.length > 0 && (
                            <span className="text-[10px] bg-[#ff6d34] text-white px-1.5 py-0.5 rounded-full font-bold">
                              {dayTasks.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 overflow-hidden">
                          {dayTasks.slice(0, 2).map((t, idx) => (
                            <div
                              key={idx}
                              className={`text-[10px] truncate px-1 py-0.5 rounded ${
                                t.status === "Completed"
                                  ? "bg-[#28A745]/20 text-[#28A745]"
                                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {t.text}
                            </div>
                          ))}
                          {dayTasks.length > 2 && (
                            <div className="text-[9px] text-gray-400 text-right">
                              +{dayTasks.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return days;
                })()}
              </div>
            </div>

            {/* TASK PANEL */}
            <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl p-6 shadow-lg border border-[#CCCCCC]/30 dark:border-gray-700 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-[#2D3436] dark:text-white flex items-center gap-2">
                    <Target className="w-5 h-5 text-[#ff6d34]" />
                    {t("analytics.tasks_for_date", { date: selectedDate })}
                  </h3>
                </div>

                <div className="flex gap-2 mb-6">
                  <input
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTask()}
                    className="flex-1 border border-[#CCCCCC] dark:border-gray-700 dark:bg-gray-900 dark:text-white p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ff6d34] transition placeholder:text-gray-400"
                    placeholder={t("analytics.add_task_placeholder")}
                  />
                  <button
                    onClick={addTask}
                    className="bg-[#ff6d34] hover:bg-[#ff6d34]/90 text-white px-4 py-3 rounded-xl transition flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {(tasks[selectedDate] || []).length > 0 ? (
                    (tasks[selectedDate] || []).map((task, i) => (
                      <div
                        key={i}
                        className={`group relative flex items-center gap-3 p-3 rounded-xl transition-all ${
                          task.status === "Completed"
                            ? "bg-[#28A745]/10 dark:bg-[#28A745]/20"
                            : "bg-[#F5F5F5] dark:bg-gray-700/50"
                        }`}
                      >
                        <div className="flex-shrink-0">{statusIcons[task.status]}</div>
                        <span
                          className={`flex-1 text-sm line-clamp-2 ${
                            task.status === "Completed"
                              ? "line-through text-gray-500 dark:text-gray-400"
                              : "text-[#2D3436] dark:text-gray-300"
                          }`}
                        >
                          {task.text}
                        </span>

                        <div className="flex items-center gap-2">
                          <select
                            value={task.status}
                            onChange={(e) => updateTaskStatus(i, e.target.value)}
                            className="bg-white dark:bg-gray-800 border border-[#CCCCCC] dark:border-gray-600 rounded-lg p-1 text-xs focus:outline-none text-[#2D3436] dark:text-gray-300"
                          >
                            <option value="Upcoming">📅 Upcoming</option>
                            <option value="Ongoing">🔄 Ongoing</option>
                            <option value="Completed">✅ Done</option>
                          </select>
                          <button
                            onClick={() => deleteTask(i)}
                            className="text-gray-400 hover:text-red-500 transition p-1"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-[#2D3436]/60 dark:text-gray-400 text-sm">No tasks for this day</p>
                    </div>
                  )}
                </div>
              </div>

              {tasks[selectedDate] && tasks[selectedDate].length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#CCCCCC] dark:border-gray-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#2D3436]/60 dark:text-gray-400">Completed:</span>
                    <span className="font-medium text-[#28A745]">
                      {tasks[selectedDate].filter((t) => t.status === "Completed").length}/
                      {tasks[selectedDate].length}
                    </span>
                  </div>
                  <div className="w-full bg-[#F5F5F5] rounded-full h-1.5 mt-2">
                    <div
                      className="bg-[#28A745] h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${(tasks[selectedDate].filter((t) => t.status === "Completed").length / tasks[selectedDate].length) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        <FloatingAssistant />
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 4px;
        }
      `}</style>
    </>
  );
};

export default Analytics;
