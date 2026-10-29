import { apiFetch as fetch } from "../lib/api";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  Star,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import API_BASE_URL from "../lib/api";
import ReportModal from "../components/common/ReportModal";
import toast from "react-hot-toast";
import FloatingAssistant from "../components/common/FloatingAssistant";
import LoadingSpinner from "../components/common/LoadingSpinner";
import CourseCard from "../components/common/CourseCard";

const BLUE_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#3867D6] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-[#315BC0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3867D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

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

const normalizeCategory = (category) => (category === "Databases" ? "Database" : category);
const isFreeCourse = (course) =>
  Number(course?.priceValue || 0) === 0 ||
  course?.price === "₹0" ||
  course?.price === "Free" ||
  !course?.price;
const courseIdMatches = (entry, targetId) =>
  String(entry?.id ?? entry?.courseId ?? entry?.course?.id) === String(targetId);
const formatLessonCount = (value) => {
  const parsed = Number.parseInt(value, 10) || 0;
  if (typeof value === "string" && /lessons?/i.test(value)) return value;
  return `${parsed} ${parsed === 1 ? "lesson" : "lessons"}`;
};

const FilterChoice = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
      active
        ? "border-[#3867D6] bg-[#3867D6] text-white shadow-md shadow-blue-600/15"
        : "border-border bg-card text-main hover:border-[#3867D6]/50 hover:bg-blue-500/5"
    }`}
  >
    {children}
  </button>
);

const ExploreCourseCard = ({ course, enrolled, progress, onAction, actionLabel }) => {
  const completedLessons = progress?.completedLessons?.length || 0;
  const lessonCount = Number.parseInt(course?.lessons, 10) || 0;
  const hasStarted = completedLessons > 0 || progress?.currentLesson != null;
  const percentage =
    lessonCount > 0 ? Math.min(100, Math.round((completedLessons / lessonCount) * 100)) : null;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[#3867D6]/35 hover:shadow-xl hover:shadow-blue-950/10">
      <div className="course-artwork-shell relative aspect-[16/8] overflow-hidden bg-canvas-alt">
        <img
          src={artworkFor(course.title)}
          className="course-artwork h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
          alt={course.title}
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
            {course.level || "All levels"}
          </span>
          {course.rating && (
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {course.rating}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-4 flex-1">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#3867D6]">
            {normalizeCategory(course.category) || "Course"}
          </p>
          <h3 className="line-clamp-2 text-base font-extrabold leading-6 text-main">
            {course.title}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted">
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> {formatLessonCount(course.lessons)}
            </span>
            {enrolled && (
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" /> {hasStarted ? "In progress" : "Ready to start"}
              </span>
            )}
          </div>
        </div>

        {enrolled && percentage !== null && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span className="text-muted">Course progress</span>
              <span className="text-main">{percentage}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-canvas-alt">
              <div
                className="h-full rounded-full bg-[#3867D6]"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}

        {!enrolled && (
          <div className="mb-4 flex items-center justify-between border-t border-border pt-4">
            <span
              className={`text-sm font-extrabold ${isFreeCourse(course) ? "text-emerald-500" : "text-main"}`}
            >
              {isFreeCourse(course) ? "Free" : `₹${course.priceValue || 0}`}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onAction}
          disabled={!onAction}
          className={`${BLUE_BUTTON} w-full`}
        >
          {enrolled ? <Play className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          {actionLabel}
        </button>
      </div>
    </article>
  );
};

const CoursesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const filterRef = useRef(null);
  const [activeTab, setActiveTab] = useState(
    location?.state?.activeTab === "explore" ? "explore" : "my-courses",
  );
  const [exploreCourses, setExploreCourses] = useState([]);
  const [myCourses, setMyCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // My Courses toolbar state
const [myCoursesSearch, setMyCoursesSearch] = useState("");
const [courseStatusTab, setCourseStatusTab] = useState("all");
const [courseSortBy, setCourseSortBy] = useState("latest");

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState("");
  const [subType, setSubType] = useState("");
  const [reportType, setReportType] = useState("Select Issue Type");
  const [reportLoading, setReportLoading] = useState(false);

  const loadCourses = async () => {
    try {
      const token = localStorage.getItem("token");
      const [exploreResponse, myResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/courses`),
        fetch(`${API_BASE_URL}/api/courses/my-courses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setExploreCourses(await exploreResponse.json());
      setMyCourses(myResponse.ok ? await myResponse.json() : []);
    } catch (error) {
      console.error("Error fetching courses:", error);
      toast.error("Courses could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
    window.addEventListener("refreshCourses", loadCourses);
    return () => window.removeEventListener("refreshCourses", loadCourses);
  }, []);

  useEffect(() => {
    if (location?.state?.activeTab === "explore") setActiveTab("explore");
  }, [location]);

  useEffect(() => {
    const closeOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) setShowFilters(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowFilters(false);
    };
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const availableCategories = useMemo(
    () => [
      ...new Set(
        exploreCourses.map((course) => normalizeCategory(course.category)).filter(Boolean),
      ),
    ],
    [exploreCourses],
  );
  const availableLevels = useMemo(
    () => [...new Set(exploreCourses.map((course) => course.level).filter(Boolean))],
    [exploreCourses],
  );
  const activeFilterCount = filters.category.length + filters.level.length + filters.price.length;

  const toggleFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  const matchesControls = (course) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || course.title?.toLowerCase().includes(query);
    const matchesCategory =
      filters.category.length === 0 ||
      filters.category.includes(normalizeCategory(course.category));
    const matchesLevel = filters.level.length === 0 || filters.level.includes(course.level);
    const priceType = isFreeCourse(course) ? "Free" : "Paid";
    const matchesPrice = filters.price.length === 0 || filters.price.includes(priceType);
    return matchesSearch && matchesCategory && matchesLevel && matchesPrice;
  };

  const filteredMyCourses = myCourses.filter(matchesControls);
  const filteredExploreCourses = exploreCourses.filter(matchesControls);
  const startedCount = myCourses.filter((course) => {
    const entry = user?.purchasedCourses?.find((item) => courseIdMatches(item, course.id));
    return entry?.progress?.completedLessons?.length > 0 || entry?.progress?.currentLesson != null;
  }).length;

  const refreshAfterEnrollment = async () => {
    await loadCourses();
    setShowEnrollPopup(false);
    setSelectedCourse(null);
    setActiveTab("my-courses");
    window.dispatchEvent(new Event("refreshNotifications"));
  };

  const handleFreeEnrollment = async () => {
    if (!selectedCourse || isPurchasing) return;
    try {
      setIsPurchasing(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/users/purchase-course`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courseId: selectedCourse.id, courseTitle: selectedCourse.title }),
      });
      if (!response.ok) throw new Error("Enrollment failed");
      await refreshAfterEnrollment();
      toast.success("Successfully enrolled!");
    } catch (error) {
      console.error("Enroll error:", error);
      toast.error("Failed to enroll. Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleStripePayment = async () => {
    if (!selectedCourse || isPurchasing) return;
    try {
      setIsPurchasing(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/payment/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course: {
            id: selectedCourse.id,
            title: selectedCourse.title,
            priceValue: Number(selectedCourse.priceValue || 0),
          },
        }),
      });
      const data = await response.json();
      if (!data.url) throw new Error("Payment failed");
      window.location.href = data.url;
    } catch (error) {
      console.error(error);
      toast.error("Payment error");
      setIsPurchasing(false);
    }
  };

  const handleRazorpayPayment = async () => {
    if (!selectedCourse || isPurchasing) return;
    try {
      setIsPurchasing(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/payment/razorpay/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course: { id: selectedCourse.id, priceValue: Number(selectedCourse.priceValue || 0) },
        }),
      });
      const order = await response.json();
      if (!order.orderId) throw new Error(order.error || "Failed to create order");
      const razorpay = new window.Razorpay({
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || "",
        amount: order.amount,
        currency: order.currency,
        name: "UpToSkills",
        description: selectedCourse.title,
        order_id: order.orderId,
        theme: { color: "#3867D6" },
        handler: async (payment) => {
          const verifyResponse = await fetch(`${API_BASE_URL}/api/payment/razorpay/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              razorpay_order_id: payment.razorpay_order_id,
              razorpay_payment_id: payment.razorpay_payment_id,
              razorpay_signature: payment.razorpay_signature,
              courseId: selectedCourse.id,
              userId: user?.id,
            }),
          });
          const verified = await verifyResponse.json();
          if (!verified.success) throw new Error(verified.error || "Payment verification failed");
          toast.success("Payment successful!");
          await refreshAfterEnrollment();
        },
        prefill: {
          name: user?.name || user?.firstName || "",
          email: user?.email || "",
          contact: user?.phone || "",
        },
      });
      razorpay.on("payment.failed", (payment) => toast.error(payment.error.description));
      razorpay.open();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Payment error");
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleReportSubmit = async () => {
    try {
      setReportLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/course-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          reportType,
          subType,
          description: reportText,
          courseName: selectedCourse || "General",
        }),
      });
      if (!response.ok) throw new Error("Failed to submit report");
      setShowReportModal(false);
      setReportText("");
      setReportType("Select Issue Type");
      setSubType("");
    } catch (error) {
      console.error(error);
      toast.error(error.message);
    } finally {
      setReportLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas-alt p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-main">Please log in</h1>
          <p className="mt-2 text-muted">You need an account to access courses.</p>
        </div>
      </div>
    );
  }
  if (loading) return <LoadingSpinner label="Loading courses" />;

  const filteredExploreCourses = exploreCourses
    .filter((course) => !myCourses.some((c) => courseIdMatches(c, course.id)))
    .filter((course) => {
      if (searchQuery.trim() !== "") {
        return course.title.toLowerCase().includes(searchQuery.toLowerCase());
      }

      const cat =
        course.category === "Databases" ? "Database" : course.category;
      const matchesCategory =
        filters.category.length === 0 || filters.category.includes(cat);
      const matchesLevel =
        filters.level.length === 0 || filters.level.includes(course.level);

      const isFree =
        course.priceValue === 0 ||
        course.price === "₹0" ||
        course.price === "Free" ||
        !course.price;
      const type = isFree ? "Free" : "Paid";
      const matchesPrice =
        filters.price.length === 0 || filters.price.includes(type);

      return matchesCategory && matchesLevel && matchesPrice;
    });

  // Same filters as filteredExploreCourses but WITHOUT the enrollment exclusion,
  // so enrolled cards stay visible with the "Enrolled" button state.
  const allFilteredExploreCourses = exploreCourses.filter((course) => {
    if (searchQuery.trim() !== "") {
      return course.title.toLowerCase().includes(searchQuery.toLowerCase());
    }

    const cat = course.category === "Databases" ? "Database" : course.category;
    const matchesCategory =
      filters.category.length === 0 || filters.category.includes(cat);
    const matchesLevel =
      filters.level.length === 0 || filters.level.includes(course.level);

    const isFree =
      course.priceValue === 0 ||
      course.price === "₹0" ||
      course.price === "Free" ||
      !course.price;
    const type = isFree ? "Free" : "Paid";
    const matchesPrice =
      filters.price.length === 0 || filters.price.includes(type);

    return matchesCategory && matchesLevel && matchesPrice;
  });

   // Filter and sort My Courses
  const filteredMyCourses = useMemo(() => {
    const filtered = myCourses.filter((course) => {
      // 1. Search by course title
      const query = myCoursesSearch.trim().toLowerCase();

      const matchesSearch =
        !query ||
        String(course.title || "").toLowerCase().includes(query);

      // 2. Apply existing category filter
      const category =
        course.category === "Databases" ? "Database" : course.category;

      const matchesCategory =
        filters.category.length === 0 ||
        filters.category.includes(category);

      // 3. Apply existing level filter
      const matchesLevel =
        filters.level.length === 0 ||
        filters.level.includes(course.level);

      // 4. Apply existing price filter
      const isFree =
        course.priceValue === 0 ||
        course.price === "₹0" ||
        course.price === "Free" ||
        !course.price;

      const priceType = isFree ? "Free" : "Paid";

      const matchesPrice =
        filters.price.length === 0 ||
        filters.price.includes(priceType);

      // 5. Get the user's progress for this course
      const purchasedEntry = user?.purchasedCourses?.find((entry) =>
        courseIdMatches(entry, course.id),
      );

      const progress = purchasedEntry?.progress || course.progress || {};

      const completedLessons = Array.isArray(progress.completedLessons)
        ? progress.completedLessons
        : [];

      const hasStarted =
        completedLessons.length > 0 ||
        progress.currentLesson != null ||
        Number(progress.progressPercentage || progress.progress || 0) > 0;

      // Determine whether the course is completed
      const totalLessons =
        Number(course.lessonsCount) ||
        Number(course.lessonCount) ||
        (Array.isArray(course.lessons)
          ? course.lessons.length
          : Number(course.lessons) || 0);

      const isCompleted =
        progress.isCompleted === true ||
        progress.completed === true ||
        (totalLessons > 0 &&
          completedLessons.length >= totalLessons);

      // 6. Apply the selected status tab
      const matchesStatus =
        courseStatusTab === "all" ||
        (courseStatusTab === "in-progress" &&
          hasStarted &&
          !isCompleted) ||
        (courseStatusTab === "completed" && isCompleted) ||
        (courseStatusTab === "not-started" &&
          !hasStarted &&
          !isCompleted);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesLevel &&
        matchesPrice &&
        matchesStatus
      );
    });

    // 7. Apply sorting
    if (courseSortBy === "title") {
      filtered.sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || "")),
      );
    } else {
      // Sort by date only when date information is available
      const getCourseDate = (course) =>
        course.enrolledAt ||
        course.purchasedAt ||
        course.createdAt ||
        course.updatedAt ||
        null;

      if (filtered.every((course) => getCourseDate(course))) {
        filtered.sort(
          (a, b) =>
            new Date(getCourseDate(b)).getTime() -
            new Date(getCourseDate(a)).getTime(),
        );
      }
      // Otherwise, retain the order returned by the API.
    }

    return filtered;
  }, [
    myCourses,
    myCoursesSearch,
    courseStatusTab,
    courseSortBy,
    filters,
    user,
  ]);

  if (loading) {
    return (
      <main className="flex-1 p-4 md:p-6 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-muted">{t("courses.loading")}</p>
        </div>
      </main>
    );
  }
  return (
    <>
      <Helmet>
        <title>Courses | UptoSkills</title>
        <meta
          name="description"
          content="Manage enrolled courses and discover new learning opportunities on UptoSkills."
        />
      </Helmet>

      <main className="courses-modern-page min-h-full bg-canvas-alt pb-24">
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-bold text-[#3867D6]">
                  <Sparkles className="h-3.5 w-3.5" /> Your learning space
                </span>
                <h1 className="text-3xl font-extrabold tracking-tight text-main sm:text-4xl">
                  Keep learning, {user?.firstName || user?.name?.split(" ")[0] || "Learner"}
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
                  Continue enrolled courses, monitor activity, or discover the next skill to add to
                  your journey.
                </p>
              </div>
              <button type="button" onClick={() => setActiveTab("explore")} className={BLUE_BUTTON}>
                Explore courses <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Enrolled", myCourses.length, GraduationCap],
                ["In progress", startedCount, Play],
                ["Ready to start", Math.max(0, myCourses.length - startedCount), BookOpen],
                ["Visible results", displayedCourses.length, LayoutGrid],
              ].map(([label, value, StatIcon]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border bg-canvas px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-[#3867D6]">
                      {React.createElement(StatIcon, { className: "h-5 w-5" })}
                    </span>
                    <div>
                      <p className="text-xl font-extrabold text-main">{value}</p>
                      <p className="text-xs font-semibold text-muted">{label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
            <div className="flex rounded-xl bg-canvas-alt p-1">
              <button
                type="button"
                onClick={() => setActiveTab("my-courses")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition lg:flex-none ${activeTab === "my-courses" ? "bg-card text-[#3867D6] shadow-sm" : "text-muted hover:text-main"}`}
              >
                My Courses
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("explore")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition lg:flex-none ${activeTab === "explore" ? "bg-card text-[#3867D6] shadow-sm" : "text-muted hover:text-main"}`}
              >
                Explore
              </button>
            </div>

            <div className="relative min-w-0 flex-1 lg:max-w-lg">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search courses or skills"
                className="h-11 w-full rounded-xl border border-border bg-canvas pl-11 pr-4 text-sm text-main outline-none transition placeholder:text-muted focus:border-[#3867D6] focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

          
{/* ================= MY COURSES ================= */}
{activeTab === "my-courses" && (
  <div className="space-y-5">
    {/* My Courses Header and Toolbar */}
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
      
      {/* Title and Status Tabs */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <h2 className="shrink-0 text-xl font-bold text-slate-900 dark:text-white">
          My Courses
        </h2>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter courses by status"
        >
          {[
            { label: "All Courses", value: "all" },
            { label: "In Progress", value: "in-progress" },
            { label: "Completed", value: "completed" },
            { label: "Not Started", value: "not-started" },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setCourseStatusTab(tab.value)}
              aria-pressed={courseStatusTab === tab.value}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                courseStatusTab === tab.value
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Sort */}
      <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:shrink-0">
        <div className="relative min-w-0 flex-1 sm:min-w-[200px] lg:w-56 lg:flex-none">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />

          <input
            type="search"
            value={myCoursesSearch}
            onChange={(e) => setMyCoursesSearch(e.target.value)}
            placeholder="Search courses..."
            aria-label="Search My Courses"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
          />
        </div>

        <div className="relative shrink-0 sm:w-36">
          <SlidersHorizontal
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-300"
            aria-hidden="true"
          />

          <select
            value={courseSortBy}
            onChange={(e) => setCourseSortBy(e.target.value)}
            aria-label="Sort My Courses"
            className="w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-900"
          >
            <option value="latest">Latest</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>
    </div>

    {/* Existing My Courses Cards */}
    <div className="grid grid-cols-2 gap-4 auto-rows-fr md:grid-cols-3 lg:grid-cols-4">
      {myCourses.length === 0 && (
        <p className="col-span-full text-slate-500">
          {t("courses.not_enrolled")}
        </p>
      )}

      {myCourses.length > 0 && filteredMyCourses.length === 0 && (
        <p className="col-span-full text-slate-500">
          {t("courses.no_match_filters")}
        </p>
      )}

      {filteredMyCourses.map((course) => {
        const purchasedEntry = user?.purchasedCourses?.find((c) =>
          courseIdMatches(c, course.id),
        );

        const progress = purchasedEntry?.progress;

        const hasStarted =
          progress?.completedLessons?.length > 0 ||
          progress?.currentLesson != null;

        return (
          <div
            key={course.id}
            className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
          >
            <div className="relative h-32 sm:h-40">
              <img
                src={
                  course.title === "React Fundamentals"
                    ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals.png"
                    : course.title === "Python For AI"
                    ? "/AI_Tutor_New_UI/Dashboard/python_for_ai.png"
                    : course.title === "AI Ethics & Bias"
                    ? "/AI_Tutor_New_UI/Dashboard/ai_ethics_bias.png"
                    : course.title === "PostgreSQL"
                    ? "/AI_Tutor_New_UI/Dashboard/postgresql.png"
                    : course.title === "MongoDB Fundamentals"
                    ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                    : course.title === "Machine Learning Fundamentals" ||
                      course.title === "ML Fundamentals"
                    ? "/AI_Tutor_New_UI/Dashboard/ML_fundamentals.png"
                    : course.title === "Full Stack Web Development" ||
                      course.title === "Full Stack Web Dev"
                    ? "/AI_Tutor_New_UI/Dashboard/full_stack_web_dev.png"
                    : "/AI_Tutor_New_UI/Dashboard/logo.png"
                }
                className="h-full w-full object-cover"
                alt={course.title}
                loading="lazy"
              />
            </div>

            <div className="flex flex-1 flex-col justify-between p-3 sm:p-4">
              <div className="min-h-[72px] space-y-2">
                <h3 className="line-clamp-2 text-sm font-semibold text-main">
                  {course.title}
                </h3>

                <p className="text-xs text-muted">
                  {course.lessons} lessons • {course.level}
                </p>
              </div>

              <div className="mt-4">
                <button
                  onClick={() => navigate(`/learning/${course.id}`)}
                  className="w-full rounded-lg bg-[#2DD4BF] py-2 text-xs font-semibold text-white"
                >
                  {hasStarted
                    ? t("common.continue_learning")
                    : t("common.start_learning")}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}


          {/* ================= EXPLORE COURSES — Horizontal Scroll ================= */}
{activeTab === "explore" && (
  <div>
    {/* Explore Courses Header and Toolbar */}
    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-xl font-bold text-main">
        Explore Courses
      </h2>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        {/* Filters and Report Buttons */}
        <div ref={filterRef} className="relative flex gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-main hover:bg-muted"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters

            {getActiveFilterCount() > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                {getActiveFilterCount()}
              </span>
            )}

            <ChevronDown className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            aria-label="Report a problem"
            className="rounded-lg border border-border bg-card p-2 text-main hover:bg-muted"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>

          {/* Filter Dropdown */}
          {showFilters && (
            <>
              {/* Dark overlay for mobile */}
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] md:hidden"
                onClick={() => setShowFilters(false)}
              />

              {/* Form panel */}
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[26rem] md:absolute md:top-full md:left-auto md:right-0 md:translate-x-0 md:translate-y-0 md:mt-4 max-h-[85vh] overflow-y-auto bg-black/60 md:bg-black/40 backdrop-blur-3xl border border-teal-500/20 rounded-3xl shadow-[0_30px_60px_-15px_rgba(13,148,136,0.3)] p-6 z-[100] animate-in fade-in zoom-in-95 md:slide-in-from-top-6 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    {getActiveFilterCount() > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({
                            category: [],
                            level: [],
                            price: [],
                          })
                        }
                        className="text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-full"
                      >
                        {t("courses.clear_all")}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowFilters(false)}
                      aria-label="Close filters"
                      className="md:hidden p-2 text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Categories */}
                  <div>
                    <label className="block text-[10px] font-black text-teal-200/70 uppercase tracking-widest mb-4">
                      {t("courses.category")}
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({ ...filters, category: [] })
                        }
                        className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${
                          filters.category.length === 0
                            ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                            : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                        }`}
                      >
                        {t("courses.all_categories")}
                      </button>

                      {availableCategories
                        .filter((cat) => cat !== "All")
                        .map((cat) => (
                          <button
                            type="button"
                            key={cat}
                            onClick={() => toggleFilter("category", cat)}
                            className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${
                              filters.category.includes(cat)
                                ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                                : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Skill Level */}
                  <div>
                    <label className="block text-[10px] font-black text-teal-200/70 uppercase tracking-widest mb-4">
                      {t("courses.skill_level")}
                    </label>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({ ...filters, level: [] })
                        }
                        className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${
                          filters.level.length === 0
                            ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                            : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                        }`}
                      >
                        {t("courses.any_level")}
                      </button>

                      {availableLevels.map((lvl) => (
                        <button
                          type="button"
                          key={lvl}
                          onClick={() => toggleFilter("level", lvl)}
                          className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${
                            filters.level.includes(lvl)
                              ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                              : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div>
                    <label className="block text-[10px] font-black text-teal-200/70 uppercase tracking-widest mb-4">
                      {t("courses.pricing")}
                    </label>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({ ...filters, price: [] })
                        }
                        className={`flex-1 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${
                          filters.price.length === 0
                            ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                            : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                        }`}
                      >
                        {t("courses.any_price")}
                      </button>

                      {availablePrices.map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => toggleFilter("price", p)}
                          className={`flex-1 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${
                            filters.price.includes(p)
                              ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                              : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Apply Filters */}
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-teal-500/25 hover:scale-[1.02] transition-all"
                >
                  {t("courses.apply_filters")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Prev / Next Buttons */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={scrollLeft}
            aria-label="Scroll courses left"
            className="p-2 rounded-full bg-card border border-border hover:bg-teal-500/10 hover:border-teal-500/50 dark:hover:bg-teal-500/20 dark:hover:border-teal-500/40 transition-all shadow-sm"
          >
            <ChevronLeft className="w-5 h-5 text-main" />
          </button>

          <button
            type="button"
            onClick={scrollRight}
            aria-label="Scroll courses right"
            className="p-2 rounded-full bg-card border border-border hover:bg-teal-500/10 hover:border-teal-500/50 dark:hover:bg-teal-500/20 dark:hover:border-teal-500/40 transition-all shadow-sm"
          >
            <ChevronRight className="w-5 h-5 text-main" />
          </button>
        </div>
      </div>
    </div>

    {/* Horizontal Scroll Row */}
    <div
      ref={setScrollRef}
      tabIndex="0"
      className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4BF] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 rounded-3xl"
    >
      {allFilteredExploreCourses.length === 0 && (
        <p className="text-slate-500">{t("courses.no_courses")}</p>
      )}

      {allFilteredExploreCourses.map((course) => {
        const isEnrolled =
          myCourses.some((c) => courseIdMatches(c, course.id)) ||
          user?.purchasedCourses?.some((c) =>
            courseIdMatches(c, course.id)
          );

        return (
          <div
            key={course.id}
            className="min-w-[220px] sm:min-w-[260px] md:min-w-[280px] snap-start bg-card rounded-3xl border border-border overflow-hidden shadow-sm flex flex-col"
          >
            <div className="relative h-32 sm:h-40">
              <img
                src={
                  course.title === "React Fundamentals"
                    ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals.png"
                    : course.title === "Python For AI"
                    ? "/AI_Tutor_New_UI/Dashboard/python_for_ai.png"
                    : course.title === "AI Ethics & Bias"
                    ? "/AI_Tutor_New_UI/Dashboard/ai_ethics_bias.png"
                    : course.title === "PostgreSQL"
                    ? "/AI_Tutor_New_UI/Dashboard/postgresql.png"
                    : course.title === "MongoDB Fundamentals"
                    ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
                    : course.title === "Machine Learning Fundamentals" ||
                      course.title === "ML Fundamentals"
                    ? "/AI_Tutor_New_UI/Dashboard/ML_fundamentals.png"
                    : course.title === "Full Stack Web Development" ||
                      course.title === "Full Stack Web Dev"
                    ? "/AI_Tutor_New_UI/Dashboard/full_stack_web_dev.png"
                    : "/AI_Tutor_New_UI/Dashboard/logo.png"
                }
                className="w-full h-full object-cover"
                alt={course.title}
                loading="lazy"
              />

              <div className="absolute bottom-3 right-3 bg-white text-black px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1 shadow">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                {course.rating}
              </div>
            </div>

            <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between">
              <div className="space-y-2 min-h-[72px]">
                <h3 className="text-sm font-semibold text-main line-clamp-2">
                  {course.title}
                </h3>

                <p className="text-xs text-muted">
                  {course.lessons} lessons • {course.level}
                </p>
              </div>

              <div className="mt-4 flex justify-between items-center">
                <span className="font-bold text-green-600">
                  {course?.priceValue === 0
                    ? "Free"
                    : `₹${course?.priceValue || 0}`}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    if (!isEnrolled) {
                      setSelectedCourse(course);
                      setShowEnrollPopup(true);
                    }
                  }}
                  disabled={isEnrolled}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    isEnrolled
                      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                      : "bg-[#2DD4BF] text-white hover:bg-teal-500"
                  }`}
                >
                  {isEnrolled
                    ? t("courses.enrolled_short")
                    : t("common.enroll")}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}

        </div>
        <FloatingAssistant />
      </main>

      <ReportModal
        show={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReportSubmit}
        reportText={reportText}
        setReportText={setReportText}
        reportType={reportType}
        setReportType={setReportType}
        enrolledCourses={myCourses}
        subType={subType}
        setSubType={setSubType}
        selectedCourse={selectedCourse}
        setSelectedCourse={setSelectedCourse}
        loading={reportLoading}
      />

      {showEnrollPopup && selectedCourse && (
        <div
          className="fixed inset-0 z-[160] grid place-items-center bg-black/60 p-4 backdrop-blur-sm ui-overlay-motion"
          role="dialog"
          aria-modal="true"
          aria-label={`Enroll in ${selectedCourse.title}`}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-2xl ui-modal-surface">
            <div className="relative aspect-[16/7] overflow-hidden bg-canvas-alt">
              <img
                src={artworkFor(selectedCourse.title)}
                alt={selectedCourse.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <button
                type="button"
                onClick={() => setShowEnrollPopup(false)}
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl bg-black/55 text-white backdrop-blur"
                aria-label="Close enrollment"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3867D6]">
                {normalizeCategory(selectedCourse.category) || "Course"}
              </p>
              <h2 className="mt-2 text-2xl font-extrabold text-main">{selectedCourse.title}</h2>
              <p className="mt-2 text-sm text-muted">
                {selectedCourse.lessons || 0} lessons · {selectedCourse.level || "All levels"}
              </p>
              <div className="mt-6 flex items-center justify-between border-y border-border py-4">
                <span className="text-sm font-semibold text-muted">Enrollment price</span>
                <span
                  className={`text-xl font-extrabold ${isFreeCourse(selectedCourse) ? "text-emerald-500" : "text-main"}`}
                >
                  {isFreeCourse(selectedCourse) ? "Free" : `₹${selectedCourse.priceValue || 0}`}
                </span>
              </div>
              {isFreeCourse(selectedCourse) ? (
                <button
                  type="button"
                  onClick={handleFreeEnrollment}
                  disabled={isPurchasing}
                  className={`${BLUE_BUTTON} mt-6 w-full`}
                >
                  {isPurchasing ? "Processing..." : "Confirm enrollment"}
                </button>
              ) : (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleStripePayment}
                    disabled={isPurchasing}
                    className={BLUE_BUTTON}
                  >
                    {isPurchasing ? "Processing..." : "Pay with Stripe"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRazorpayPayment}
                    disabled={isPurchasing}
                    className={BLUE_BUTTON}
                  >
                    {isPurchasing ? "Processing..." : "Pay with Razorpay"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CoursesPage;
