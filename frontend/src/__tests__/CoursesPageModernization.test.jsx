import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const coursesSource = readFileSync(resolve(here, "../pages/CoursesPage.jsx"), "utf8");
const assistantSource = readFileSync(
  resolve(here, "../components/common/FloatingAssistant.jsx"),
  "utf8",
);

describe("modern courses experience", () => {
  it("uses the blue action system and modern filter panel", () => {
    expect(coursesSource).toContain("const BLUE_BUTTON");
    expect(coursesSource).toContain("Filter courses");
    expect(coursesSource).toContain("bg-[#3867D6]");
    expect(coursesSource).not.toContain("bg-[#2DD4BF]");
  });

  it("keeps both course tabs and summary states", () => {
    expect(coursesSource).toContain("My Courses");
    expect(coursesSource).toContain("Explore Courses");
    expect(coursesSource).toContain("Ready to start");
    expect(coursesSource).toContain("Visible results");
  });

  it("allows pointer dragging from the collapsed launcher", () => {
    expect(assistantSource).toContain("onPointerDown={beginLauncherDrag}");
    expect(assistantSource).toContain("allowButton");
    expect(assistantSource).toContain("pointermove");
  });
});

describe("course polish and overlay motion", () => {
  it("formats lesson labels once and uses the continue-learning heading", () => {
    expect(coursesSource).toContain("formatLessonCount");
    expect(coursesSource).toContain("Continue learning");
    expect(coursesSource).not.toContain("} lessons lessons");
  });
});
