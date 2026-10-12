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
import AIMentorCard from "../components/common/AIMentorCard";
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
  const handleAskMentor = () => {
  navigate("/ai-mentor");
};

const handleGenerateLesson = () => {
  navigate("/ai-mentor", {
    state: {
      action: "generate-lesson",
    },
  });
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
              {coursesData.allCourses
                .slice(0, 10)
                .map((course, index) => (
                  <div
                    key={index}
                    className="bg-card rounded-xl border border-border w-64 flex-shrink-0 shadow-sm transition-all duration-300 ease-out hover:shadow-xl hover:-translate-y-2 hover:scale-[1.03] hover:border-teal-400/50"
                  >
                    <div className="relative h-40">
                      <img
                        src={
                          course.title ===
                          "React Fundamentals"
                            ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                            : course.title ===
                                "Python For AI"
                              ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
                              : course.title ===
                                  "AI Ethics & Bias"
                                ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
                                : course.title ===
                                    "MongoDB Fundamentals"
                                  ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                                  : course.title ===
                                      "PostgreSQL"
                                    ? "/AI_Tutor_New_UI/Dashboard/logo.png"
                                    : "/AI_Tutor_New_UI/Dashboard/logo.png"
                        }
                        alt={course.title}
                        className="w-full h-full object-cover rounded-t-xl"
                      />

                      <div className="absolute bottom-2 right-2">
                        <CourseCardMeta
                          courseId={course.id}
                        />
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="text-sm font-semibold text-main line-clamp-2">
                        {course.title}
                      </h3>

                      <p className="text-xs text-muted">
                        {course.lessons} •{" "}
                        {course.level}
                      </p>

                      {(() => {
                        const isEnrolled =
                          Array.isArray(
                            user?.purchasedCourses
                          ) &&
                          user.purchasedCourses.some(
                            (c) =>
                              String(
                                c?.id ??
                                  c?.courseId ??
                                  c?.course?.id
                              ) ===
                              String(course.id)
                          );

                        return (
                          <div className="flex justify-between items-center mt-2">
                            <span className="font-bold text-green-500">
                              {course.priceValue ===
                              0
                                ? "Free"
                                : `₹${course.priceValue}`}
                            </span>

                            <button
                              onClick={() =>
                                enrollAndPreview(
                                  course
                                )
                              }
                              disabled={
                                isEnrolled
                              }
                              className={`px-3 py-1.5 text-xs rounded-lg ${
                                isEnrolled
                                  ? "bg-emerald-100 text-emerald-700 cursor-default"
                                  : "bg-teal-500 text-white hover:bg-teal-600"
                              }`}
                            >
                              {isEnrolled
                                ? "Enrolled"
                                : t(
                                    "dashboard.enroll"
                                  )}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* =================================================
              MY COURSES
              ================================================= */}

          <div className="xl:col-span-2 flex flex-col">
            <h2 className="text-xl font-bold text-main mb-6">
              {t(
                "dashboard.my_courses"
              )}
            </h2>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                {filteredMyCourses.length !==
                0 ? (
                  <table className="w-full">
                    <thead className="bg-canvas-alt">
                      <tr>
                        <th className="px-4 py-4 text-left text-sm font-medium text-muted">
                          {t(
                            "dashboard.course"
                          )}
                        </th>

                        <th className="px-4 py-4 text-left text-sm font-medium text-muted">
                          {t(
                            "dashboard.progress"
                          )}
                        </th>

                        <th className="px-4 py-4 text-left text-sm font-medium text-muted">
                          {t(
                            "dashboard.lessons"
                          )}
                        </th>

                        <th className="px-4 py-4 text-left text-sm font-medium text-muted">
                          {t(
                            "dashboard.level"
                          )}
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-200">
                      {filteredMyCourses.map(
                        (
                          course,
                          index
                        ) => (
                          <tr
                            key={index}
                            className="hover:bg-canvas-alt"
                          >
                            <td className="px-4 py-4">
                              <Link
                                to={`/learning/${course.id}`}
                                className="flex items-center"
                              >
                                <img
                                  src={
                                    course.title ===
                                    "React Fundamentals"
                                      ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                                      : course.title ===
                                          "Python For AI"
                                        ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
                                        : course.title ===
                                            "AI Ethics & Bias"
                                          ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
                                          : course.title ===
                                              "PostgreSQL"
                                            ? "/AI_Tutor_New_UI/Dashboard/postgresql.png"
                                            : course.title ===
                                                "MongoDB Fundamentals"
                                              ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                                              : "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                                  }
                                  alt={
                                    course.title
                                  }
                                  className="w-12 h-12 rounded-lg mr-4"
                                  loading="lazy"
                                />

                                <div>
                                  <div className="font-medium text-main hover:text-indigo-600">
                                    {
                                      course.title
                                    }
                                  </div>

                                  <div className="text-sm text-muted">
                                    {
                                      course.subtitle
                                    }
                                  </div>
                                </div>
                              </Link>
                            </td>

                            <td className="px-4 py-4">
                              <div className="w-20 bg-border rounded-full h-2 mb-1">
                                <div
                                  className={`h-2 rounded-full ${course.progressColor}`}
                                  style={{
                                    width: `${course.progress}%`,
                                  }}
                                />
                              </div>

                              <div className="text-sm text-muted">
                                {
                                  course.progress
                                }
                                %
                              </div>
                            </td>

                            <td className="px-4 py-4 text-muted">
                              {
                                course.lessons
                              }
                            </td>

                            <td className="px-4 py-4">
                              <span
                                className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${course.levelColor}`}
                              >
                                {
                                  course.level
                                }
                              </span>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                ) : normalizedSearchQuery &&
                  filteredAllCourses.length >
                    0 ? (
                  <div className="p-6">
                    <p className="text-center text-muted mb-4">
                      {t(
                        "dashboard.fallbackMatchingCourses"
                      )}
                    </p>

                    <div className="space-y-3">
                      {filteredAllCourses
                        .slice(0, 6)
                        .map(
                          (course) => (
                            <div
                              key={
                                course.id
                              }
                              className="flex items-center justify-between p-3 rounded-lg border border-border bg-canvas-alt"
                            >
                              <div className="flex items-center min-w-0">
                                <img
                                  src={
                                    course.title ===
                                    "React Fundamentals"
                                      ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                                      : course.title ===
                                          "Python For AI"
                                        ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
                                        : course.title ===
                                            "AI Ethics & Bias"
                                          ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
                                          : course.title ===
                                              "MongoDB Fundamentals"
                                            ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                                            : "/AI_Tutor_New_UI/Dashboard/logo.png"
                                  }
                                  alt={
                                    course.title
                                  }
                                  className="w-12 h-12 object-cover rounded-lg mr-3"
                                />

                                <div className="min-w-0">
                                  <div className="font-medium text-main truncate">
                                    {
                                      course.title
                                    }
                                  </div>

                                  <div className="text-sm text-muted truncate">
                                    {
                                      course.category
                                    }{" "}
                                    •{" "}
                                    {
                                      course.level
                                    }
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() =>
                                  enrollAndPreview(
                                    course
                                  )
                                }
                                className="ml-3 px-3 py-2 bg-teal-500 text-white text-xs font-medium rounded-lg hover:bg-teal-600"
                              >
                                {t(
                                  "dashboard.view"
                                )}
                              </button>
                            </div>
                          )
                        )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-muted">
                    <p>
                      {normalizedSearchQuery
                        ? t(
                            "dashboard.no_courses_search"
                          )
                        : t(
                            "dashboard.no_courses_enrolled"
                          )}
                    </p>

                    <button
                      className="mt-4 px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-lg hover:bg-teal-600"
                      onClick={
                        handleBrowseCourses
                      }
                    >
                      {t(
                        "dashboard.browse_courses"
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Continue Learning + AI Mentor */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

  {/* Continue Learning */}
  <div>
    {filteredContinueLearning.length !== 0 ? (
      <div>
        <h2 className="text-xl font-bold text-main mt-6 mb-6">
          {t("dashboard.continue_learning")}
        </h2>

        <div className="space-y-4">
          {filteredContinueLearning.map((item, index) => (
            <div
              key={index}
              className="bg-card rounded-xl p-4 border border-border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center">
                <Link
                  to={`/course-preview/${item.id}`}
                  className="flex items-center flex-1 min-w-0"
                >
                  <img
                    src={
                      item.title === "React Fundamentals"
                        ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                        : item.title === "Python For AI"
                        ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
                        : item.title === "AI Ethics & Bias"
                        ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
                        : item.title === "PostgreSQL"
                        ? "/AI_Tutor_New_UI/Dashboard/postgresql.png"
                        : item.title === "MongoDB Fundamentals"
                        ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                        : "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                    }
                    alt={item.title}
                    className="w-12 h-12 rounded-lg mr-4 object-cover flex-shrink-0"
                    loading="lazy"
                  />

                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-main mb-1 hover:text-teal-600 truncate">
                      {item.title}
                    </h3>

                    <p className="text-sm text-muted mb-2 truncate">
                      {item.lesson}
                    </p>

                    <div className="w-full bg-border rounded-full h-2 mb-2">
                      <div
                        className={`h-2 rounded-full ${item.progressColor}`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                </Link>

                <Link
                  to={`/learning/${item.id}`}
                  className="ml-4 px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-lg hover:bg-teal-600 flex-shrink-0"
                >
                  {t("dashboard.continue")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="mt-6">
        <h2 className="text-xl font-bold text-main mb-6">
          {t("dashboard.continue_learning")}
        </h2>

        <div className="bg-card rounded-xl border border-border p-6 text-center text-muted">
          No courses currently in progress.
        </div>
      </div>
    )}
  </div>

  {/* AI Mentor */}
  <div className="mt-6 lg:mt-0">
    <AIMentorCard
      onAskMentor={handleAskMentor}
      onGenerateLesson={handleGenerateLesson}
    />
  </div>

</div>
            {/* =================================================
                CONTINUE LEARNING
                ================================================= */}

            {filteredContinueLearning.length !==
              0 && (
              <div>
                <h2 className="text-xl font-bold text-main mt-6 mb-6">
                  {t(
                    "dashboard.continue_learning"
                  )}
                </h2>

                <div className="space-y-4">
                  {filteredContinueLearning.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={index}
                        className="bg-card rounded-xl p-4 border border-border shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center">
                          <Link
                            to={`/course-preview/${item.id}`}
                            className="flex items-center flex-1"
                          >
                            <img
                              src={
                                item.title ===
                                "React Fundamentals"
                                  ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                                  : item.title ===
                                      "Python For AI"
                                    ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
                                    : item.title ===
                                        "AI Ethics & Bias"
                                      ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
                                      : item.title ===
                                          "PostgreSQL"
                                        ? "/AI_Tutor_New_UI/Dashboard/postgresql.png"
                                        : item.title ===
                                            "MongoDB Fundamentals"
                                          ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                                          : "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
                              }
                              alt={
                                item.title
                              }
                              className="w-12 h-12 rounded-lg mr-4"
                              loading="lazy"
                            />

                            <div className="flex-1">
                              <h3 className="font-medium text-main mb-1 hover:text-teal-600">
                                {
                                  item.title
                                }
                              </h3>

                              <p className="text-sm text-muted mb-2">
                                {
                                  item.lesson
                                }
                              </p>

                              <div className="w-full bg-border rounded-full h-2 mb-2">
                                <div
                                  className={`h-2 rounded-full ${item.progressColor}`}
                                  style={{
                                    width: `${item.progress}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </Link>

                          <Link
                            to={`/learning/${item.id}`}
                            className="ml-4 px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-lg hover:bg-teal-600"
                          >
                            {t(
                              "dashboard.continue"
                            )}
                          </Link>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* =================================================
                LATEST AI LESSONS
                EXACT DESIGN + WORKING BUTTONS
                ================================================= */}

            <div className="mt-8 flex justify-end">
              <div
                className="
                  w-full
                  max-w-[390px]
                  bg-white
                  rounded-[16px]
                  border
                  border-[#dce5f1]
                  px-[14px]
                  py-[13px]
                  shadow-[0_2px_10px_rgba(34,80,130,0.08)]
                "
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-[8px]">
                  <div className="flex items-center gap-[7px]">
                    <span className="text-[15px] leading-none">
                      ✨
                    </span>

                    <h2 className="text-[11px] font-bold text-[#1f2d43]">
                      Latest AI Lessons
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={handleViewAllLessons}
                    className="
                      text-[9px]
                      font-medium
                      text-[#4388f7]
                      hover:text-[#2472e8]
                      transition-colors
                      cursor-pointer
                    "
                  >
                    View All →
                  </button>
                </div>

                {/* Lesson List */}
                <div className="space-y-[2px]">
                  {latestLessons.map(
                    (lesson) => (
                      <LessonItem
                        key={lesson.id}
                        lesson={lesson}
                        onPlay={() =>
                          handlePlayLesson(
                            lesson
                          )
                        }
                      />
                    )
                  )}
                </div>
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
