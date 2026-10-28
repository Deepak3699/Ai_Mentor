import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Analytics from "../pages/Analytics";

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
      if (key === "analytics.hours_unit") return options?.defaultValue || "hrs";
      if (key === "analytics.total_study_time_label") return "Total Study Time";
      if (key === "analytics.loading") return "Loading...";
      return key;
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
        expect(screen.getByText("Total Study Time")).toBeDefined();
      });

      // 4 + 6.5 = 10.5 -> Math.round is 11 hrs
      expect(screen.getByText(/11\s*hrs/i)).toBeDefined();
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
});
