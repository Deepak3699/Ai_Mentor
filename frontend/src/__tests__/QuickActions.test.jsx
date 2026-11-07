import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuickActions, { OPEN_ASSISTANT_EVENT } from "../components/dashboard/QuickActions";

const renderQuickActions = () =>
  render(
    <MemoryRouter>
      <QuickActions />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("QuickActions", () => {
  it("renders the four quick action blocks", () => {
    renderQuickActions();
    ["Explore Courses", "AI Mentor", "Join Community", "View Certificates"].forEach((label) => {
      expect(screen.getByText(label)).toBeDefined();
    });
  });

  it("opens the AI assistant when the AI Mentor action is clicked", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_ASSISTANT_EVENT, listener);
    renderQuickActions();
    screen.getByText("AI Mentor").closest("button").click();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_ASSISTANT_EVENT, listener);
  });
});
