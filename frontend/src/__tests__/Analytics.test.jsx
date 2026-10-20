import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analytics from "../pages/Analytics";

let studySessions;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => {
      if (key === "analytics.hours_unit") return options?.defaultValue || "hrs";
      if (key === "analytics.this_month") return "This month";
      return key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, name: "Learner", purchasedCourses: [] } }),
}));

vi.mock("../components/common/FloatingAssistant", () => ({ default: () => null }));

beforeEach(() => {
  studySessions = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({
        ok: true,
        json: async () => (url === "/api/courses" ? [] : { studySessions }),
      }),
    ),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderAnalytics = () =>
  render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>,
  );

describe("Analytics study totals", () => {
  it("shows current-month session hours in hours and excludes other months", async () => {
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    studySessions = [
      { date: now.toISOString(), hours: 1.25 },
      { date: now.toISOString(), hours: 2 },
      { date: previousMonth.toISOString(), hours: 12 },
    ];

    renderAnalytics();

    await waitFor(() => expect(screen.getByText("3.3")).toBeTruthy());
    expect(screen.getByText("This month")).toBeTruthy();
    expect(screen.getByText("analytics.attendance_rate").parentElement.textContent).toContain(
      "3%",
    );
  });

  it("shows zero study time and attendance when no sessions exist", async () => {
    renderAnalytics();

    await waitFor(() =>
      expect(
        screen
          .getByText("analytics.total_study_time_label")
          .parentElement.parentElement.textContent,
      ).toContain("0 hrs"),
    );
    expect(screen.getByText("analytics.attendance_rate").parentElement.textContent).toContain(
      "0%",
    );
  });
});
