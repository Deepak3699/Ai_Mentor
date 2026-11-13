import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Analytics from "../pages/Analytics";
import DateRangeSelector from "../components/DateRangeSelector";

const here = dirname(fileURLToPath(import.meta.url));
const analyticsSource = readFileSync(resolve(here, "../pages/Analytics.jsx"), "utf8");

// Mock window.matchMedia for JSDOM
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

vi.mock("../components/common/FloatingAssistant", () => ({
  default: () => <div data-testid="floating-assistant" />,
}));

const authState = vi.hoisted(() => ({
  user: {
    id: 1,
    name: "Alex",
    purchasedCourses: [],
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: authState.user,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => {
      const translations = {
        "analytics.range_last7": "Last 7 days",
        "analytics.range_last30": "Last 30 days",
        "analytics.range_this_month": "This month",
        "analytics.custom_range": "Custom range",
        "analytics.from": "From",
        "analytics.to": "To",
        "common.apply": "Apply",
        "analytics.max_date_range": "Select a range of up to 90 days.",
        "analytics.vs_previous_period": "vs previous period",
      };

      if (key === "analytics.hours_unit") return options?.defaultValue || "hrs";
      if (key === "analytics.total_study_time_label") return "Total Study Time";
      if (key === "analytics.loading") return "Loading...";

      return translations[key] || options?.defaultValue || key;
    },
    i18n: { language: "en" },
  }),
}));

describe("Analytics study hours bug fix (Issue #404)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        if (url.includes("/api/courses")) {
          return Promise.resolve({
            json: () => Promise.resolve([]),
          });
        }
        if (url.includes("/api/analytics")) {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                studySessions: [
                  { date: "2026-10-25T10:00:00.000Z", hours: 4 },
                  { date: "2026-10-26T10:00:00.000Z", hours: 6.5 },
                ],
              }),
          });
        }
        if (url.includes("/api/certificate/list")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.reject(new Error("Unknown route: " + url));
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("Static code assertions", () => {
    it("reads session.hours with fallback to session.duration for backwards compatibility", () => {
      expect(analyticsSource).toContain("session.hours || session.duration || 0");
      expect(analyticsSource).not.toContain("acc + (session.duration || 0)");
    });

    it("does not incorrectly divide totalStudyTime by 60", () => {
      expect(analyticsSource).not.toContain("totalStudyTime / 60");
      expect(analyticsSource).toContain("{Math.round(totalStudyTime)}");
    });
  });

  describe("Study hours calculation and DOM display", () => {
    it("displays accumulated study hours when backend provides sessions with hours", async () => {
      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      );
      await waitFor(() => {
        expect(screen.getByText(/11\s*hrs/i)).toBeDefined();
      });
    });

    it("shows study time change compared with the previous period", async () => {
      const currentDate = "2026-10-25T10:00:00.000Z";
      const previousDate = "2026-10-13T00:00:00.000Z";

      vi.stubGlobal(
        "fetch",
        vi.fn((url) => {
          if (url.includes("/api/courses")) {
            return Promise.resolve({ json: () => Promise.resolve([]) });
          }

          if (url.includes("/api/analytics")) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  studySessions: [
                    { date: currentDate, hours: 10 },
                    { date: previousDate, hours: 4 },
                  ],
                }),
            });
          }
          if (url.includes("/api/certificate/list")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve([]),
            });
          }

          return Promise.reject(new Error("Unknown route: " + url));
        }),
      );

      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Total Study Time")).toBeDefined();
      });

      await waitFor(() => {
        expect(screen.getByText(/vs previous period/)).toBeDefined();
      });

      const comparison = screen.getByText(/vs previous period/);
      expect(comparison.textContent).toContain("6");
      expect(comparison.textContent).toContain("hrs");
    });
    it("supports legacy sessions with duration property", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url) => {
          if (url.includes("/api/courses")) {
            return Promise.resolve({ json: () => Promise.resolve([]) });
          }
          if (url.includes("/api/analytics")) {
            return Promise.resolve({
              json: () =>
                Promise.resolve({
                  studySessions: [
                    { date: "2026-10-20T10:00:00.000Z", duration: 7 },
                    { date: "2026-10-21T10:00:00.000Z", duration: 3 },
                  ],
                }),
            });
          }
          if (url.includes("/api/certificate/list")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve([]),
            });
          }
          return Promise.reject(new Error("Unknown route: " + url));
        }),
      );

      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Total Study Time")).toBeDefined();
      });

      expect(screen.getByText(/10\s*hrs/i)).toBeDefined();
    });

    it("handles empty study sessions gracefully and displays 0 hrs", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url) => {
          if (url.includes("/api/courses")) {
            return Promise.resolve({ json: () => Promise.resolve([]) });
          }
          if (url.includes("/api/analytics")) {
            return Promise.resolve({
              json: () => Promise.resolve({ studySessions: [] }),
            });
          }
          if (url.includes("/api/certificate/list")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve([]),
            });
          }
          return Promise.reject(new Error("Unknown route: " + url));
        }),
      );

      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText("Total Study Time")).toBeDefined();
      });

      expect(screen.getByText(/0\s*hrs/i)).toBeDefined();
    });
  });
  describe("DateRangeSelector", () => {
    const onSelectPreset = vi.fn();
    const onApplyCustom = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("shows preset options when the selector is opened", () => {
      render(
        <DateRangeSelector
          preset="last30"
          label="Last 30 days"
          onSelectPreset={onSelectPreset}
          onApplyCustom={onApplyCustom}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /last 30 days/i }));

      expect(screen.getByRole("button", { name: /last 7 days/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /this month/i })).toBeDefined();
    });

    it("calls onSelectPreset when a preset is selected", () => {
      render(
        <DateRangeSelector
          preset="last30"
          label="Last 30 days"
          onSelectPreset={onSelectPreset}
          onApplyCustom={onApplyCustom}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /last 30 days/i }));
      fireEvent.click(screen.getByRole("button", { name: /last 7 days/i }));

      expect(onSelectPreset).toHaveBeenCalledWith("last7");
    });

    it("rejects a custom range longer than 90 days", () => {
      render(
        <DateRangeSelector
          preset="last30"
          label="Last 30 days"
          onSelectPreset={onSelectPreset}
          onApplyCustom={onApplyCustom}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /last 30 days/i }));
      fireEvent.click(screen.getByRole("button", { name: /custom range/i }));

      fireEvent.change(screen.getByLabelText("From"), {
        target: { value: "2026-01-01" },
      });
      fireEvent.change(screen.getByLabelText("To"), {
        target: { value: "2026-04-01" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Apply" }));

      expect(screen.getByRole("alert").textContent).toContain("Select a range of up to 90 days.");
      expect(onApplyCustom).not.toHaveBeenCalled();
    });
  });
});
