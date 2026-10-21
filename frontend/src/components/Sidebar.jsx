import { apiFetch as fetch } from "../lib/api";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ChevronRight,
  Settings,
  Rocket,
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  BarChart3,
  Video,
  Award,
  Flag,
} from "lucide-react";
import API_BASE_URL from "../lib/api";
import { useSidebar } from "../context/SidebarContext";
import { useTranslation } from "react-i18next";

const Sidebar = ({ activePage = "dashboard" }) => {
  const [showProCard, setShowProCard] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("ai-mentor-pro-card-dismissed") !== "true";
  });

  const dismissProCard = () => {
    setShowProCard(false);
    window.localStorage.setItem("ai-mentor-pro-card-dismissed", "true");
  };

  const { t } = useTranslation();

  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed } = useSidebar();

  const { user } = useAuth();
  const navigate = useNavigate();

  const [navigationItems, setNavigationItems] = useState([]);

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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden ui-overlay-motion"
          onClick={() => setSidebarOpen(false)}
        />
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

          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}

          ${sidebarCollapsed ? "lg:w-[72px]" : "w-[245px] lg:w-[245px]"}
        `}
      >
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
          className={`shrink-0 pt-5 px-3 pb-2 transition-all duration-300 ${sidebarCollapsed ? "flex justify-center" : ""}`}
        >
          <div
            className={`border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-center bg-card shadow-sm w-full ${sidebarCollapsed ? "hidden" : "flex"}`}
          >
            <img src="/upto.png" alt="UptoSkills Logo" className="h-8 mb-2 object-contain" />
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
        <nav className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-3 py-4">
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

          {/* ================= UPGRADE TO PRO CARD ================= */}
          {showProCard && !sidebarCollapsed && (
            <aside className="relative mt-4 rounded-xl border border-purple-500/20 bg-purple-500/[0.07] p-3">
              <button
                type="button"
                onClick={dismissProCard}
                aria-label="Dismiss Upgrade to Pro promotion"
                title="Dismiss"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-base leading-none text-muted transition-colors hover:bg-purple-500/10 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
              >
                ×
              </button>

              <div className="flex items-start gap-3 pr-7">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
                  <Rocket className="h-4 w-4 text-purple-300" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-5 text-foreground">
                    Upgrade to Pro
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted">
                    Unlock every course with one subscription.
                  </p>
                </div>
              </div>

              <div
                role="status"
                aria-label="Pro subscriptions are coming soon"
                className="mt-3 flex h-9 w-full items-center justify-center rounded-lg border border-purple-400/20 bg-purple-500/10 px-3 text-xs font-semibold text-purple-200/80"
              >
                Coming soon
              </div>
            </aside>
          )}
        </nav>

        {/* ================= BOTTOM SECTION ================= */}
        <div className="shrink-0 px-3 pb-5">
          {/* Account actions live in the header; the sidebar keeps identity only. */}
          {!sidebarCollapsed && (
            <div className="mt-3 border-t border-border/70 px-2 pt-4 text-xs text-muted">
              Signed in as <span className="font-medium text-main">{displayName}</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
