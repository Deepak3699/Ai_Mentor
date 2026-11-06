import React, { lazy } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { SidebarProvider } from "../context/SidebarContext";

// Mock dependencies required by Header & Sidebar inside DashboardLayout
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Test User", email: "test@example.com" },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    theme: "dark",
    isDark: true,
    setTheme: vi.fn(),
  }),
}));

vi.mock("../service/notificationService", () => ({
  fetchNotifications: vi.fn().mockResolvedValue([]),
  markNotificationAsRead: vi.fn().mockResolvedValue({}),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en" },
  }),
}));

// Component that stays suspended indefinitely
const HangingPage = lazy(() => new Promise(() => {}));

describe("DashboardLayout Suspense Boundary", () => {
  beforeEach(() => {
    // jsdom does not implement scrollTo on div containers
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it("renders LoadingSpinner with role status while a lazy route suspends", () => {
    render(
      <SidebarProvider>
        <MemoryRouter initialEntries={["/hanging"]}>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route path="/hanging" element={<HangingPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SidebarProvider>,
    );

    // LoadingSpinner contains "Loading page..." text inside a role="status" container
    const loadingText = screen.getByText(/loading page/i);
    expect(loadingText).toBeTruthy();

    const statusContainer = loadingText.closest('[role="status"]');
    expect(statusContainer).not.toBeNull();
  });
});
