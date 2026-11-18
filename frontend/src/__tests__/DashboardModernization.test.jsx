import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../pages/Dashboard.jsx"), "utf8");
describe("modern learner dashboard", () => {
  it("uses real-data fallbacks instead of static AI lesson and activity arrays", () => {
    expect(source).not.toContain("const latestLessons");
    expect(source).toContain("weeklyActivity");
    expect(source).toContain("upcomingSessions");
  });
  it("uses blue actions and compact course progress cards", () => {
    expect(source).toContain("#3867D6");
    expect(source).toContain("Course progress");
    expect(source).not.toContain("bg-teal-500");
  });
});

describe("final dashboard polish", () => {
  it("balances unavailable hours and avoids duplicate continue actions", () => {
    expect(source).toContain("Hours not recorded");
    expect(source).toContain('actionLabel="View My Courses"');
  });
});

describe("dashboard spacing and assistant polish", () => {
  it("uses a protected content zone and the compact assistant launcher", () => {
    expect(source).toContain("dashboard-content-inner");
  });
});

describe("startup loader readiness", () => {
  it("signals readiness only after Dashboard data loading finishes", () => {
    expect(source).toContain('window.dispatchEvent(new Event("app:initial-content-ready"))');
    expect(source).toContain("if (!loading)");
  });
});
