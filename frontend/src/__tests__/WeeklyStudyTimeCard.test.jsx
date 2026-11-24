import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/* ─── Mock react-i18next ─────────────────────────────────────────────────────── */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const map = {
        "analytics.weekly_study.title": "Weekly Study Time",
        "analytics.weekly_study.subtitle": "Study hours recorded this week",
        "analytics.weekly_study.hours_unit": "hours",
        "analytics.weekly_study.total_label": "This week",
        "analytics.weekly_study.empty_title": "No study time recorded this week",
        "analytics.weekly_study.empty_subtitle":
          "Complete lessons to start building your weekly chart.",
        "analytics.weekly_study.sr_caption": "Weekly study time per day",
        "analytics.weekly_study.sr_day": "Day",
        "analytics.weekly_study.sr_hours": "Hours",
      };
      if (key === "analytics.weekly_study.aria_summary")
        return `Weekly study time: total ${opts?.total} hours, most on ${opts?.peak}`;
      if (key === "analytics.weekly_study.aria_empty")
        return "Weekly study time chart: no data recorded this week";
      return map[key] ?? opts?.defaultValue ?? key;
    },
    i18n: { language: "en" },
  }),
}));

/* ─── Mock recharts (JSDOM has no SVG layout engine) ────────────────────────── */
vi.mock("recharts", () => {
  const React = require("react");
  const Passthrough = ({ children }) => React.createElement("div", null, children);
  const Noop = () => null;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: ({ children }) => React.createElement("div", { "data-testid": "bar-chart" }, children),
    Bar: Noop,
    Cell: Noop,
    XAxis: Noop,
    YAxis: Noop,
    Tooltip: Noop,
    LabelList: Noop,
  };
});

/* ─── Mock window.matchMedia (required by JSDOM) ────────────────────────────── */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import WeeklyStudyTimeCard from "../components/dashboard/WeeklyStudyTimeCard";

/* ─── Helper: build a session for today ─────────────────────────────────────── */
const todayISO = () => new Date().toISOString().slice(0, 10);

const dayISO = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ══════════════════════════════════════════════════════════════════════════════
   TEST SUITE
   ══════════════════════════════════════════════════════════════════════════════ */

describe("WeeklyStudyTimeCard — #356", () => {
  /* ── Rendering ────────────────────────────────────────────────────────────── */

  describe("Rendering", () => {
    it("renders the card heading", () => {
      render(<WeeklyStudyTimeCard studySessions={[]} />);
      expect(screen.getByRole("heading", { name: /weekly study time/i })).toBeDefined();
    });

    it("renders the subtitle", () => {
      render(<WeeklyStudyTimeCard studySessions={[]} />);
      expect(screen.getByText(/study hours recorded this week/i)).toBeDefined();
    });
  });

  /* ── Empty state ──────────────────────────────────────────────────────────── */

  describe("Empty state", () => {
    it("shows empty state when studySessions is empty array", () => {
      render(<WeeklyStudyTimeCard studySessions={[]} />);
      expect(screen.getByTestId("weekly-study-time-empty")).toBeDefined();
    });

    it("shows empty state when prop is omitted", () => {
      render(<WeeklyStudyTimeCard />);
      expect(screen.getByTestId("weekly-study-time-empty")).toBeDefined();
    });

    it("shows empty title message", () => {
      render(<WeeklyStudyTimeCard studySessions={[]} />);
      expect(screen.getByText(/no study time recorded this week/i)).toBeDefined();
    });

    it("does NOT render the bar chart in empty state", () => {
      render(<WeeklyStudyTimeCard studySessions={[]} />);
      expect(screen.queryByTestId("weekly-study-time-chart")).toBeNull();
    });

    it("shows empty state when all sessions are from previous weeks", () => {
      // sessions from 14 days ago (guaranteed previous week)
      const sessions = [{ date: dayISO(-14), hours: 3 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      expect(screen.getByTestId("weekly-study-time-empty")).toBeDefined();
    });
  });

  /* ── Chart state ──────────────────────────────────────────────────────────── */

  describe("Chart state (sessions present this week)", () => {
    beforeEach(() => {
      // sessions for today and yesterday (always in the current week)
      const sessions = [
        { date: todayISO(), hours: 3.5 },
        { date: dayISO(-1), hours: 2 },
      ];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
    });

    it("renders the bar chart container", () => {
      expect(screen.getByTestId("weekly-study-time-chart")).toBeDefined();
    });

    it("does NOT show the empty state", () => {
      expect(screen.queryByTestId("weekly-study-time-empty")).toBeNull();
    });

    it("shows the weekly total", () => {
      // 3.5 + 2 = 5.5
      expect(screen.getByTestId("weekly-study-total").textContent).toContain("5.5");
    });

    it("shows 'This week' label", () => {
      expect(screen.getAllByText(/this week/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ── Accessibility ────────────────────────────────────────────────────────── */

  describe("Accessibility", () => {
    it("chart wrapper has role=img when data is present", () => {
      const sessions = [{ date: todayISO(), hours: 4 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      const chart = screen.getByTestId("weekly-study-time-chart");
      expect(chart.getAttribute("role")).toBe("img");
    });

    it("chart wrapper has a descriptive aria-label", () => {
      const sessions = [{ date: todayISO(), hours: 4 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      const chart = screen.getByTestId("weekly-study-time-chart");
      expect(chart.getAttribute("aria-label")).toContain("4");
    });

    it("renders the visually-hidden screen-reader table", () => {
      const sessions = [{ date: todayISO(), hours: 2 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      const table = screen.getByRole("table");
      expect(table).toBeDefined();
    });

    it("sr table caption matches i18n key", () => {
      const sessions = [{ date: todayISO(), hours: 1 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      expect(screen.getByText("Weekly study time per day")).toBeDefined();
    });

    it("sr table has Day and Hours column headers", () => {
      const sessions = [{ date: todayISO(), hours: 1 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      expect(screen.getByText("Day")).toBeDefined();
      expect(screen.getByText("Hours")).toBeDefined();
    });
  });

  /* ── Data aggregation ─────────────────────────────────────────────────────── */

  describe("Data aggregation", () => {
    it("sums multiple sessions on the same day", () => {
      const sessions = [
        { date: todayISO(), hours: 1.5 },
        { date: todayISO(), hours: 2.5 },
      ];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      // total = 4.0
      expect(screen.getByTestId("weekly-study-total").textContent).toContain("4");
    });

    it("only counts sessions from the current calendar week", () => {
      const sessions = [
        { date: todayISO(), hours: 3 },
        { date: dayISO(-14), hours: 100 }, // old, out of scope
      ];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      expect(screen.getByTestId("weekly-study-total").textContent).toContain("3");
      expect(screen.getByTestId("weekly-study-total").textContent).not.toContain("103");
    });

    it("falls back to session.duration when session.hours is absent", () => {
      const sessions = [{ date: todayISO(), duration: 2.5 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      expect(screen.getByTestId("weekly-study-total").textContent).toContain("2.5");
    });

    it("ignores sessions with no date field", () => {
      const sessions = [{ hours: 10 }, { date: todayISO(), hours: 1 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      // only the valid session counts
      expect(screen.getByTestId("weekly-study-total").textContent).toContain("1");
    });

    it("handles ISO datetime strings (not just date strings)", () => {
      const sessions = [{ date: `${todayISO()}T14:30:00.000Z`, hours: 2 }];
      render(<WeeklyStudyTimeCard studySessions={sessions} />);
      expect(screen.getByTestId("weekly-study-total").textContent).toContain("2");
    });
  });

  /* ── Edge cases ───────────────────────────────────────────────────────────── */

  describe("Edge / guard cases", () => {
    it("renders without crashing when studySessions is null", () => {
      // studySessions defaults to []
      render(<WeeklyStudyTimeCard studySessions={null} />);
      expect(screen.getByRole("heading", { name: /weekly study time/i })).toBeDefined();
    });

    it("renders without crashing when studySessions is undefined", () => {
      render(<WeeklyStudyTimeCard studySessions={undefined} />);
      expect(screen.getByRole("heading", { name: /weekly study time/i })).toBeDefined();
    });

    it("does not display hardcoded numbers in the empty state", () => {
      render(<WeeklyStudyTimeCard studySessions={[]} />);
      // no numeric totals should appear in the empty state
      expect(screen.queryByTestId("weekly-study-total")).toBeNull();
    });
  });
});
