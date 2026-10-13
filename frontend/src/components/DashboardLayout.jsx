import React, { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { useSidebar } from "../context/SidebarContext";

const routeToPage = {
  "/dashboard": "dashboard",
  "/analytics": "analytics",
  "/courses": "courses",
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
        className={`app-route-scroll h-[calc(100dvh-4.5rem)] min-h-0 flex-none overflow-x-hidden overflow-y-auto bg-canvas-alt transition-[margin-left] duration-300 mt-[4.5rem] ${
          isDesktop ? (sidebarCollapsed ? "ml-[72px]" : "ml-[245px]") : ""
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
