import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "../lib/api";
import WatchedVideos from "../pages/WatchedVideos";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
  default: "http://localhost:5000",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../components/common/FloatingAssistant", () => ({ default: () => null }));
vi.mock("../components/common/LoadingSpinner", () => ({ default: () => <div>Loading</div> }));

const watchedVideosResponse = {
  videos: [
    {
      lessonId: "lesson-1",
      courseId: 1,
      course: "Python for AI",
      title: "Python lesson",
      progress: 100,
      currentTime: 3600,
      duration: 3600,
      formattedDuration: "1:00:00",
      lastWatched: "2026-10-20T10:00:00.000Z",
      status: "completed",
    },
    {
      lessonId: "lesson-2",
      courseId: 2,
      course: "Data Science",
      title: "Data science lesson",
      progress: 100,
      currentTime: 3600,
      duration: 3600,
      formattedDuration: "1:00:00",
      lastWatched: "2026-10-21T10:00:00.000Z",
      status: "completed",
    },
  ],
  courses: [
    { id: 1, title: "Python for AI" },
    { id: 2, title: "Data Science" },
  ],
  metrics: {
    totalHours: "2.0",
    videosCompleted: 2,
    avgSession: "60m 0s",
    learningStreak: "2 days",
  },
};

describe("WatchedVideos course filter", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "test-token"),
    });
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => watchedVideosResponse,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows course titles and filters watched videos using their course IDs", async () => {
    render(<WatchedVideos />);

    await screen.findByText("Python lesson");
    const [courseFilter] = screen.getAllByRole("combobox");

    expect(screen.getByRole("option", { name: "Python for AI" }).value).toBe("1");
    expect(screen.getByRole("option", { name: "Data Science" }).value).toBe("2");

    fireEvent.change(courseFilter, { target: { value: "2" } });

    await waitFor(() => {
      expect(screen.queryByText("Python lesson")).toBeNull();
      expect(screen.getByText("Data science lesson")).toBeTruthy();
    });
  });
});
