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

  const {
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useSidebar();

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

  const displayName = 
   user?.name || user?.email?.split("@")[0] || "User";

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
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setProfilePopupOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch navigation items
  useEffect(() => {
    let isMounted = true;

    const fetchNavigationItems = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) return;

        const response = await fetch(
          `${API_BASE_URL}/api/sidebar/navigation`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

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

            <h3 className="text-sm font-bold text-main mb-2">
              Logout
            </h3>

            <p className="text-xs text-muted mb-5">
              Are you sure you want to logout?
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold border border-border hover:bg-canvas-alt transition-all"
              >
                Cancel
              </button>

              <button
                onClick={confirmLogout}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-all"
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
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          }

          ${
            sidebarCollapsed
              ? "lg:w-[72px]"
              : "w-[250px] lg:w-[245px]"
          }
        `}
      >
        {/* ================= COLLAPSE BUTTON ================= */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex absolute -right-3.5 top-12 w-7 h-7 bg-card border border-border/80 rounded-full items-center justify-center hover:bg-[#2f5cc4] hover:border-[#2f5cc4] transition-all shadow-sm z-[110] group cursor-pointer"
          aria-label="Toggle sidebar"
        >
          <ChevronRight className={`w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-transform duration-500 ${sidebarCollapsed ? "" : "rotate-180"}`} />
        </button>

        {/* --- LOGO SECTION --- */}
        <div className={`pt-6 px-4 pb-2 transition-all duration-300 ${sidebarCollapsed ? "flex justify-center" : ""}`}>
          <div className={`border border-border/50 rounded-[1.5rem] p-5 flex flex-col items-center justify-center bg-card shadow-sm w-full ${sidebarCollapsed ? "hidden" : "flex"}`}>
            <img src="/upto.png" alt="UptoSkills Logo" className="h-10 mb-3 object-contain" />
            <h2 className="text-[1.2rem] font-bold text-slate-900 dark:text-white tracking-wide">Ai Mentor</h2>
            <p className="text-[11px] text-muted-foreground mt-1 tracking-wide">Learn · Build · Grow</p>
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
                    ${
                      sidebarCollapsed
                        ? "justify-center"
                        : "justify-start"
                    }
                    gap-3
                    px-3
                    py-2.5
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
                      w-[18px]
                      h-[18px]
                      shrink-0
                      transition-all
                      ${
                        isActive
                          ? "text-white"
                          : "text-gray-400 group-hover:text-white"
                      }
                    `}
                  />

                  {!sidebarCollapsed && (
                    <span
                      className={`
                        text-[13px]
                        font-medium
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
            className="relative mt-3 pt-3 border-t border-white/5"
            ref={profileRef}
          >
            {profilePopupOpen && (
              <div
                className={`
                  absolute
                  bottom-full
                  mb-2
                  ${
                    sidebarCollapsed
                      ? "left-0 w-52"
                      : "left-0 right-0"
                  }
                  bg-[#111b30]
                  border
                  border-white/10
                  rounded-xl
                  shadow-2xl
                  overflow-hidden
                  z-[90]
                `}
              >
                <div className="p-4 border-b border-white/5 text-center">
                  <img
                    src={
                      user?.avatar_url ||
                      `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
                        `${user?.firstName || ""} ${
                          user?.lastName || ""
                        }`.trim() ||
                          user?.name ||
                          displayName
                      )}`
                    }
                    className="w-11 h-11 rounded-full mx-auto mb-2 object-cover"
                    alt="User"
                    onError={(e) => {
                      const seed = encodeURIComponent(
                        `${user?.firstName || ""} ${
                          user?.lastName || ""
                        }`.trim() ||
                          user?.name ||
                          displayName
                      );

                      e.target.src = `https://api.dicebear.com/8.x/initials/svg?seed=${seed}`;
                    }}
                  />

                  <div className="text-xs font-semibold text-white truncate">
                    {displayName}
                  </div>
                </div>

                <div className="p-1.5">
                  <button
                    onClick={() => {
                      navigate("/settings");
                      setProfilePopupOpen(false);
                      setSidebarOpen(false);
                    }}
                    className="flex items-center w-full px-3 py-2 text-xs text-gray-300 hover:bg-blue-600 hover:text-white rounded-lg transition-all mb-1"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </button>

                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </button>
                </div>
              </div>
            )}

            {/* Profile */}
            <button
              onClick={() =>
                setProfilePopupOpen(!profilePopupOpen)
              }
              className={`
                w-full
                flex
                items-center
                ${
                  sidebarCollapsed
                    ? "justify-center"
                    : "justify-start"
                }
                gap-3
                p-2
                rounded-lg
                hover:bg-white/5
                transition-all
              `}
            >
              <img
                src={
                  user?.avatar_url ||
                  `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(
                    `${user?.firstName || ""} ${
                      user?.lastName || ""
                    }`.trim() ||
                      user?.name ||
                      displayName
                  )}`
                }
                className="w-8 h-8 rounded-full object-cover"
                alt="Avatar"
                onError={(e) => {
                  const seed = encodeURIComponent(
                    `${user?.firstName || ""} ${
                      user?.lastName || ""
                    }`.trim() ||
                      user?.name ||
                      displayName
                  );

                  e.target.src = `https://api.dicebear.com/8.x/initials/svg?seed=${seed}`;
                }}
              />

              {!sidebarCollapsed && (
                <div className="min-w-0 text-left">
                  <div className="text-[11px] font-medium text-gray-200 truncate">
                    {displayName}
                  </div>

                  <div className="text-[9px] text-gray-500">
                    Account
                  </div>
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;