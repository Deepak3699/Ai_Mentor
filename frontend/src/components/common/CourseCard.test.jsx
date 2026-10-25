import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CourseCard from "./CourseCard";

const course = {
  id: 7,
  title: "React Fundamentals",
  category: "Development",
  level: "Beginner",
  lessonsCount: 4,
  duration: "12h 30m",
};
const show = (progress, overrides = {}) =>
  render(
    <MemoryRouter>
      <CourseCard course={{ ...course, ...overrides }} progress={progress} />
    </MemoryRouter>,
  );
afterEach(cleanup);

describe("CourseCard", () => {
  it("shows enrollment metadata and hides progress before starting", () => {
    show();
    expect(screen.getByText("Enrolled")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("12h 30m")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Start Course: React Fundamentals" }).getAttribute("href"),
    ).toBe("/learning/7");
  });
  it("deduplicates stored lesson objects and legacy IDs using the canonical total", () => {
    show(
      { completedLessons: [{ lessonId: 1 }, { lessonId: "1" }, 2, null] },
      { lessons: "2 of 20" },
    );
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(
      screen.getByRole("link", { name: "Continue: React Fundamentals" }).getAttribute("href"),
    ).toBe("/learning/7");
  });
  it("shows zero percent when a lesson has been opened", () => {
    show({ currentLesson: 1 });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("In Progress")).toBeTruthy();
  });
  it("caps completed progress and links to certificates", () => {
    show({ completedLessons: [1, 2, 3, 4, 5] });
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(
      screen
        .getByRole("link", { name: "View Certificate: React Fundamentals" })
        .getAttribute("href"),
    ).toBe("/certificates");
  });
  it("does not claim completion when the total is unknown", () => {
    show({ completedLessons: [1] }, { lessonsCount: 0, duration: null });
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Duration unavailable")).toBeTruthy();
  });
  it("falls back after an image error and closes the options menu with Escape", () => {
    show(undefined, { image: "/broken.png" });
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    const summary = screen.getByLabelText("Options for React Fundamentals");
    summary.parentElement.open = true;
    expect(screen.getByRole("link", { name: "Open course" }).getAttribute("href")).toBe(
      "/learning/7",
    );
    fireEvent.keyDown(summary, { key: "Escape" });
    expect(summary.parentElement.open).toBe(false);
  });
  it("supports legacy lesson totals", () => {
    show({ completedLessons: [1] }, { lessonsCount: null, lessons: "1 of 5" });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("20");
  });
});
