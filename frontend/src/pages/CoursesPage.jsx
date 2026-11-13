<<<<<<< HEAD
import { apiFetch as fetch } from "../lib/api";
import React, { useEffect, useMemo, useRef, useState } from "react";
=======
import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from "react";
>>>>>>> 8194845 (fix: improve learner modal accessibility)
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
<<<<<<< HEAD
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
=======
import Modal from "../components/common/Modal";

const CoursesPage = () => {
    const enrollModalTitleId = useId();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("my-courses");
    const { user } = useAuth();
    const navigate = useNavigate();
    const scrollNodeRef = useRef(null);
    const dragData = useRef({
        isDown: false,
        startX: 0,
        scrollLeftVal: 0,
        hasMoved: false,
        wheelTimeout: null
    });

    /* ================= STATE ================= */
    const [exploreCourses, setExploreCourses] = useState([]);
    const [myCourses, setMyCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const [showReportModal, setShowReportModal] = useState(false);
    const [reportText, setReportText] = useState("");
    const [subType, setSubType] = useState("");
    const [reportType, setReportType] = useState("Select Issue Type");
    const [reportCourse, setReportCourse] = useState("");
    const [reportLoading, setReportLoading] = useState(false);

    const [filters, setFilters] = useState({ category: [], level: [], price: [] });
    const [showFilters, setShowFilters] = useState(false);

    const toggleFilter = (field, value) => {
        setFilters(prev => {
            const current = prev[field];
            if (current.includes(value)) {
                return { ...prev, [field]: current.filter(item => item !== value) };
            } else {
                return { ...prev, [field]: [...current, value] };
            }
        });
    };

    const getActiveFilterCount = () => {
        return filters.category.length + filters.level.length + filters.price.length;
    };

    const [showEnrollPopup, setShowEnrollPopup] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState(null);

    const courseIdMatches = (entry, targetId) => {
        if (!entry) return false;
        return String(entry?.id ?? entry?.courseId ?? entry?.course?.id) === String(targetId);
    };

    const filterRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (filterRef.current && !filterRef.current.contains(event.target)) {
                setShowFilters(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Extract unique filter options dynamically
    const availableCategories = ["All", ...new Set(exploreCourses.map(c => c.category === "Databases" ? "Database" : c.category).filter(Boolean))];
    const availableLevels = [...new Set(exploreCourses.map(c => c.level).filter(Boolean))];
    const availablePrices = [...new Set(exploreCourses.map(c => {
        const isFree = c.priceValue === 0 || c.price === "₹0" || c.price === "Free" || !c.price;
        return isFree ? "Free" : "Paid";
    }).filter(Boolean))];

    /* ================= FETCH COURSES ================= */
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const token = localStorage.getItem("token");

                const [exploreRes, myRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/courses`),
                    fetch(`${API_BASE_URL}/api/courses/my-courses`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                ]);

                const exploreData = await exploreRes.json();
                const myData = myRes.ok ? await myRes.json() : [];

                setExploreCourses(exploreData);
                setMyCourses(myData);
            } catch (error) {
                console.error("Error fetching courses:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCourses();
    }, []);

    // Listen for external refresh requests (e.g., after enrollment elsewhere)
    useEffect(() => {
        const refreshCourses = async () => {
            try {
                const token = localStorage.getItem("token");
                const [exploreRes, myRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/courses`),
                    fetch(`${API_BASE_URL}/api/courses/my-courses`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ]);
                const exploreData = await exploreRes.json();
                const myData = myRes.ok ? await myRes.json() : [];
                console.log('refreshCourses: updated myCourses length', myData?.length);
                setExploreCourses(exploreData);
                setMyCourses(myData);
            } catch (err) {
                console.error('refreshCourses error:', err);
            }
        };

        window.addEventListener('refreshCourses', refreshCourses);
        return () => window.removeEventListener('refreshCourses', refreshCourses);
    }, []);

    const location = useLocation();
    useEffect(() => {
        if (location?.state?.activeTab === "explore") {
            setActiveTab("explore");
        }
    }, [location]);

    /* ================= SCROLL HANDLERS ================= */
    const scrollLeft = () => {
        if (scrollNodeRef.current) {
            scrollNodeRef.current.scrollBy({ left: -320, behavior: "smooth" });
        }
    };

    const scrollRight = () => {
        if (scrollNodeRef.current) {
            scrollNodeRef.current.scrollBy({ left: 320, behavior: "smooth" });
        }
    };

    const handleMouseDown = useCallback((e) => {
        const el = scrollNodeRef.current;
        if (!el || e.button !== 0) return; // Only drag with left click

        dragData.current.isDown = true;
        dragData.current.hasMoved = false;
        el.style.scrollSnapType = "none"; // Temporarily disable snapping during drag
        el.style.cursor = "grabbing";
        dragData.current.startX = e.pageX - el.offsetLeft;
        dragData.current.scrollLeftVal = el.scrollLeft;
    }, []);

    const handleMouseLeave = useCallback(() => {
        const el = scrollNodeRef.current;
        if (!el) return;

        if (dragData.current.isDown) {
            el.style.scrollSnapType = "x mandatory";
        }
        dragData.current.isDown = false;
        el.style.cursor = "grab";
    }, []);

    const handleMouseUp = useCallback(() => {
        const el = scrollNodeRef.current;
        if (!el) return;

        if (dragData.current.isDown) {
            el.style.scrollSnapType = "x mandatory";
        }
        dragData.current.isDown = false;
        el.style.cursor = "grab";
    }, []);

    const handleMouseMove = useCallback((e) => {
        const el = scrollNodeRef.current;
        if (!el || !dragData.current.isDown) return;

        const x = e.pageX - el.offsetLeft;
        const walk = (x - dragData.current.startX) * 1.5; // Scroll speed factor
        if (Math.abs(x - dragData.current.startX) > 5) {
            dragData.current.hasMoved = true;
        }
        e.preventDefault();
        el.scrollLeft = dragData.current.scrollLeftVal - walk;
    }, []);

    const handleWheel = useCallback((e) => {
        const el = scrollNodeRef.current;
        if (!el) return;

        // Use deltaX if present (Shift+Scroll / trackpad swipe), otherwise deltaY
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        if (delta === 0) return;

        // Only intercept if we can scroll horizontally in the target direction
        const canScrollLeft = el.scrollLeft > 0;
        const canScrollRight = Math.ceil(el.scrollLeft) < el.scrollWidth - el.clientWidth;

        if ((delta < 0 && canScrollLeft) || (delta > 0 && canScrollRight)) {
            e.preventDefault();

            el.style.scrollSnapType = "none";
            el.scrollLeft += delta;

            if (dragData.current.wheelTimeout) {
                clearTimeout(dragData.current.wheelTimeout);
            }
            dragData.current.wheelTimeout = setTimeout(() => {
                if (scrollNodeRef.current) {
                    scrollNodeRef.current.style.scrollSnapType = "x mandatory";
                }
            }, 150);
        }
    }, []);

    const handleClick = useCallback((e) => {
        if (dragData.current.hasMoved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    // Callback ref to manage attaching/detaching listeners
    const setScrollRef = useCallback((node) => {
        if (scrollNodeRef.current) {
            const oldEl = scrollNodeRef.current;
            oldEl.removeEventListener("mousedown", handleMouseDown);
            oldEl.removeEventListener("mouseleave", handleMouseLeave);
            oldEl.removeEventListener("mouseup", handleMouseUp);
            oldEl.removeEventListener("mousemove", handleMouseMove);
            oldEl.removeEventListener("wheel", handleWheel);
            oldEl.removeEventListener("click", handleClick, true);
            if (dragData.current.wheelTimeout) {
                clearTimeout(dragData.current.wheelTimeout);
                dragData.current.wheelTimeout = null;
            }
        }

        scrollNodeRef.current = node;

        if (node) {
            node.addEventListener("mousedown", handleMouseDown);
            node.addEventListener("mouseleave", handleMouseLeave);
            node.addEventListener("mouseup", handleMouseUp);
            node.addEventListener("mousemove", handleMouseMove);
            node.addEventListener("wheel", handleWheel, { passive: false });
            node.addEventListener("click", handleClick, true);
            node.style.cursor = "grab";
        }
    }, [handleMouseDown, handleMouseLeave, handleMouseUp, handleMouseMove, handleWheel, handleClick]);

    // Global arrow key scroll handler for Explore Courses section
    useEffect(() => {
        if (activeTab !== "explore") return;

        const handleGlobalKeyDown = (e) => {
            const el = scrollNodeRef.current;
            if (!el) return;

            // Ignore keypress if focus is inside an input, textarea or editable field
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable)) {
                return;
            }

            if (e.key === "ArrowLeft") {
                e.preventDefault();
                el.style.scrollSnapType = "none";
                el.scrollBy({ left: -320, behavior: "smooth" });

                if (dragData.current.wheelTimeout) {
                    clearTimeout(dragData.current.wheelTimeout);
                }
                dragData.current.wheelTimeout = setTimeout(() => {
                    if (scrollNodeRef.current) {
                        scrollNodeRef.current.style.scrollSnapType = "x mandatory";
                    }
                }, 400);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                el.style.scrollSnapType = "none";
                el.scrollBy({ left: 320, behavior: "smooth" });

                if (dragData.current.wheelTimeout) {
                    clearTimeout(dragData.current.wheelTimeout);
                }
                dragData.current.wheelTimeout = setTimeout(() => {
                    if (scrollNodeRef.current) {
                        scrollNodeRef.current.style.scrollSnapType = "x mandatory";
                    }
                }, 400);
            }
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, [activeTab]);

    /* ================= ENROLL & PAYMENT ================= */
    const [isPurchasing, setIsPurchasing] = useState(false);

    const handleFreeEnrollment = async () => {
        if (!selectedCourse || isPurchasing) return;

        try {
            setIsPurchasing(true);
            const token = localStorage.getItem("token");

            await fetch(`${API_BASE_URL}/api/users/purchase-course`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    courseId: selectedCourse.id,
                    courseTitle: selectedCourse.title,
                }),
            });

            const [exploreRes, myRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/courses`),
                fetch(`${API_BASE_URL}/api/courses/my-courses`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ]);

            setExploreCourses(await exploreRes.json());
            setMyCourses(await myRes.json());

            setShowEnrollPopup(false);
            setSelectedCourse(null);
            setActiveTab("my-courses");
            toast.success("Successfully enrolled!");

            // Notify Header to refetch notifications
            window.dispatchEvent(new Event('refreshNotifications'));
        } catch (error) {
            console.error("Enroll error:", error);
            toast.error("Failed to enroll. Please try again.");
        } finally {
            setIsPurchasing(false);
        }
    };

    const handleStripePayment = async () => {
        if (!selectedCourse || isPurchasing) return;
        const token = localStorage.getItem("token");
        const priceValue = Number(selectedCourse.priceValue || 0);

        try {
            setIsPurchasing(true);
            const res = await fetch(`${API_BASE_URL}/api/payment/create-checkout-session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    course: {
                        id: selectedCourse.id,
                        title: selectedCourse.title,
                        priceValue,
                    },
                }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error("Payment failed");
            }
        } catch (err) {
            console.error(err);
            toast.error("Payment error");
            setIsPurchasing(false);
        }
    };

    const handleRazorpayPayment = async () => {
        if (!selectedCourse || isPurchasing) return;
        const token = localStorage.getItem("token");
        const priceValue = Number(selectedCourse.priceValue || 0);

        try {
            setIsPurchasing(true);
            const res = await fetch(`${API_BASE_URL}/api/payment/razorpay/create-order`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    course: {
                        id: selectedCourse.id,
                        priceValue,
                    },
                }),
            });
            const orderData = await res.json();

            if (!orderData.orderId) {
                throw new Error(orderData.error || "Failed to create order");
            }

            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID || "",
                amount: orderData.amount,
                currency: orderData.currency,
                name: "UpToSkills",
                description: selectedCourse.title,
                order_id: orderData.orderId,
                handler: async function (response) {
                    try {
                        const verifyRes = await fetch(`${API_BASE_URL}/api/payment/razorpay/verify`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                courseId: selectedCourse.id,
                                userId: user?.id,
                            }),
                        });

                        const verifyData = await verifyRes.json();
                        if (verifyData.success) {
                            toast.success("Payment successful!");
                            window.dispatchEvent(new Event("refreshNotifications"));

                            const [exploreRes, myRes] = await Promise.all([
                                fetch(`${API_BASE_URL}/api/courses`),
                                fetch(`${API_BASE_URL}/api/courses/my-courses`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                }),
                            ]);
                            setExploreCourses(await exploreRes.json());
                            setMyCourses(await myRes.json());

                            setShowEnrollPopup(false);
                            setSelectedCourse(null);
                            setActiveTab("my-courses");
                        } else {
                            throw new Error(verifyData.error || "Payment verification failed");
                        }
                    } catch (err) {
                        console.error("Verification error:", err);
                        toast.error(err.message || "Payment verification failed");
                    }
                },
                prefill: {
                    name: user?.name || user?.firstName || "",
                    email: user?.email || "",
                    contact: user?.phone || "9999999999",
                },
                theme: {
                    color: "#0f766e",
                },
            };

            const rzp = new window.Razorpay(options);
            rzp.on("payment.failed", function (response) {
                toast.error("Payment failed: " + response.error.description);
            });
            rzp.open();

        } catch (err) {
            console.error(err);
            toast.error(err.message || "Payment error");
        } finally {
            setIsPurchasing(false);
        }
    };

    /* ================= REPORT ================= */
    const handleReportSubmit = async () => {
        try {
            setReportLoading(true);
            const res = await fetch("http://localhost:5000/api/course-reports", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${user?.token}`,
                },
                body: JSON.stringify({
                    reportType,
                    subType,
                    description: reportText,
                    courseName: selectedCourse || "General",
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || "Failed to submit report");
            }

            setShowReportModal(false);
            setReportText("");
            setReportType("");
            setSubType("");
            setSelectedCourse("");

        } catch (err) {
            console.error(err);
        } finally {
            setReportLoading(false);
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-canvas-alt flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-main mb-4">Please Login</h1>
                    <p className="text-muted">
                        You need to be logged in to access the courses page.
                    </p>
                </div>
            </div>
        );
    }

    const filteredExploreCourses = exploreCourses
        .filter((course) =>
            !myCourses.some((c) => courseIdMatches(c, course.id))
        )
        .filter((course) => {
            if (searchQuery.trim() !== "") {
                return course.title.toLowerCase().includes(searchQuery.toLowerCase());
            }

            const cat = course.category === "Databases" ? "Database" : course.category;
            const matchesCategory = filters.category.length === 0 || filters.category.includes(cat);
            const matchesLevel = filters.level.length === 0 || filters.level.includes(course.level);

            const isFree = course.priceValue === 0 || course.price === "₹0" || course.price === "Free" || !course.price;
            const type = isFree ? "Free" : "Paid";
            const matchesPrice = filters.price.length === 0 || filters.price.includes(type);

            return matchesCategory && matchesLevel && matchesPrice;
        });

    // Same filters as filteredExploreCourses but WITHOUT the enrollment exclusion,
    // so enrolled cards stay visible with the "Enrolled" button state.
    const allFilteredExploreCourses = exploreCourses
        .filter((course) => {
            if (searchQuery.trim() !== "") {
                return course.title.toLowerCase().includes(searchQuery.toLowerCase());
            }

            const cat = course.category === "Databases" ? "Database" : course.category;
            const matchesCategory = filters.category.length === 0 || filters.category.includes(cat);
            const matchesLevel = filters.level.length === 0 || filters.level.includes(course.level);

            const isFree = course.priceValue === 0 || course.price === "₹0" || course.price === "Free" || !course.price;
            const type = isFree ? "Free" : "Paid";
            const matchesPrice = filters.price.length === 0 || filters.price.includes(type);

            return matchesCategory && matchesLevel && matchesPrice;
        });

    const filteredMyCourses = myCourses
        .filter((course) => {
            if (searchQuery.trim() !== "") {
                return course.title.toLowerCase().includes(searchQuery.toLowerCase());
            }

            const cat = course.category === "Databases" ? "Database" : course.category;
            const matchesCategory = filters.category.length === 0 || filters.category.includes(cat);
            const matchesLevel = filters.level.length === 0 || filters.level.includes(course.level);

            const isFree = course.priceValue === 0 || course.price === "₹0" || course.price === "Free" || !course.price;
            const type = isFree ? "Free" : "Paid";
            const matchesPrice = filters.price.length === 0 || filters.price.includes(type);

            return matchesCategory && matchesLevel && matchesPrice;
        });

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
                content="Browse and enroll in top online courses on UptoSkills. Learn React, Web Development, Databases and more." 
            />
            <meta property="og:title" content="Courses | UptoSkills" />
            <meta 
                property="og:description" 
                content="Browse and enroll in top online courses on UptoSkills." 
            />
            <meta property="og:type" content="website" />
            </Helmet>

            {/* ══════ HERO ══════ */}
            <div className="relative bg-gradient-to-br from-teal-700 via-teal-600 to-teal-800 pt-10 sm:pt-12 lg:pt-16 pb-8 sm:pb-10 lg:pb-12 px-4 sm:px-6 lg:px-8">
                <div
                    className="absolute inset-0 opacity-10"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
                <div className="relative z-10 max-w-5xl mx-auto space-y-6">
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 text-center sm:text-left">
                        <img
                            src={user?.avatar_url || (user?.isGoogleUser || !!user?.googleId
                                ? `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(user?.name || user?.email?.split('@')[0] || 'User')}`
                                : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E`
                            )}
                            alt="Profile"
                            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full border-3 border-white/80 object-cover shadow-lg ${!user?.avatar_url && !(user?.isGoogleUser || !!user?.googleId) ? 'p-2 sm:p-3 bg-white/20' : ''}`}
                            onError={(e) => {
                                const isGoogle = user?.isGoogleUser || !!user?.googleId;
                                const fallback = isGoogle
                                    ? `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(user?.name || user?.email?.split('@')[0] || 'User')}`
                                    : `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E`;
                                e.target.src = fallback;
                                if (!isGoogle) e.target.className += " p-3 bg-white/20";
                            }}
                        />
                        <div>
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">
                                {user?.name || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email?.split('@')[0] || 'User')}
                            </h1>
                            <p className="text-teal-100 text-sm sm:text-base mt-1">
                                {t("courses.subtitle")}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative w-full z-40">
                        {/* Top Row / Left Section */}
                        <div className="flex items-center justify-between gap-2.5 w-full md:w-auto">

                            {/* Scrollable Tabs */}
                            <div className="courses-tabs-scroll-container flex justify-between items-center gap-2 sm:gap-3 flex-nowrap overflow-x-auto pb-1 sm:pb-0 scroll-smooth flex-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                                <style>{`.courses-tabs-scroll-container::-webkit-scrollbar { display: none; }`}</style>
                                <button
                                    onClick={() => setActiveTab("my-courses")}
                                    className={`flex-1 basis-0 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2.5 rounded-full font-semibold text-xs sm:text-sm transition-all ${activeTab === "my-courses"
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                                        : "bg-black/30 text-white hover:bg-black/40"
                                        }`}
                                >
                                    <BookOpen className="w-4 h-4 shrink-0 hidden sm:block" />
                                    <span className="hidden sm:inline truncate">{t("courses.enrolled_courses")}</span>
                                    <span className="sm:hidden truncate">{t("courses.enrolled_short")}</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab("explore")}
                                    className={`flex-1 basis-0 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2.5 rounded-full font-semibold text-xs sm:text-sm transition-all ${activeTab === "explore"
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                                        : "bg-black/30 text-white hover:bg-black/40"
                                        }`}
                                >
                                    <Search className="w-4 h-4 shrink-0 hidden sm:block" />
                                    <span className="hidden sm:inline truncate">{t("courses.explore")}</span>
                                    <span className="sm:hidden truncate">{t("courses.explore_short")}</span>
                                </button>
                            </div>

                            {/* Action Icons (Filter) */}
                            <div className="flex items-center flex-shrink-0 relative">

                                {/* Filter Icon & Dropdown */}
                                <div ref={filterRef}>
                                    <button
                                        onClick={() => setShowFilters(!showFilters)}
                                        className={`relative flex items-center justify-center flex-shrink-0 w-10 h-10 sm:w-auto sm:px-5 sm:py-2.5 rounded-full border text-sm font-semibold transition-all duration-300 shadow-xl ${showFilters || getActiveFilterCount() > 0
                                            ? "bg-gradient-to-r from-teal-500/80 to-cyan-500/80 border-transparent text-white shadow-teal-500/20"
                                            : "bg-black/40 border-white/20 text-white hover:bg-black/60 hover:border-white/40 backdrop-blur-md"
                                            }`}
                                    >
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                                        <span className="hidden sm:inline ml-2">{t("courses.filters")}</span>
                                        {getActiveFilterCount() > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 sm:static sm:ml-1.5 bg-white text-teal-700 text-[11px] leading-none rounded-full w-5 h-5 flex items-center justify-center font-black shadow-md border-2 border-teal-700 z-10">
                                                {getActiveFilterCount()}
                                            </span>
                                        )}
                                    </button>

                                    {/* Filter Panel */}
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
                                                                onClick={() => setFilters({ category: [], level: [], price: [] })}
                                                                className="text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-full"
                                                            >
                                                                {t("courses.clear_all")}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => setShowFilters(false)}
                                                            className="md:hidden p-2 text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    {/* Categories */}
                                                    <div>
                                                        <label className="block text-[10px] font-black text-teal-200/70 uppercase tracking-widest mb-4">{t("courses.category")}</label>
                                                        <div className="flex flex-wrap gap-3">
                                                            <button
                                                                onClick={() => setFilters({ ...filters, category: [] })}
                                                                className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${filters.category.length === 0
                                                                    ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                                                                    : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                                                                    }`}
                                                            >
                                                                {t("courses.all_categories")}
                                                            </button>
                                                            {availableCategories.filter(cat => cat !== "All").map(cat => (
                                                                <button
                                                                    key={cat}
                                                                    onClick={() => toggleFilter("category", cat)}
                                                                    className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${filters.category.includes(cat)
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
                                                        <label className="block text-[10px] font-black text-teal-200/70 uppercase tracking-widest mb-4">{t("courses.skill_level")}</label>
                                                        <div className="flex flex-wrap gap-3">
                                                            <button
                                                                onClick={() => setFilters({ ...filters, level: [] })}
                                                                className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${filters.level.length === 0
                                                                    ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                                                                    : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                                                                    }`}
                                                            >
                                                                {t("courses.any_level")}
                                                            </button>
                                                            {availableLevels.map(lvl => (
                                                                <button
                                                                    key={lvl}
                                                                    onClick={() => toggleFilter("level", lvl)}
                                                                    className={`px-4 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${filters.level.includes(lvl)
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
                                                        <label className="block text-[10px] font-black text-teal-200/70 uppercase tracking-widest mb-4">{t("courses.pricing")}</label>
                                                        <div className="flex gap-3">
                                                            <button
                                                                onClick={() => setFilters({ ...filters, price: [] })}
                                                                className={`flex-1 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${filters.price.length === 0
                                                                    ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 scale-[1.03]"
                                                                    : "bg-teal-900/30 text-teal-100 hover:bg-teal-500/20 border border-teal-500/30"
                                                                    }`}
                                                            >
                                                                {t("courses.any_price")}
                                                            </button>
                                                            {availablePrices.map(p => (
                                                                <button
                                                                    key={p}
                                                                    onClick={() => toggleFilter("price", p)}
                                                                    className={`flex-1 py-2 text-xs rounded-xl font-bold transition-all duration-300 ${filters.price.includes(p)
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

                                                {/* Apply Filters Button (Mobile Friendly UX) */}
                                                <button
                                                    onClick={() => setShowFilters(false)}
                                                    className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-teal-500/25 hover:scale-[1.02] transition-all"
                                                >
                                                    {t("courses.apply_filters")}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Bottom Row / Search Container (Permanently shown on second row) */}
                        <div className="flex items-center gap-2 ml-auto">
                            <div className="relative w-52 md:w-60">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-teal-300 transition-colors w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder={t("header.search_placeholder")}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-black/30 border border-white/20 rounded-full text-sm text-white placeholder-white/50 focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-all outline-none shadow-inner"
                                />
                            </div>
                        </div>
                        {/* 🚨 Report Button */}
                        <div className="relative group flex items-center">
                            <button
                                onClick={() => setShowReportModal(true)}
                                className="w-10 h-10 grid place-items-center rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all"
                            >
                                <AlertTriangle className="w-5 h-5" />
                            </button>

                            {/* Tooltip */}
                            <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs bg-black text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition duration-200 z-50">
                                Report Issue
                            </span>
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
                        </div>

                    </div>
                </div>
            </div>

            <main className="flex-1 p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto space-y-10">

                    {/* ================= MY COURSES ================= */}
                    {activeTab === "my-courses" && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-4 auto-rows-fr
">




                            {myCourses.length === 0 && (
                                <p className="text-slate-500">
                                    {t("courses.not_enrolled")}
                                </p>
                            )}
                            {myCourses.length > 0 && filteredMyCourses.length === 0 && (
                                <p className="text-slate-500 col-span-full">
                                    {t("courses.no_match_filters")}
                                </p>
                            )}

                            {filteredMyCourses.map((course) => {
                                const purchasedEntry = user?.purchasedCourses?.find(
                                    (c) => courseIdMatches(c, course.id)
                                );
                                const progress = purchasedEntry?.progress;
                                const hasStarted =
                                    (progress?.completedLessons?.length > 0) ||
                                    (progress?.currentLesson != null);

                                return (
                                    <div
                                        key={course.id}
                                        className="
    bg-card rounded-3xl border border-border overflow-hidden shadow-sm 
    flex flex-col h-full
   w-full
  "
                                    >

                                        <div className="relative h-32 sm:h-40">

                                            <img
    src={
        course.title === "React Fundamentals"
            ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
            : course.title === "Python For AI"
            ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
            : course.title === "AI Ethics & Bias"
            ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
            : course.title === "MongoDB Fundamentals"
            ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
            : "/AI_Tutor_New_UI/Dashboard/logo.png"
    }
    className="w-full h-full object-cover"
    alt={course.title}
    loading="lazy"
/>
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

                                            <div className="mt-4">
                                                <button
                                                    onClick={() => navigate(`/learning/${course.id}`)}
                                                    className="w-full py-2 rounded-lg bg-[#2DD4BF] text-white text-xs font-semibold"
                                                >
                                                    {hasStarted ? t("common.continue_learning") : t("common.start_learning")}
                                                </button>
                                            </div>

                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ================= EXPLORE COURSES — Horizontal Scroll ================= */}
                    {activeTab === "explore" && (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-main">Explore Courses</h2>
                                {/* Prev / Next Buttons */}
                                <div className="flex items-center gap-2 md:hidden">

                                    <button
                                        onClick={scrollLeft}
                                        className="p-2 rounded-full bg-card border border-border hover:bg-teal-500/10 hover:border-teal-500/50 dark:hover:bg-teal-500/20 dark:hover:border-teal-500/40 transition-all shadow-sm"
                                    >
                                        <ChevronLeft className="w-5 h-5 text-main" />
                                    </button>
                                    <button
                                        onClick={scrollRight}
                                        className="p-2 rounded-full bg-card border border-border hover:bg-teal-500/10 hover:border-teal-500/50 dark:hover:bg-teal-500/20 dark:hover:border-teal-500/40 transition-all shadow-sm"
                                    >
                                        <ChevronRight className="w-5 h-5 text-main" />
                                    </button>
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
                                                                user?.purchasedCourses?.some((c) => courseIdMatches(c, course.id));
                                    return (
                                    <div
                                        key={course.id}
                                        className="
      min-w-[220px] sm:min-w-[260px] md:min-w-[280px]
    snap-start
    bg-card rounded-3xl border border-border overflow-hidden shadow-sm
    flex flex-col
"




                                    >
                                        <div className="relative h-32 sm:h-40">

                                          <img
    src={
        course.title === "React Fundamentals"
            ? "/AI_Tutor_New_UI/Dashboard/react_fundamentals_logo.png"
            : course.title === "Python For AI"
            ? "/AI_Tutor_New_UI/Dashboard/python_for_ai_logo.png"
            : course.title === "AI Ethics & Bias"
            ? "/AI_Tutor_New_UI/Dashboard/data_analytics.png"
            : course.title === "MongoDB Fundamentals"
            ? "/AI_Tutor_New_UI/Dashboard/MongoDB.png"
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


                                            {/* Top content (same as My Courses) */}
                                            <div className="space-y-2 min-h-[72px]">
                                                <h3 className="text-sm font-semibold text-main line-clamp-2">
                                                    {course.title}
                                                </h3>

                                                <p className="text-xs text-muted">
                                                    {course.lessons} lessons • {course.level}
                                                </p>
                                            </div>

                                            {/* Bottom content */}
                                            <div className="mt-4 flex justify-between items-center">
                                                <span className="font-bold text-green-600">
                                                    {course?.priceValue === 0
                                                        ? "Free"
                                                        : `₹${course?.priceValue || 0}`}
                                                </span>

                                                <button
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
                                                    {isEnrolled ? t("courses.enrolled_short") : t("common.enroll")}
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

            {/* ================= ENROLL POPUP ================= */}
            <Modal
                open={showEnrollPopup && Boolean(selectedCourse)}
                onClose={() => setShowEnrollPopup(false)}
                labelledBy={enrollModalTitleId}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            >
                {selectedCourse && (
                    <div className="bg-white w-full max-w-md rounded-2xl p-4 sm:p-6 relative mx-4">
                        <button
                            autoFocus
                            onClick={() => setShowEnrollPopup(false)}
                            aria-label="Close enrollment dialog"
                            className="absolute top-4 right-4"
                        >
                            <X />
                        </button>
                        <img
                            src={selectedCourse.image}
                            alt={selectedCourse.title}
                            className="w-full h-40 object-cover rounded-xl mb-4"
                            loading="lazy"
                        />
                        <h2 id={enrollModalTitleId} className="text-xl font-bold">{selectedCourse.title}</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            {selectedCourse.category} • {selectedCourse.level}
                        </p>
                        <div className="flex justify-between items-center mt-4">
                            <span className="text-lg font-bold text-green-600">
                                {selectedCourse.priceValue > 0 ? `₹${selectedCourse.priceValue}` : "Free"}
                            </span>
                        </div>
                        {Number(selectedCourse.priceValue) > 0 ? (
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleStripePayment}
                                    disabled={isPurchasing}
                                    className="w-1/2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50 transition-colors"
                                >
                                    {isPurchasing ? "Processing..." : "Pay with Stripe"}
                                </button>
                                <button
                                    onClick={handleRazorpayPayment}
                                    disabled={isPurchasing}
                                    className="w-1/2 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold disabled:opacity-50 transition-colors"
                                >
                                    {isPurchasing ? "Processing..." : "Pay with Razorpay"}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleFreeEnrollment}
                                disabled={isPurchasing}
                                className="w-full mt-6 py-3 rounded-xl bg-[#2DD4BF] text-white font-semibold disabled:opacity-50"
                            >
                                {isPurchasing ? "Processing..." : t("courses.confirm_enrollment")}
                            </button>
                        )}
                    </div>
                )}
            </Modal>
        </>    
    );
>>>>>>> 8194845 (fix: improve learner modal accessibility)
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
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(`${API_BASE_URL}/api/payment/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course: {
            id: selectedCourse.id,
            title: selectedCourse.title,
            priceValue: Number(selectedCourse.priceValue || 0),
          },
          idempotencyKey,
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
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(`${API_BASE_URL}/api/payment/razorpay/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          course: { id: selectedCourse.id, priceValue: Number(selectedCourse.priceValue || 0) },
          idempotencyKey,
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
            <div className="col-span-full flex w-full justify-center px-3 py-10 sm:px-6 sm:py-14">
              <div className="flex w-full max-w-2xl flex-col items-center rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center shadow-sm sm:px-10 sm:py-10">
                {myCourses.length === 0 && activeTab === "my-courses" ? (
                  <>
                    <svg
                      viewBox="0 0 240 180"
                      className="mb-5 h-36 w-48 sm:h-44 sm:w-56"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      role="img"
                      aria-label="Books and graduation cap"
                    >
                      <path
                        d="M48 132L120 153L192 132"
                        stroke="#CBD5E1"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M58 92L109 78V132L58 145Z"
                        fill="#60A5FA"
                        stroke="#2563EB"
                        strokeWidth="2"
                      />
                      <path
                        d="M109 78L157 92V145L109 132Z"
                        fill="#2563EB"
                        stroke="#1D4ED8"
                        strokeWidth="2"
                      />
                      <path
                        d="M69 102L98 94M69 113L98 105M69 124L98 116"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M119 91L146 99M119 103L146 111M119 115L146 123"
                        stroke="#DBEAFE"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <path d="M83 67L126 53L171 68L128 84Z" fill="#1E3A8A" />
                      <path d="M128 84V95" stroke="#1E3A8A" strokeWidth="4" strokeLinecap="round" />
                      <path d="M171 68V87" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
                      <circle cx="171" cy="91" r="4" fill="#F59E0B" />
                      <path d="M42 65L46 75L56 79L46 83L42 93L38 83L28 79L38 75Z" fill="#FBBF24" />
                      <path
                        d="M190 42L193 50L201 53L193 56L190 64L187 56L179 53L187 50Z"
                        fill="#FBBF24"
                      />
                      <path
                        d="M202 102L205 109L212 112L205 115L202 122L199 115L192 112L199 109Z"
                        fill="#93C5FD"
                      />
                      <circle cx="63" cy="49" r="3" fill="#60A5FA" />
                      <circle cx="182" cy="79" r="3" fill="#60A5FA" />
                    </svg>
                    <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">
                      You haven't enrolled in any courses yet.
                    </h3>
                    <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500 sm:text-base">
                      Explore our wide range of courses and start your learning journey today.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("explore")}
                      className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Browse Courses →
                    </button>
                  </>
                ) : (
                  <>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/10 text-[#3867D6]">
                      <Filter className="h-6 w-6" />
                    </span>
                    <h3 className="mt-5 text-lg font-extrabold text-main">
                      No courses match these controls
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                      Try clearing the search or resetting filters.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setFilters({ category: [], level: [], price: [] });
                      }}
                      className={`${BLUE_BUTTON} mt-6`}
                    >
                      Clear controls
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div
              className={
                activeTab === "my-courses"
                  ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
                  : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),420px))] gap-5"
              }
            >
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
                return activeTab === "my-courses" ? (
                  <CourseCard key={course.id} course={course} progress={purchased?.progress} />
                ) : (
                  <ExploreCourseCard
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
