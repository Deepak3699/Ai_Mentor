import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import {
  Play,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  Award,
  Database,
  X,
} from "lucide-react";
import Preferences from "../components/Preferences";
import API_BASE_URL from "../lib/api";
import FloatingAssistant from "../components/common/FloatingAssistant";
import CourseCardMeta from "../components/common/CourseCardMeta";
import DashboardHero from "../components/DashboardHero";
import UpcomingLiveSession from "../components/UpcomingLiveSession";
import { Helmet } from "react-helmet-async";

/* =========================================================
   LATEST AI LESSONS
   ========================================================= */

const latestLessons = [
  {
    id: 1,
    title: "React Components",
    category: "Web Dev",
    duration: "8 min",
    type: "react",
  },
  {
    id: 2,
    title: "Python OOP Concepts",
    category: "Python",
    duration: "12 min",
    type: "python",
  },
  {
    id: 3,
    title: "SQL Joins & Relationships",
    category: "Database",
    duration: "10 min",
    type: "database",
  },
];

/* Category colors */
const categoryStyles = {
  "Web Dev": "bg-[#f1e9ff] text-[#7c3aed]",
  Python: "bg-[#fff6d8] text-[#b77900]",
  Database: "bg-[#f1e9ff] text-[#7c3aed]",
};

/* =========================================================
   LESSON THUMBNAIL
   ========================================================= */

const LessonThumbnail = ({ type }) => {
  /* React thumbnail */
  if (type === "react") {
    return (
      <div className="w-[58px] h-[40px] shrink-0 rounded-[7px] bg-[#123d62] flex items-center justify-center overflow-hidden">
        <svg
          width="34"
          height="34"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse
            cx="50"
            cy="50"
            rx="38"
            ry="15"
            stroke="#61DAFB"
            strokeWidth="6"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="38"
            ry="15"
            transform="rotate(60 50 50)"
            stroke="#61DAFB"
            strokeWidth="6"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="38"
            ry="15"
            transform="rotate(120 50 50)"
            stroke="#61DAFB"
            strokeWidth="6"
          />
          <circle cx="50" cy="50" r="7" fill="#61DAFB" />
        </svg>
      </div>
    );
  }

  /* Python thumbnail */
  if (type === "python") {
    return (
      <div className="w-[58px] h-[40px] shrink-0 rounded-[7px] bg-[#102b4c] flex items-center justify-center overflow-hidden">
        <svg
          width="38"
          height="34"
          viewBox="0 0 100 90"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M49 7C30 7 30 15 30 15V29H52V34H20C20 34 8 32 8 52C8 72 20 73 20 73H31V61C31 61 30 50 42 50H60C60 50 70 50 70 38V19C70 19 68 7 49 7Z"
            fill="#3776AB"
          />
          <circle cx="42" cy="17" r="3" fill="white" />

          <path
            d="M51 83C70 83 70 75 70 75V61H48V56H80C80 56 92 58 92 38C92 18 80 17 80 17H69V29C69 29 70 40 58 40H40C40 40 30 40 30 52V71C30 71 32 83 51 83Z"
            fill="#FFD343"
          />
          <circle cx="58" cy="73" r="3" fill="white" />
        </svg>
      </div>
    );
  }

  /* Database thumbnail */
  return (
    <div className="w-[58px] h-[40px] shrink-0 rounded-[7px] bg-[#132e61] flex items-center justify-center overflow-hidden">
      <Database
        size={27}
        strokeWidth={2.5}
        className="text-[#3b9cff]"
      />
    </div>
  );
};

/* =========================================================
   REUSABLE LESSON ITEM
   ========================================================= */

const LessonItem = ({ lesson, onPlay }) => {
  return (
    <div className="flex items-center min-h-[48px] gap-3">
      {/* Thumbnail */}
      <LessonThumbnail type={lesson.type} />

      {/* Text */}
      <div className="min-w-0 flex-1">
        <h3 className="text-[11px] leading-[14px] font-semibold text-[#24324a] truncate">
          {lesson.title}
        </h3>

        <div className="flex items-center gap-2 mt-[3px]">
          <span
            className={`inline-flex items-center rounded-full px-[7px] py-[2px] text-[8px] leading-[11px] font-medium ${
              categoryStyles[lesson.category]
            }`}
          >
            {lesson.category}
          </span>

          <span className="flex items-center gap-1 whitespace-nowrap text-[9px] text-[#7b8798]">
            <Clock
              size={11}
              strokeWidth={2}
              className="text-[#8a94a5]"
            />
            {lesson.duration}
          </span>
        </div>
      </div>

      {/* Play button */}
      <button
        type="button"
        aria-label={`Play ${lesson.title}`}
        onClick={onPlay}
        className="
          w-[25px]
          h-[25px]
          shrink-0
          rounded-full
          bg-[#edf5ff]
          flex
          items-center
          justify-center
          text-[#4388f7]
          transition-all
          duration-200
          hover:bg-[#4388f7]
          hover:text-white
          hover:scale-105
          cursor-pointer
        "
      >
        <Play
          size={11}
          fill="currentColor"
          strokeWidth={0}
          className="ml-[1px]"
        />
      </button>
    </div>
  );
};

/* =========================================================
   DASHBOARD
   ========================================================= */

const Dashboard = () => {
  const { t } = useTranslation();

  const [coursesData, setCoursesData] = useState({
    statsCards: [],
    allCourses: [],
  });

  const searchQuery = "";

  const [loading, setLoading] = useState(true);

  const { user, fetchUserProfile } = useAuth();

  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [learningStreak] = useState(() => {
    const savedStreak = Number.parseInt(localStorage.getItem("streak") || "0", 10);
    return Number.isNaN(savedStreak) ? 0 : Math.max(savedStreak, 0);
  });

  /* =======================================================
     LATEST AI LESSON STATES
     ======================================================= */

  const [selectedLesson, setSelectedLesson] = useState(null);
  const [showAllLessons, setShowAllLessons] = useState(false);

  /* =======================================================
     FETCH DATA
     ======================================================= */

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);

      try {
        const token = localStorage.getItem("token");

        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        const [
          coursesResult,
          statsResult,
          certResult,
        ] = await Promise.allSettled([
          fetch("/api/courses", { headers }),
          fetch("/api/courses/stats/cards", { headers }),
          fetch("/api/certificate/list", { headers }),
        ]);

        const coursesRes =
          coursesResult.status === "fulfilled"
            ? coursesResult.value
            : null;

        const statsRes =
          statsResult.status === "fulfilled"
            ? statsResult.value
            : null;

        const res =
          certResult.status === "fulfilled"
            ? certResult.value
            : null;

        if (res && res.ok) {
          const json = await res.json();
          setData(json);
        } else if (res && !res.ok) {
          console.error(
            `Failed to fetch certificates: ${res.status}`
          );
        }

        if (!coursesRes || !coursesRes.ok) {
          throw new Error(
            `Courses API failed: ${coursesRes?.status}`
          );
        }

        if (!statsRes || !statsRes.ok) {
          throw new Error(
            `Stats API failed: ${statsRes?.status}`
          );
        }

        const allCourses = await coursesRes.json();

        console.log("ALL COURSES DATA:");
        console.log(allCourses);

        allCourses.forEach((course) => {
          console.log({
            id: course.id,
            title: course.title,
            image: course.image,
          });
        });

        const { statsCards } = await statsRes.json();

        setCoursesData({
          allCourses,
          statsCards,
        });
      } catch (error) {
        console.error(
          "Error fetching dashboard data:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  /* =======================================================
     STATS
     ======================================================= */

  const calculateStats = () => {
    const baseCards = [
      {
        icon: <Play className="w-5 h-5 text-blue-600" />,
        value: data?.stats?.inProgress ?? 0,
        label: "Ongoing Courses",
        change: "+0%",
        bgColor: "bg-blue-50",
        iconBg: "bg-blue-100",
      },
      {
        icon: (
          <CheckCircle className="w-5 h-5 text-green-600" />
        ),
        value: data?.stats?.completed ?? 0,
        label: "Completed",
        change: "+0",
        bgColor: "bg-green-50",
        iconBg: "bg-green-100",
      },
      {
        icon: (
          <Award className="w-5 h-5 text-purple-600" />
        ),
        value: data?.stats?.certificatesEarned ?? 0,
        label: "Certificates",
        change: "+0",
        bgColor: "bg-purple-50",
        iconBg: "bg-purple-100",
      },
      {
        icon: (
          <Clock className="w-5 h-5 text-orange-600" />
        ),
        value: "0h",
        label: "Hours Spent",
        change: "+0h",
        bgColor: "bg-orange-50",
        iconBg: "bg-orange-100",
      },
    ];

    if (
      !user?.purchasedCourses ||
      !coursesData.statsCards ||
      coursesData.statsCards.length < 4
    ) {
      return baseCards;
    }

    let coursesInProgress = 0;
    let completedCourses = 0;

    const certificates =
      user.analytics?.certificates || 0;

    const totalHours =
      user.analytics?.totalHours || 0;

    user.purchasedCourses.forEach(
      (purchasedCourse) => {
        const courseInfo =
          coursesData.allCourses.find(
            (c) =>
              c.id == purchasedCourse.courseId
          );

        if (courseInfo) {
          const totalLessons =
            courseInfo.lessonsCount ||
            (courseInfo.lessons
              ? courseInfo.lessons.includes(" of ")
                ? parseInt(
                    courseInfo.lessons.split(" of ")[1]
                  )
                : parseInt(
                    courseInfo.lessons.split(" ")[0]
                  )
              : 0);

          const completedLessons =
            purchasedCourse.progress
              ?.completedLessons?.length || 0;

          if (
            completedLessons === totalLessons &&
            totalLessons > 0
          ) {
            completedCourses++;
          } else {
            coursesInProgress++;
          }
        }
      }
    );

    return [
      {
        ...baseCards[0],
        value: coursesInProgress.toString(),
      },
      {
        ...baseCards[1],
        value: completedCourses.toString(),
      },
      {
        ...baseCards[2],
        value: certificates.toString(),
      },
      {
        ...baseCards[3],
        value: `${totalHours}h`,
      },
    ];
  };

  const dynamicStatsCards = calculateStats();

  /* =======================================================
     MY COURSES
     ======================================================= */

  const myCourses = coursesData.allCourses
    .filter((course) =>
      user?.purchasedCourses?.some(
        (purchased) =>
          purchased.courseId == course.id
      )
    )
    .map((course) => {
      const purchasedCourse =
        user?.purchasedCourses?.find(
          (p) => p.courseId == course.id
        );

      const totalLessons =
        course.lessonsCount ||
        (course.lessons
          ? course.lessons.includes(" of ")
            ? parseInt(
                course.lessons.split(" of ")[1]
              )
            : parseInt(
                course.lessons.split(" ")[0]
              )
          : 0);

      const completedLessons =
        purchasedCourse?.progress
          ?.completedLessons?.length || 0;

      return {
        id: course.id,
        title: course.title,
        subtitle: course.category,
        progress:
          totalLessons > 0
            ? Math.round(
                (completedLessons / totalLessons) *
                  100
              )
            : 0,
        lessons: `${completedLessons}/${totalLessons}`,
        level: course.level,

        levelColor:
          course.level === "Beginner"
            ? "bg-blue-100 text-blue-800"
            : course.level === "Intermediate"
              ? "bg-green-100 text-green-800"
              : "bg-yellow-100 text-yellow-800",

        image: course.image,

        progressColor: "bg-indigo-600",
      };
    });

  /* =======================================================
     CONTINUE LEARNING
     ======================================================= */

  const continueLearning = coursesData.allCourses
    .filter((course) =>
      user?.purchasedCourses?.some(
        (purchased) =>
          purchased.courseId == course.id
      )
    )
    .filter((course) => {
      const purchasedCourse =
        user?.purchasedCourses?.find(
          (p) => p.courseId == course.id
        );

      const totalLessons =
        course.lessonsCount ||
        (course.lessons
          ? course.lessons.includes(" of ")
            ? parseInt(
                course.lessons.split(" of ")[1]
              )
            : parseInt(
                course.lessons.split(" ")[0]
              )
          : 0);

      const completedLessons =
        purchasedCourse?.progress
          ?.completedLessons?.length || 0;

      return (
        completedLessons > 0 &&
        completedLessons < totalLessons
      );
    })
    .slice(0, 3)
    .map((course) => {
      const purchasedCourse =
        user?.purchasedCourses?.find(
          (p) => p.courseId === course.id
        );

      const totalLessons =
        course.lessonsCount ||
        (course.lessons
          ? course.lessons.includes(" of ")
            ? parseInt(
                course.lessons.split(" of ")[1]
              )
            : parseInt(
                course.lessons.split(" ")[0]
              )
          : 0);

      const completedLessons =
        purchasedCourse?.progress
          ?.completedLessons?.length || 0;

      const progress =
        totalLessons > 0
          ? Math.round(
              (completedLessons / totalLessons) *
                100
            )
          : 0;

      const currentLesson =
        purchasedCourse?.progress?.currentLesson;

      const lessonTitle = currentLesson
        ? `Lesson ${currentLesson.lessonId}: ${currentLesson.moduleTitle}`
        : `Continue from Lesson ${
            completedLessons + 1
          }`;

      return {
        id: course.id,
        title: course.title,
        lesson: lessonTitle,
        progress,
        image: course.image,
        progressColor:
          progress > 75
            ? "bg-cyan-600"
            : "bg-orange-400",
      };
    });

  /* =======================================================
     SEARCH
     ======================================================= */

  const normalizedSearchQuery =
    searchQuery.trim().toLowerCase();

  const filteredMyCourses =
    myCourses.filter((course) => {
      if (!normalizedSearchQuery) return true;

      return (
        course.title
          ?.toLowerCase()
          .includes(normalizedSearchQuery) ||
        course.subtitle
          ?.toLowerCase()
          .includes(normalizedSearchQuery) ||
        course.level
          ?.toLowerCase()
          .includes(normalizedSearchQuery)
      );
    });

  const filteredContinueLearning =
    continueLearning.filter((course) => {
      if (!normalizedSearchQuery) return true;

      return (
        course.title
          ?.toLowerCase()
          .includes(normalizedSearchQuery) ||
        course.lesson
          ?.toLowerCase()
          .includes(normalizedSearchQuery)
      );
    });

  const filteredAllCourses =
    coursesData.allCourses.filter((course) => {
      if (!normalizedSearchQuery) return false;

      return (
        course.title
          ?.toLowerCase()
          .includes(normalizedSearchQuery) ||
        course.category
          ?.toLowerCase()
          .includes(normalizedSearchQuery) ||
        course.level
          ?.toLowerCase()
          .includes(normalizedSearchQuery)
      );
    });

  /* =======================================================
     HANDLERS
     ======================================================= */

  const handleBrowseCourses = () => {
    navigate("/courses", {
      state: {
        activeTab: "explore",
      },
    });
  };

  const handleContinueLearning = () => {
    const courseId = continueLearning[0]?.id ?? myCourses[0]?.id;
    if (courseId) {
      navigate(`/learning/${courseId}`);
      return;
    }
    handleBrowseCourses();
  };

  const enrollAndPreview = async (course) => {
    if (!user) {
      navigate("/login");
      return;
    }

    try {
      const priceValue = Number(
        course.priceValue || 0
      );

      if (priceValue === 0) {
        await fetch(
          `${API_BASE_URL}/api/users/purchase-course`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization: `Bearer ${localStorage.getItem(
                "token"
              )}`,
            },
            body: JSON.stringify({
              courseId: course.id,
              courseTitle: course.title,
            }),
          }
        );

        if (
          typeof fetchUserProfile === "function"
        ) {
          await fetchUserProfile();
        }

        window.dispatchEvent(
          new Event("refreshCourses")
        );
      }

      navigate(
        `/course-preview/${course.id}`
      );
    } catch (err) {
      console.error(
        "Enroll+Preview error:",
        err
      );

      navigate(
        `/course-preview/${course.id}`
      );
    }
  };

  /* =======================================================
     LATEST AI LESSON HANDLERS
     ======================================================= */

  const handlePlayLesson = (lesson) => {
    setSelectedLesson(lesson);
  };

  const handleCloseLesson = () => {
    setSelectedLesson(null);
  };

  const handleViewAllLessons = () => {
    setShowAllLessons(true);
  };

  const handleCloseAllLessons = () => {
    setShowAllLessons(false);
  };

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading) {
    return (
      <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>

          <p className="text-muted">
            {t("dashboard.loading")}
          </p>
        </div>
      </main>
    );
  }

  /* =======================================================
     UI
     ======================================================= */

  return (
    <main className="flex-1 overflow-x-hidden overflow-y-auto bg-canvas-alt p-6">
      <Helmet>
        <title>
          Dashboard | UptoSkills
        </title>

        <meta
          name="description"
          content="Track your learning progress, enrolled courses and certificates on UptoSkills."
        />

        <meta
          property="og:title"
          content="Dashboard | UptoSkills"
        />

        <meta
          property="og:type"
          content="website"
        />
      </Helmet>

      <Preferences
        key={localStorage.getItem("token")}
        mode="modal"
        onSuccess={() => {
          console.log(
            "Preferences saved"
          );
        }}
      />

      <div className="max-w-7xl pt-16 mx-auto space-y-8">

        {/* =================================================
            STATS CARDS
            ================================================= */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {dynamicStatsCards.map(
            (card, index) => {
              const statLabelKeys = [
                "ongoing_courses",
                "completed",
                "certificates",
                "hours_spent",
              ];

              return (
                <div
                  key={index}
                  className="bg-card rounded-2xl p-6 shadow-sm border border-border hover:shadow-lg hover:-translate-y-1 hover:border-teal-500/40 transition-all duration-300 cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`p-3 rounded-xl ${card.iconBg}`}
                    >
                      {card.icon}
                    </div>

                    <span className="text-sm font-medium text-green-600">
                      {card.change}
                    </span>
                  </div>

                  <div className="text-2xl font-bold text-main mb-1">
                    {card.value}
                  </div>

                  <div className="text-sm text-muted">
                    {t(
                      `dashboard.${statLabelKeys[index]}`
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>

        {/* =================================================
            POPULAR COURSES
            ================================================= */}

        <div className="grid grid-cols-1 gap-8">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-main">
                {t(
                  "dashboard.popular_courses"
                )}
              </h2>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    document
                      .getElementById(
                        "courseSlider"
                      )
                      ?.scrollBy({
                        left: -300,
                        behavior:
                          "smooth",
                      });
                  }}
                  className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    document
                      .getElementById(
                        "courseSlider"
                      )
                      ?.scrollBy({
                        left: 300,
                        behavior:
                          "smooth",
                      });
                  }}
                  className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              id="courseSlider"
              className="flex gap-6 overflow-x-auto px-3 py-3 pb-6"
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
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside
          className="w-full xl:w-80 shrink-0 flex flex-col justify-end space-y-6"
          aria-label="Dashboard sidebar"
        >
          <div className="mt-auto w-full">
            <UpcomingLiveSession />
          </div>
        </aside>
      </div>

      {/* =====================================================
          PLAY LESSON MODAL
          ===================================================== */}

      {selectedLesson && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={handleCloseLesson}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <LessonThumbnail
                  type={selectedLesson.type}
                />

                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedLesson.title}
                  </h2>

                  <p className="text-sm text-gray-500 mt-1">
                    {selectedLesson.category} •{" "}
                    {selectedLesson.duration}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseLesson}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
                aria-label="Close lesson"
              >
                <X size={18} />
              </button>
            </div>

            {/* Lesson Content */}
            <div className="mt-6 rounded-xl bg-gray-50 border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#edf5ff] text-[#4388f7] flex items-center justify-center">
                  <Play
                    size={16}
                    fill="currentColor"
                  />
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900">
                    Ready to learn?
                  </h3>

                  <p className="text-sm text-gray-500">
                    Your AI lesson is ready.
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600 leading-6">
                Start learning{" "}
                <span className="font-semibold">
                  {selectedLesson.title}
                </span>{" "}
                from the latest AI-generated lessons.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={handleCloseLesson}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  console.log(
                    "Starting lesson:",
                    selectedLesson
                  );
                  handleCloseLesson();
                }}
                className="flex-1 py-3 rounded-xl bg-[#4388f7] text-white font-semibold hover:bg-[#2472e8] transition cursor-pointer"
              >
                Start Learning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          VIEW ALL LESSONS MODAL
          ===================================================== */}

      {showAllLessons && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4"
          onClick={handleCloseAllLessons}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  All AI Lessons
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  Recently generated AI lessons
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseAllLessons}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
                aria-label="Close all lessons"
              >
                <X size={18} />
              </button>
            </div>

            {/* All Lessons */}
            <div className="space-y-3">
              {latestLessons.map(
                (lesson) => (
                  <div
                    key={lesson.id}
                    className="rounded-xl border border-gray-100 p-3 hover:border-[#4388f7]/30 hover:bg-gray-50 transition"
                  >
                    <LessonItem
                      lesson={lesson}
                      onPlay={() =>
                        handlePlayLesson(
                          lesson
                        )
                      }
                    />
                  </div>
                )
              )}
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={handleCloseAllLessons}
              className="w-full mt-5 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <FloatingAssistant />
    </main>
  );
};

export default Dashboard;
