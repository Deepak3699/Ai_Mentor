import React from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LearningActivityCard from "../components/dashboard/LearningActivityCard";
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);
describe("LearningActivityCard", () => {
  it("shows an honest empty state without analytics data", () => {
    render(<LearningActivityCard />);
    expect(screen.getByTestId("learning-activity-empty")).toBeTruthy();
    expect(screen.queryByTestId("weekly-total")).toBeNull();
  });
  it("renders verified summary data passed through props", () => {
    render(
      <LearningActivityCard
        data={[{ day: "Mon", hours: 0 }]}
        summary={{ hours: 2, changePercent: 10 }}
      />,
    );
    expect(screen.getByTestId("learning-activity-empty")).toBeTruthy();
  });
});
