import { apiFetch as fetch } from "../lib/api";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Clock3,
  Filter,
  GraduationCap,
  LayoutGrid,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import API_BASE_URL from "../lib/api";
import ReportModal from "../components/common/ReportModal";
import toast from "react-hot-toast";
import FloatingAssistant from "../components/common/FloatingAssistant";
import LoadingSpinner from "../components/common/LoadingSpinner";

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

const CourseCard = ({ course, enrolled, progress, onAction, actionLabel }) => {
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
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ category: [], level: [], price: [] });
  const [showEnrollPopup, setShowEnrollPopup] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
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

  const displayedCourses = activeTab === "my-courses" ? filteredMyCourses : filteredExploreCourses;

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

            <div ref={filterRef} className="relative flex gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((open) => !open)}
                className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${showFilters || activeFilterCount ? "border-[#3867D6] bg-blue-500/10 text-[#3867D6]" : "border-border bg-card text-main hover:border-[#3867D6]/50"}`}
                aria-expanded={showFilters}
                aria-controls="course-filter-panel"
              >
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#3867D6] px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 transition ${showFilters ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card text-muted transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500"
                aria-label="Report an issue"
              >
                <AlertTriangle className="h-4 w-4" />
              </button>

              {showFilters && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden ui-overlay-motion"
                    onClick={() => setShowFilters(false)}
                    aria-label="Close filters"
                  />
                  <aside
                    id="course-filter-panel"
                    className="fixed inset-x-3 bottom-3 z-50 max-h-[78dvh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl lg:absolute lg:inset-auto lg:right-0 lg:top-[calc(100%+0.75rem)] lg:w-[430px]"
                    aria-label="Course filters"
                    data-motion-surface
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <p className="text-base font-extrabold text-main">Filter courses</p>
                        <p className="mt-1 text-xs text-muted">
                          Narrow results without leaving the page.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas-alt hover:text-main"
                        aria-label="Close filters"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-5">
                      <div>
                        <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.13em] text-muted">
                          Category
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <FilterChoice
                            active={filters.category.length === 0}
                            onClick={() => setFilters((current) => ({ ...current, category: [] }))}
                          >
                            All
                          </FilterChoice>
                          {availableCategories.map((category) => (
                            <FilterChoice
                              key={category}
                              active={filters.category.includes(category)}
                              onClick={() => toggleFilter("category", category)}
                            >
                              {category}
                            </FilterChoice>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.13em] text-muted">
                          Level
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <FilterChoice
                            active={filters.level.length === 0}
                            onClick={() => setFilters((current) => ({ ...current, level: [] }))}
                          >
                            Any level
                          </FilterChoice>
                          {availableLevels.map((level) => (
                            <FilterChoice
                              key={level}
                              active={filters.level.includes(level)}
                              onClick={() => toggleFilter("level", level)}
                            >
                              {level}
                            </FilterChoice>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.13em] text-muted">
                          Pricing
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <FilterChoice
                            active={filters.price.length === 0}
                            onClick={() => setFilters((current) => ({ ...current, price: [] }))}
                          >
                            Any price
                          </FilterChoice>
                          {["Free", "Paid"].map((price) => (
                            <FilterChoice
                              key={price}
                              active={filters.price.includes(price)}
                              onClick={() => toggleFilter("price", price)}
                            >
                              {price}
                            </FilterChoice>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex gap-3 border-t border-border pt-4">
                      <button
                        type="button"
                        onClick={() => setFilters({ category: [], level: [], price: [] })}
                        className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-main hover:bg-canvas-alt"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        className={`${BLUE_BUTTON} flex-1`}
                      >
                        Apply
                      </button>
                    </div>
                  </aside>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-main">
                {activeTab === "my-courses" ? "Continue learning" : "Explore Courses"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {activeTab === "my-courses"
                  ? "Pick up where you left off."
                  : "Discover courses that match your next goal."}
              </p>
            </div>
            <span className="text-sm font-semibold text-muted">
              {displayedCourses.length} result{displayedCourses.length === 1 ? "" : "s"}
            </span>
          </div>

          {displayedCourses.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-[#3867D6]">
                <Filter className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-lg font-extrabold text-main">
                {myCourses.length === 0 && activeTab === "my-courses"
                  ? "Your learning journey starts here"
                  : "No courses match these controls"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                {myCourses.length === 0 && activeTab === "my-courses"
                  ? "Explore the catalog and enroll in a course to build your personal learning space."
                  : "Try clearing the search or resetting filters."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilters({ category: [], level: [], price: [] });
                  if (myCourses.length === 0) setActiveTab("explore");
                }}
                className={`${BLUE_BUTTON} mt-6`}
              >
                {myCourses.length === 0 && activeTab === "my-courses"
                  ? "Explore courses"
                  : "Clear controls"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),420px))] gap-5">
              {displayedCourses.map((course) => {
                const enrolled =
                  activeTab === "my-courses" ||
                  myCourses.some((item) => courseIdMatches(item, course.id)) ||
                  user?.purchasedCourses?.some((item) => courseIdMatches(item, course.id));
                const purchased = user?.purchasedCourses?.find((item) =>
                  courseIdMatches(item, course.id),
                );
                const started =
                  purchased?.progress?.completedLessons?.length > 0 ||
                  purchased?.progress?.currentLesson != null;
                return (
                  <CourseCard
                    key={course.id}
                    course={course}
                    enrolled={enrolled}
                    progress={purchased?.progress}
                    actionLabel={
                      enrolled
                        ? started
                          ? "Continue Learning"
                          : "Start Learning"
                        : "View enrollment"
                    }
                    onAction={() =>
                      enrolled
                        ? navigate(`/learning/${course.id}`)
                        : (setSelectedCourse(course), setShowEnrollPopup(true))
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

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
