import React from "react";
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

  // Derive activePage from the current path
  const activePage =
    routeToPage[location.pathname] ||
    (location.pathname.startsWith("/learning") ? "courses" : "dashboard");

  return (
    <div className="h-dvh min-h-0 overflow-hidden w-full rounded-none bg-canvas-alt flex flex-col">
      <Header />
      <Sidebar activePage={activePage} />
      <div
        className={`app-route-scroll h-[calc(100dvh-5rem)] min-h-0 flex-none overflow-x-hidden overflow-y-auto bg-canvas-alt transition-[margin-left] duration-300 mt-[5rem] ${
          isDesktop ? (sidebarCollapsed ? "ml-[72px]" : "ml-[245px]") : ""
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
