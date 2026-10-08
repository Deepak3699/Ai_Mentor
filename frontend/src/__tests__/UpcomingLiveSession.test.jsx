import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import UpcomingLiveSession from "../components/UpcomingLiveSession";

afterEach(() => {
  cleanup();
});

describe("UpcomingLiveSession", () => {
  it("renders with default props correctly", () => {
    render(<UpcomingLiveSession />);

    expect(screen.getByText("Upcoming Live Session")).toBeDefined();
    expect(screen.getByText("React Advanced Concepts")).toBeDefined();
    expect(screen.getByText("Today • 7:00 PM – 8:00 PM")).toBeDefined();
    expect(screen.getByRole("button", { name: /join session/i })).toBeDefined();
  });

  it("renders custom session title and time passed via props", () => {
    render(
      <UpcomingLiveSession
        title="Node.js Microservices"
        time="Tomorrow • 5:00 PM – 6:30 PM"
      />
    );

    expect(screen.getByText("Node.js Microservices")).toBeDefined();
    expect(screen.getByText("Tomorrow • 5:00 PM – 6:30 PM")).toBeDefined();
  });

  it("calls onJoin callback when Join Session button is clicked", () => {
    const handleJoin = vi.fn();
    render(<UpcomingLiveSession onJoin={handleJoin} />);

    const button = screen.getByRole("button", { name: /join session/i });
    fireEvent.click(button);

    expect(handleJoin).toHaveBeenCalledTimes(1);
  });

  it("logs to console if onJoin is not provided", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<UpcomingLiveSession title="Test Session" />);

    const button = screen.getByRole("button", { name: /join session/i });
    fireEvent.click(button);

    expect(consoleSpy).toHaveBeenCalledWith("Joining session: Test Session");
    consoleSpy.mockRestore();
  });

  it("renders multiple sessions when sessions prop is provided", () => {
    const sessions = [
      {
        id: "s1",
        title: "Session 1: Intro",
        time: "Today • 2:00 PM",
      },
      {
        id: "s2",
        title: "Session 2: Deep Dive",
        time: "Tomorrow • 4:00 PM",
      },
    ];

    render(<UpcomingLiveSession sessions={sessions} />);

    expect(screen.getByText("Session 1: Intro")).toBeDefined();
    expect(screen.getByText("Session 2: Deep Dive")).toBeDefined();
    const buttons = screen.getAllByRole("button", { name: /join session/i });
    expect(buttons.length).toBe(2);
  });
});
