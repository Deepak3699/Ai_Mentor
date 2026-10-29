import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LearningProgressCard from "../components/dashboard/LearningProgressCard";

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <LearningProgressCard {...props} />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("LearningProgressCard", () => {
  it("renders with default requirements from Issue #178", () => {
    renderCard();

    // Header
    expect(screen.getByRole("heading", { name: /your learning progress/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /view learning progress details/i })).toBeDefined();

    // Left side: Donut percentage and label
    expect(screen.getByTestId("learning-progress-percentage").textContent).toBe("68%");
    expect(screen.getByText("Overall Progress")).toBeDefined();

    // Right side: 4 metric rows with labels
    expect(screen.getByText("Enrolled Courses")).toBeDefined();
    expect(screen.getByText("Completed Lessons")).toBeDefined();
    expect(screen.getByText("Certificates")).toBeDefined();
    expect(screen.getByText("Learning Time")).toBeDefined();

    // Default values
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("12h 30m")).toBeDefined();
  });

  it("renders custom metric values when passed as props", () => {
    renderCard({
      progress: 85,
      enrolledCourses: 5,
      completedLessons: 12,
      certificates: 3,
      learningTime: "24h 15m",
    });

    expect(screen.getByTestId("learning-progress-percentage").textContent).toBe("85%");
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("24h 15m")).toBeDefined();
  });

  it("calls onViewDetails when the View Details button is clicked", () => {
    const handleViewDetails = vi.fn();
    renderCard({ onViewDetails: handleViewDetails });

    const button = screen.getByRole("button", { name: /view learning progress details/i });
    fireEvent.click(button);

    expect(handleViewDetails).toHaveBeenCalledTimes(1);
  });

  it("clamps progress between 0% and 100%", () => {
    const { unmount } = renderCard({ progress: -15 });
    expect(screen.getByTestId("learning-progress-percentage").textContent).toBe("0%");
    unmount();

    renderCard({ progress: 145 });
    expect(screen.getByTestId("learning-progress-percentage").textContent).toBe("100%");
  });

  it("renders accessible SVG donut chart with aria attributes", () => {
    renderCard({ progress: 75 });
    const donut = screen.getByTestId("learning-progress-donut");
    expect(donut.getAttribute("role")).toBe("img");
    expect(donut.getAttribute("aria-label")).toBe("Overall progress: 75%");
  });
});
