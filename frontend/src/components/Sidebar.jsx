import { apiFetch as fetch } from "../lib/api";
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ChevronRight,
  LogOut,
  Settings,
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  BarChart3,
  Video,
  Award,
  Flag,
  CircleHelp,
} from "lucide-react";
import API_BASE_URL from "../lib/api";
import { useSidebar } from "../context/SidebarContext";
import { useTranslation } from "react-i18next";

const Sidebar = ({ activePage = "dashboard" }) => {
  const { t } = useTranslation();

  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed } =
    useSidebar();

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [navigationItems, setNavigationItems] = useState([]);
  const [profilePopupOpen, setProfilePopupOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const profileRef = useRef(null);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    logout();
    setShowLogoutConfirm(false);
    setProfilePopupOpen(false);
    navigate("/login", { state: { logoutSuccess: true } });
  };

  const displayName = user?.name || user?.email?.split("@")[0] || "User";

  const iconMap = {
    dashboard: LayoutDashboard,
    my_courses: BookOpen,
    "my-courses": BookOpen,
    courses: BookOpen,
    discussion: MessageSquare,
    analytics: BarChart3,
    settings: Settings,
    watched_videos: Video,
    "watched-videos": Video,
    certificates: Award,
    report: Flag,
  };

  // Close profile popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfilePopupOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch navigation items
  useEffect(() => {
    let isMounted = true;

    const fetchNavigationItems = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) return;

        const response = await fetch(`${API_BASE_URL}/api/sidebar/navigation`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) return;

        const data = await response.json();

        if (isMounted) {
          setNavigationItems(data);
        }
      } catch (error) {
        console.error("Error:", error);
      }
    };

    fetchNavigationItems();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNavigation = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <>
      {/* ================= MOBILE OVERLAY ================= */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ================= LOGOUT CONFIRMATION ================= */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-card border border-border/50 rounded-2xl shadow-2xl p-6 w-full max-w-xs text-center">
            <LogOut className="w-9 h-9 text-red-500 mx-auto mb-3" />

            <h3 className="text-sm font-bold text-main mb-2">Logout</h3>

            <p className="text-xs text-muted mb-5">
              Are you sure you want to logout?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-3 rounded-lg text-xs font-semibold border border-border hover:bg-canvas-alt transition-all"
              >
                Cancel
              </button>

              <button
                onClick={confirmLogout}
                className="flex-1 py-3 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SIDEBAR ================= */}
      <aside
        className={`
          fixed
          top-0
          left-0
          z-[105]
          h-[100dvh]
          flex
          flex-col
          bg-card/70 backdrop-blur-xl
          border-r
          border-border/80
          transition-all
          duration-300
          ease-out

          ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }

          ${sidebarCollapsed ? "lg:w-[72px]" : "w-[245px] lg:w-[245px]"}
        `}
      >
        {/* ================= COLLAPSE BUTTON ================= */}
        {/* ================= COLLAPSE BUTTON ================= */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`
    fixed
    top-[64px]
    z-[110]
    hidden
    h-8
    w-8
    -translate-x-1/2
    cursor-pointer
    items-center
    justify-center
    rounded-full
    border
    border-border/80
    bg-card
    shadow-md
    transition-[left,background-color,border-color]
    duration-300
    hover:border-[#2f5cc4]
    hover:bg-[#2f5cc4]
    lg:flex
    group
    ${sidebarCollapsed ? "left-[72px]" : "left-[245px]"}
  `}
          aria-label="Toggle sidebar"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-500 group-hover:text-white ${
              sidebarCollapsed ? "" : "rotate-180"
            }`}
          />
        </button>

        {/* --- LOGO SECTION --- */}
        <div
          className={`pt-5 px-3 pb-2 transition-all duration-300 ${sidebarCollapsed ? "flex justify-center" : ""}`}
        >
          <div
            className={`border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center bg-card shadow-sm w-full ${sidebarCollapsed ? "hidden" : "flex"}`}
          >
            <img
              src="/upto.png"
              alt="UptoSkills Logo"
              className="h-8 mb-2 object-contain"
            />
            <h2 className="text-[1.2rem] font-bold text-slate-900 dark:text-white tracking-wide">
              AI Mentor
            </h2>
            <p className="text-[11px] text-muted-foreground mt-1 tracking-wide">
              Learn · Build · Grow
            </p>
          </div>
          {/* Logo when collapsed */}
          {sidebarCollapsed && (
            <div className="w-12 h-12 bg-card border border-border/50 rounded-xl flex items-center justify-center shadow-sm">
              <img src="/upto.png" alt="Logo" className="h-6 object-contain" />
            </div>
          )}
        </div>

        {/* ================= MAIN NAVIGATION ================= */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4">
          <div className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = activePage === item.id;
              const Icon = iconMap[item.id] || LayoutDashboard;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path)}
                  className={`
                    group
                    relative
                    w-full
                    flex
                    items-center
                    ${sidebarCollapsed ? "justify-center" : "justify-start"}
                    gap-3
                    px-3
                    py-3
                    rounded-lg
                    cursor-pointer
                    transition-all
                    duration-200

                    ${
                      isActive
                        ? "bg-[#2f5cc4] text-white shadow-md shadow-[#2f5cc4]/20"
                        : "text-muted-foreground hover:bg-canvas-alt hover:text-foreground"
                    }
                  `}
                >
                  <Icon
                    className={`
                      w-5
                      h-5
                      shrink-0
                      transition-all
                      ${
                        isActive
                          ? "text-white"
                          : "text-[#52709b] group-hover:text-[#2f5cc4] dark:text-slate-400 dark:group-hover:text-blue-300"
                      }
                    `}
                  />

                  {!sidebarCollapsed && (
                    <span
                      className={`
                        text-[15px]
                        font-semibold
                        whitespace-nowrap
                        ${
                          isActive
                            ? "text-white"
                            : "text-muted-foreground group-hover:text-foreground"
                        }
                      `}
                    >
                      {t(`nav.${item.id}`)}
                    </span>
                  )}

                  {/* Tooltip when collapsed */}
                  {sidebarCollapsed && (
                    <span
                      className="
                        absolute
                        left-full
                        ml-3
                        px-3
                        py-1.5
                        bg-card
                        border
                        border-border/50
                        text-foreground
                        text-[11px]
                        rounded-md
                        opacity-0
                        group-hover:opacity-100
                        pointer-events-none
                        whitespace-nowrap
                        transition-opacity
                        z-[100]
                        shadow-lg
                      "
                    >
                      {t(`nav.${item.id}`)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ================= BOTTOM SECTION ================= */}
        <div className="px-3 pb-5">
          {/* ================= USER PROFILE ================= */}
          <div
            className="relative mt-3 pt-3 border-t border-border/70"
            ref={profileRef}
          >
            {profilePopupOpen && (
              <div
                className={`sidebar-account-popup absolute bottom-full z-[90] mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl ${
                  sidebarCollapsed
                    ? "left-1/2 w-56 -translate-x-1/2"
                    : "left-0 right-0"
                }`}
              >
                <div className="flex items-center gap-3 border-b border-border bg-[#3867D6]/5 p-3 text-left">
                  <img
                    src={
                      user?.avatar_url ||
                      `https://api.dicebear.com/8.x/initials/svg?backgroundColor=3867d6&textColor=ffffff&seed=${encodeURIComponent(
                        `${user?.firstName || ""} ${
                          user?.lastName || ""
                        }`.trim() ||
                          user?.name ||
                          displayName,
                      )}`
                    }
                    className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                    alt="User"
                    onError={(e) => {
                      const seed = encodeURIComponent(
                        `${user?.firstName || ""} ${
                          user?.lastName || ""
                        }`.trim() ||
                          user?.name ||
                          displayName,
                      );

                      e.target.src = `https://api.dicebear.com/8.x/initials/svg?backgroundColor=3867d6&textColor=ffffff&seed=${seed}&backgroundColor=3b82f6&textColor=ffffff`;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold leading-5 text-main">
                      {displayName}
                    </div>
                    <div className="truncate text-[11px] font-medium leading-4 text-muted">
                      Account
                    </div>
                  </div>
                </div>

                <div className="space-y-1 p-2">
                  <button
                    onClick={() => {
                      navigate("/settings");
                      setProfilePopupOpen(false);
                      setSidebarOpen(false);
                    }}
                    className="flex h-11 w-full items-center rounded-lg px-3 text-sm font-semibold text-main transition-colors hover:bg-[#3867D6]/10 hover:text-[#3867D6] dark:hover:text-[#7FA7FF]"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </button>

                  <button
                    onClick={handleLogout}
                    className="flex h-11 w-full items-center rounded-lg px-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              </div>
            )}

            {/* Profile */}
            <button
              onClick={() => setProfilePopupOpen(!profilePopupOpen)}
              className={`
                w-full
                flex
                items-center
                ${sidebarCollapsed ? "justify-center" : "justify-start"}
                gap-3
                ${sidebarCollapsed ? "px-0" : "px-3"}
                py-2.5
                rounded-xl
                border
                ${profilePopupOpen ? "border-[#3867D6]/45 bg-[#3867D6]/10" : "border-border bg-card hover:border-[#3867D6]/35 hover:bg-[#3867D6]/5"}
                transition-all
              `}
            >
              <img
                src={
                  user?.avatar_url ||
                  `https://api.dicebear.com/8.x/initials/svg?backgroundColor=3867d6&textColor=ffffff&seed=${encodeURIComponent(
                    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
                      user?.name ||
                      displayName,
                  )}`
                }
                className="h-9 w-9 min-w-9 shrink-0 aspect-square rounded-full object-cover"
                alt="Avatar"
                onError={(e) => {
                  const seed = encodeURIComponent(
                    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
                      user?.name ||
                      displayName,
                  );

                  e.target.src = `https://api.dicebear.com/8.x/initials/svg?backgroundColor=3867d6&textColor=ffffff&seed=${seed}&backgroundColor=3b82f6&textColor=ffffff`;
                }}
              />

              {!sidebarCollapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13px] font-semibold text-main">
                      {displayName}
                    </div>
                    <div className="text-[11px] text-muted">Account</div>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-muted transition-transform ${profilePopupOpen ? "-rotate-90" : "rotate-90"}`}
                  />
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
