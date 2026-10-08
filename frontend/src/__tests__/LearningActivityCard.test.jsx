import React from "react";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import LearningActivityCard from "../components/dashboard/LearningActivityCard";
import { WEEKLY_ACTIVITY } from "../components/dashboard/learningActivityData";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

describe("LearningActivityCard", () => {
  it("mock data covers Mon-Sun and stays within the 0-8h axis", () => {
    expect(WEEKLY_ACTIVITY.map((d) => d.day)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
    WEEKLY_ACTIVITY.forEach((d) => {
      expect(d.hours).toBeGreaterThanOrEqual(0);
      expect(d.hours).toBeLessThanOrEqual(8);
    });
  });

  it("renders header, subtitle, summary box and quote", () => {
    render(<LearningActivityCard />);
    expect(screen.getByText("Your Learning Activity")).toBeTruthy();
    expect(screen.getByText("Hours spent learning this week")).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByTestId("weekly-total").textContent).toBe("8.5 hours");

    const change = screen.getByTestId("weekly-change");
    expect(change.textContent).toBe("↑ 24% compared to last week");
    expect(change.querySelector("span").className).toContain("text-green-600");

    expect(screen.getByText(/Small steps every day lead to big results\./)).toBeTruthy();
    expect(screen.getByText(/AI Mentor/)).toBeTruthy();
  });

  it("renders a responsive chart container instead of a static image", () => {
    const { container } = render(<LearningActivityCard />);
    expect(screen.getByTestId("learning-activity-chart")).toBeTruthy();
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders the summary from the props it is given", () => {
    render(
      <LearningActivityCard
        data={[{ day: "Mon", hours: 2 }]}
        summary={{ hours: 5, changePercent: 10 }}
      />,
    );
    expect(screen.getByTestId("weekly-total").textContent).toBe("5 hours");
    expect(screen.getByTestId("weekly-change").textContent).toBe(
      "↑ 10% compared to last week",
    );
  });
});
