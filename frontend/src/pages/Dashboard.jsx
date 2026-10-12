import { apiFetch as fetch } from "../lib/api";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GraduationCap,
  Play,
  Sparkles,
} from "lucide-react";
import Preferences from "../components/Preferences";
import FloatingAssistant from "../components/common/FloatingAssistant";
import LoadingSpinner from "../components/common/LoadingSpinner";
import CourseCardMeta from "../components/common/CourseCardMeta";
import LearningActivityCard from "../components/dashboard/LearningActivityCard";
import DashboardHero from "../components/DashboardHero";
import UpcomingLiveSession from "../components/UpcomingLiveSession";
import RecommendedForYou from "../components/RecommendedForYou";
import { Helmet } from "react-helmet-async";

const BLUE_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#3867D6] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-[#315BC0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3867D6] focus-visible:ring-offset-2";

const artworkFor = (title = "") => {
  const artwork = {
    "React Fundamentals": "/AI_Tutor_New_UI/Dashboard/react_fundamentals.png",
    "Python For AI": "/AI_Tutor_New_UI/Dashboard/python_for_ai.png",
    "AI Ethics & Bias": "/AI_Tutor_New_UI/Dashboard/ai_ethics_bias.png",
    PostgreSQL: "/AI_Tutor_New_UI/Dashboard/postgresql.png",
    "MongoDB Fundamentals": "/AI_Tutor_New_UI/Dashboard/MongoDB.png",
    "Machine Learning Fundamentals": "/AI_Tutor_New_UI/Dashboard/ML_fundamentals.png",
    "ML Fundamentals": "/AI_Tutor_New_UI/Dashboard/ML_fundamentals.png",
    "Full Stack Web Development": "/AI_Tutor_New_UI/Dashboard/full_stack_web_dev.png",
    "Full Stack Web Dev": "/AI_Tutor_New_UI/Dashboard/full_stack_web_dev.png",
  };
  return artwork[title] || "/AI_Tutor_New_UI/Dashboard/logo.png";
};

const parseLessonCount = (course) =>
  Number(course?.lessonsCount) || Number.parseInt(String(course?.lessons || "0"), 10) || 0;
const purchasedId = (entry) => entry?.id ?? entry?.courseId ?? entry?.course?.id;
const matchesCourse = (entry, id) => String(purchasedId(entry)) === String(id);

const Dashboard = () => {
  const { user, fetchUserProfile } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [certificateData, setCertificateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [learningStreak] = useState(() => {
    const stored = Number.parseInt(localStorage.getItem("streak") || "0", 10);
    return Number.isFinite(stored) ? Math.max(0, stored) : 0;
  });

  useEffect(() => {
    if (!loading) {
      window.dispatchEvent(new Event("app:initial-content-ready"));
    }
  }, [loading]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const [coursesResult, certificateResult] = await Promise.allSettled([
          fetch("/api/courses", { headers }),
          fetch("/api/certificate/list", { headers }),
        ]);
        if (coursesResult.status === "fulfilled" && coursesResult.value.ok) {
          setCourses(await coursesResult.value.json());
        }
        if (certificateResult.status === "fulfilled" && certificateResult.value.ok) {
          setCertificateData(await certificateResult.value.json());
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const enrolledCourses = useMemo(
    () =>
      courses
        .filter((course) =>
          user?.purchasedCourses?.some((entry) => matchesCourse(entry, course.id)),
        )
        .map((course) => {
          const purchase = user?.purchasedCourses?.find((entry) => matchesCourse(entry, course.id));
          const total = parseLessonCount(course);
          const completed = purchase?.progress?.completedLessons?.length || 0;
          return {
            ...course,
            purchase,
            total,
            completed,
            progress: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
          };
        }),
    [courses, user?.purchasedCourses],
  );

  const inProgress = enrolledCourses.filter(
    (course) => course.completed > 0 && course.completed < course.total,
  );
  const completed = enrolledCourses.filter(
    (course) => course.total > 0 && course.completed >= course.total,
  );
  const continueCourse = inProgress[0] || enrolledCourses[0];
  const certificateCount =
    certificateData?.stats?.certificatesEarned ?? user?.analytics?.certificates ?? 0;
  const totalHours = user?.analytics?.totalHours;
  const weeklyActivity = Array.isArray(user?.analytics?.weeklyActivity)
    ? user.analytics.weeklyActivity
    : [];
  const weeklySummary = user?.analytics?.weeklySummary || null;
  const upcomingSessions = Array.isArray(user?.upcomingSessions) ? user.upcomingSessions : [];

  const handleContinue = () => {
    if (continueCourse) navigate(`/learning/${continueCourse.id}`);
    else navigate("/courses", { state: { activeTab: "explore" } });
  };

  const enrollAndPreview = async (course) => {
    if (!user) return navigate("/login");
    try {
      if (Number(course.priceValue || 0) === 0) {
        await fetch("/api/users/purchase-course", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ courseId: course.id, courseTitle: course.title }),
        });
        if (typeof fetchUserProfile === "function") await fetchUserProfile();
        window.dispatchEvent(new Event("refreshCourses"));
      }
      navigate(`/course-preview/${course.id}`);
    } catch (error) {
      console.error("Enroll and preview error:", error);
      navigate(`/course-preview/${course.id}`);
    }
  };

  if (loading) return <LoadingSpinner variant="inline" label="Loading dashboard..." />;

  const statCards = [
    { label: "Ongoing courses", value: inProgress.length, icon: Play, tone: "blue" },
    { label: "Completed", value: completed.length, icon: CheckCircle2, tone: "emerald" },
    { label: "Certificates", value: certificateCount, icon: Award, tone: "violet" },
    {
      label: totalHours == null ? "Hours not recorded" : "Hours spent",
      value: totalHours == null ? "—" : `${totalHours}h`,
      icon: Clock3,
      tone: "amber",
    },
  ];

  return (
    <main className="dashboard-content-scroll h-full min-h-0 flex-1 overflow-x-hidden overflow-y-scroll bg-canvas-alt px-4 pb-24 pt-5 sm:px-5 lg:px-6">
      <Helmet>
        <title>Dashboard | UptoSkills</title>
        <meta
          name="description"
          content="Track learning progress, enrolled courses and certificates on UptoSkills."
        />
      </Helmet>
      <Preferences key={localStorage.getItem("token")} mode="modal" />

      <div className="dashboard-content-inner mx-auto max-w-[1500px] space-y-6">
        <DashboardHero
          name={user?.name || "User"}
          streak={learningStreak}
          onContinue={() => navigate("/courses")}
          actionLabel="View My Courses"
        />

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Learning summary">
          {statCards.map(({ label, value, icon, tone }) => (
            <article
              key={label}
              className="dashboard-summary-card rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className={`dashboard-summary-icon dashboard-summary-icon--${tone}`}>
                {React.createElement(icon, { className: "h-5 w-5" })}
              </div>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-main">{value}</p>
              <p className="mt-1 text-sm font-semibold text-muted">{label}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#3867D6]">
                <Sparkles className="h-4 w-4" /> Next step
              </span>
              <h2 className="mt-2 text-xl font-extrabold text-main">Continue learning</h2>
            </div>
            <Link to="/courses" className="text-sm font-bold text-[#3867D6] hover:underline">
              View my courses
            </Link>
          </div>
          {continueCourse ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <img
                src={artworkFor(continueCourse.title)}
                alt={continueCourse.title}
                className="h-24 w-full rounded-xl object-cover sm:w-36"
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-extrabold text-main">
                  {continueCourse.title}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {continueCourse.completed > 0
                    ? `${continueCourse.completed} of ${continueCourse.total || "?"} lessons completed`
                    : "Ready for the first lesson"}
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-[#3867D6] transition-[width] duration-500"
                    style={{ width: `${continueCourse.progress}%` }}
                  />
                </div>
              </div>
              <button type="button" onClick={handleContinue} className={BLUE_BUTTON}>
                {continueCourse.completed > 0 ? "Continue" : "Start learning"}{" "}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-[#3867D6]" />
              <h3 className="mt-3 font-extrabold text-main">Choose the next skill to learn</h3>
              <p className="mt-1 text-sm text-muted">
                Explore the course catalog to begin a learning path.
              </p>
              <button type="button" onClick={handleContinue} className={`${BLUE_BUTTON} mt-5`}>
                Explore courses
              </button>
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
          <LearningActivityCard data={weeklyActivity} summary={weeklySummary} />
          <UpcomingLiveSession sessions={upcomingSessions} />
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#3867D6]">
                Discover
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-main">Popular courses</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous courses"
                onClick={() =>
                  document
                    .getElementById("dashboardCourseSlider")
                    ?.scrollBy({ left: -360, behavior: "smooth" })
                }
                className="dashboard-icon-button"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next courses"
                onClick={() =>
                  document
                    .getElementById("dashboardCourseSlider")
                    ?.scrollBy({ left: 360, behavior: "smooth" })
                }
                className="dashboard-icon-button"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            id="dashboardCourseSlider"
            className="dashboard-course-slider scrollbar-hide flex snap-x gap-5 overflow-x-auto pb-4"
          >
            {courses.slice(0, 10).map((course) => {
              const enrolled = user?.purchasedCourses?.some((entry) =>
                matchesCourse(entry, course.id),
              );
              return (
                <article
                  key={course.id}
                  className="dashboard-course-card group w-[300px] flex-none snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:w-[330px]"
                >
                  <div className="course-artwork-shell relative aspect-[16/9] overflow-hidden">
                    <img
                      src={artworkFor(course.title)}
                      alt={course.title}
                      className="course-artwork h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
                    />
                    <div className="absolute bottom-3 right-3">
                      <CourseCardMeta courseId={course.id} />
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="line-clamp-2 font-extrabold text-main">{course.title}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {course.lessons || "Lessons available"} · {course.level || "All levels"}
                    </p>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <span
                        className={`font-extrabold ${Number(course.priceValue || 0) === 0 ? "text-emerald-500" : "text-main"}`}
                      >
                        {Number(course.priceValue || 0) === 0 ? "Free" : `₹${course.priceValue}`}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          enrolled ? navigate(`/learning/${course.id}`) : enrollAndPreview(course)
                        }
                        className={BLUE_BUTTON}
                      >
                        {enrolled ? "Open course" : "View course"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#3867D6]">
                Your library
              </p>
              <h2 className="mt-1 text-xl font-extrabold text-main">Course progress</h2>
            </div>
            <Link to="/courses" className="text-sm font-bold text-[#3867D6]">
              View all →
            </Link>
          </div>
          {enrolledCourses.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {enrolledCourses.slice(0, 3).map((course) => (
                <Link
                  key={course.id}
                  to={`/learning/${course.id}`}
                  className="group rounded-2xl border border-border bg-canvas-alt p-4 transition hover:-translate-y-0.5 hover:border-[#3867D6]/40"
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={artworkFor(course.title)}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-extrabold text-main">{course.title}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {course.completed}/{course.total || 0} lessons
                      </p>
                    </div>
                    <BookOpen className="h-5 w-5 text-[#3867D6]" />
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-[#3867D6]"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Enrolled courses will appear here.</p>
          )}
        </section>

        <RecommendedForYou />
      </div>
      <FloatingAssistant />
    </main>
  );
};

export default Dashboard;
