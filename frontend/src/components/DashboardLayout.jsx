import React, { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useSidebar } from "../context/SidebarContext";

const routeToPage = {
  "/dashboard": "dashboard",
  "/analytics": "analytics",
  "/courses": "courses",
  "/code-explainer": "code-explainer",
  "/discussions": "discussions",
  "/settings": "settings",
  "/watchedvideos": "watched",
  "/certificates": "certificates",
  "/report": "report",
};

const DashboardLayout = () => {
  const location = useLocation();
  const { sidebarCollapsed, isDesktop } = useSidebar();
  const routeScrollRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("focusPost") && !params.has("focusReply")) {
      routeScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.search]);

  // Derive activePage from the current path
  const activePage =
    routeToPage[location.pathname] ||
    (location.pathname.startsWith("/learning") ? "courses" : "dashboard");

  return (
    <div className="h-dvh min-h-0 overflow-hidden w-full rounded-none bg-canvas-alt flex flex-col">
      <Header />
      <Sidebar activePage={activePage} />
      <div
        ref={routeScrollRef}
        className={`flex-1 flex flex-col transition-[margin-left] duration-300 mt-18 app-route-scroll h-[calc(100dvh-4.5rem)] min-h-0 overflow-x-hidden overflow-y-auto ${
          isDesktop ? (sidebarCollapsed ? "ml-18" : "ml-61.25") : ""
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
