import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Test User", email: "test@example.com", role: "user" },
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", isDark: false, toggleTheme: vi.fn() }),
}));

vi.mock("../service/notificationService", () => ({
  fetchNotifications: vi.fn().mockResolvedValue([]),
  markAsReadApi: vi.fn().mockResolvedValue({}),
  markAllAsReadApi: vi.fn().mockResolvedValue({}),
  clearAllNotificationsApi: vi.fn().mockResolvedValue({}),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) =>
      ({
        "nav.dashboard": "Dashboard",
        "nav.analytics": "Analytics",
        "nav.settings": "Settings",
        "nav.profile": "Profile",
        "auth.logout": "Logout",
      })[key] || key,
    i18n: { language: "en" },
  }),
}));

vi.mock("../lib/api", () => ({
  default: "http://localhost:5000",
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { id: "dashboard", path: "/dashboard" },
      { id: "analytics", path: "/analytics" },
    ],
  }),
}));

const LocationDisplay = () => <div data-testid="current-path">{useLocation().pathname}</div>;

const CollapseButton = () => {
  const { setSidebarCollapsed } = useSidebar();
  return (
    <button type="button" onClick={() => setSidebarCollapsed(true)}>
      Collapse
    </button>
  );
};

describe("Header and Sidebar navigation accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem("token", "test-token");
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("uses semantic links for logo and sidebar items with active-page semantics", async () => {
    render(
      <SidebarProvider>
        <MemoryRouter initialEntries={["/analytics"]}>
          <Sidebar activePage="analytics" />
        </MemoryRouter>
      </SidebarProvider>,
    );

    const logoLink = screen.getByRole("link", { name: "AI Mentor Dashboard" });
    const analyticsLink = await screen.findByRole("link", { name: "Analytics" });
    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });

    expect(logoLink.getAttribute("href")).toBe("/dashboard");
    expect(analyticsLink.getAttribute("href")).toBe("/analytics");
    expect(analyticsLink.getAttribute("aria-current")).toBe("page");
    expect(dashboardLink.getAttribute("aria-current")).toBeNull();
  });

  it("supports keyboard focus and navigation on sidebar and logo links", async () => {
    render(
      <SidebarProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Sidebar activePage="dashboard" />
          <Routes>
            <Route path="/dashboard" element={<LocationDisplay />} />
            <Route path="/analytics" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      </SidebarProvider>,
    );

    const analyticsLink = await screen.findByRole("link", { name: "Analytics" });
    analyticsLink.focus();
    expect(document.activeElement).toBe(analyticsLink);

    fireEvent.click(analyticsLink);
    expect(screen.getByTestId("current-path").textContent).toBe("/analytics");

    const logoLink = screen.getByRole("link", { name: "AI Mentor Dashboard" });
    logoLink.focus();
    expect(document.activeElement).toBe(logoLink);

    fireEvent.click(logoLink);
    expect(screen.getByTestId("current-path").textContent).toBe("/dashboard");
  });

  it("keeps accessible labels when sidebar is collapsed", async () => {
    render(
      <SidebarProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <CollapseButton />
          <Sidebar activePage="dashboard" />
        </MemoryRouter>
      </SidebarProvider>,
    );

    await screen.findByRole("link", { name: "Analytics" });
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));

    expect(screen.getByRole("link", { name: "Analytics" }).getAttribute("aria-label")).toBe(
      "Analytics",
    );
    expect(screen.getByRole("link", { name: "AI Mentor Dashboard" })).toBeTruthy();
  });

  it("uses semantic links in Header dropdown while keeping Logout as a button", () => {
    render(
      <SidebarProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Header />
        </MemoryRouter>
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByText("Test User").closest("button"));

    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByRole("button", { name: "Logout" }).tagName).toBe("BUTTON");
  });
});
