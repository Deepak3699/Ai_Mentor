import React, { lazy } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { SidebarProvider } from "../context/SidebarContext";

vi.mock("../components/Header", () => ({
  default: () => <div data-testid="mock-header">Header</div>,
}));

vi.mock("../components/Sidebar", () => ({
  default: () => <div data-testid="mock-sidebar">Sidebar</div>,
}));

const HangingPage = lazy(() => new Promise(() => {}));

describe("DashboardLayout Suspense Boundary", () => {
  beforeEach(() => {
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

    const loadingText = screen.getByText(/loading page/i);
    expect(loadingText).toBeTruthy();

    const statusContainer = loadingText.closest('[role="status"]');
    expect(statusContainer).not.toBeNull();
  });
});
