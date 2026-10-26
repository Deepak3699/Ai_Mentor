import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import enLocales from "../i18n/locales/en.json";

function getNested(obj, path) {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

// These tests render the REAL Dashboard and LearningPage with the real router.
// Only external boundaries are replaced: auth, network (fetch), toasts, i18n,
// and presentational dashboard widgets that are irrelevant to this flow.

const toastMock = vi.hoisted(() => {
  const fn = vi.fn();
  fn.error = vi.fn();
  fn.success = vi.fn();
  fn.loading = vi.fn();
  fn.dismiss = vi.fn();
  return fn;
});
vi.mock("react-hot-toast", () => ({ default: toastMock, toast: toastMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => getNested(enLocales, key) || key,
    i18n: { language: "en" },
  }),
}));

vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

const authState = vi.hoisted(() => ({
  user: { id: 1, name: "Test", purchasedCourses: [{ courseId: 7, progress: {} }] },
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: authState.user,
    fetchUserProfile: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("../components/Preferences", () => ({ default: () => null }));
vi.mock("../components/common/FloatingAssistant", () => ({ default: () => null }));
vi.mock("../components/DashboardHero", () => ({ default: () => null }));
vi.mock("../components/UpcomingLiveSession", () => ({ default: () => null }));
vi.mock("../components/dashboard/QuickActions", () => ({ default: () => null }));
vi.mock("../components/dashboard/TodaysLearningPlan", () => ({ default: () => null }));
vi.mock("../components/dashboard/MeetAiMentorCard", () => ({ default: () => null }));
vi.mock("../components/dashboard/LearningActivityCard", () => ({ default: () => null }));
vi.mock("../components/dashboard/RecentActivityCard", () => ({ default: () => null }));
vi.mock("../components/RecommendedForYou", () => ({ default: () => null }));

// Stand-in for VideoPlayer renders real <video> element so LearningPage attaches ref
vi.mock("../components/video/VideoPlayer", () => ({
  default: ({ videoRef }) => <video ref={videoRef} data-testid="video" />,
}));
vi.mock("../components/video/AITranscript", () => ({ default: () => null }));

import Dashboard from "../pages/Dashboard";
import { selectEligibleAICourse } from "../utils/courseEligibility";
import LearningPage from "../pages/LearningPage";
import AILessonBanner from "../components/AILessonBanner";

const LESSON = { id: 101, title: "Intro", duration: "5:00", type: "video" };
const LEARNING_DATA = {
  modules: [{ id: 1, title: "Module 1", lessons: [LESSON] }],
  course: { id: 7, title: "React Basics", subtitle: "Web", progress: 0 },
  currentLesson: { ...LESSON, module: "Module 1" },
};

const json = (body, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// Records location so tests can assert real router navigation
let currentLocation;
const LocationSpy = () => {
  currentLocation = useLocation();
  return null;
};

let generateResponse;
let coursesResponse;
let statsResponse;
let myCoursesResponse;
let fetchMock;

const renderApp = (initialEntries = ["/"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationSpy />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/courses" element={<div>Courses page</div>} />
        <Route path="/learning/:id" element={<LearningPage />} />
      </Routes>
    </MemoryRouter>,
  );

const clickBanner = async () => {
  const banner = await screen.findByRole("region", { name: /try ai generated lessons/i });
  const button = within(banner).getByRole("button", { name: /generate ai lesson/i });
  fireEvent.click(button);
};

const applyCelebrityVoice = async (name = "Salman Khan") => {
  const radio = await screen.findByRole("radio", { name: new RegExp(name, "i") });
  fireEvent.click(radio);
  const applyButton = screen.getByRole("button", { name: /apply voice/i });
  expect(applyButton.disabled).toBe(false);
  fireEvent.click(applyButton);
};

const generateCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/ai/generate-video"));

beforeEach(() => {
  localStorage.setItem("token", "test-token");
  toastMock.error.mockClear();
  toastMock.mockClear();
  authState.user = {
    id: 1,
    name: "Test",
    purchasedCourses: [{ courseId: 7, progress: {} }],
  };

  generateResponse = () => json({ message: "AI service unavailable" }, 500);
  coursesResponse = () =>
    json([{ id: 7, title: "React Basics", lessonsCount: 10, lessons: "10 lessons" }]);
  // Real backend shape of GET /api/courses/stats/cards (no `statsCards` key).
  statsResponse = () =>
    json({ totalCourses: 1, completedCourses: 0, hoursLearned: 0, certificates: 0 });
  myCoursesResponse = () => json([{ id: 7, title: "React Basics", lessonsCount: 10 }]);

  fetchMock = vi.fn((url) => {
    const u = String(url);
    if (u.endsWith("/api/courses")) return coursesResponse();
    if (u.includes("/api/courses/stats/cards")) return statsResponse();
    if (u.includes("/api/courses/my-courses")) return myCoursesResponse();
    if (u.includes("/api/certificate/list")) return json({ stats: {} });
    if (u.includes("/api/analytics")) return json({ totalHours: 5 });
    if (u.includes("/api/courses/7/learning")) return json(structuredClone(LEARNING_DATA));
    if (u.includes("/api/ai/generate-video")) return generateResponse();
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Dashboard banner when courses are missing or stats fail", () => {
  it("still shows courses when the stats request fails, and tells the user to enroll", async () => {
    authState.user = { id: 1, name: "Test", purchasedCourses: [] };
    myCoursesResponse = () => json([]);
    statsResponse = () => json({ message: "Failed to load stats" }, 500);

    renderApp();
    // Courses come from /api/courses and must not be blanked by the stats failure.
    expect((await screen.findAllByText("React Basics")).length).toBeGreaterThan(0);

    await clickBanner();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith("Enroll in a course to try AI lessons."),
    );
    await waitFor(() => expect(currentLocation.pathname).toBe("/courses"));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("handles real backend shape of /api/courses/stats/cards without destructuring nonexistent statsCards", async () => {
    statsResponse = () =>
      json({ totalCourses: 5, completedCourses: 2, hoursLearned: 14, certificates: 3 });

    renderApp();
    await screen.findByRole("region", { name: /try ai generated lessons/i });

    // The stats endpoint was called with real shape and dashboard loaded cleanly
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/courses/stats/cards"))).toBe(
      true,
    );
  });

  it("says it could not LOAD courses when /api/courses fails", async () => {
    authState.user = { id: 1, name: "Test", purchasedCourses: [] };
    myCoursesResponse = () => json([]);
    coursesResponse = () => json({ message: "Failed to load courses" }, 500);

    renderApp();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/courses"))).toBe(true),
    );
    await new Promise((r) => setTimeout(r, 50));
    await clickBanner();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Couldn't load courses. Please try again."),
    );
  });

  it("says no courses are available only when the API genuinely returns none", async () => {
    authState.user = { id: 1, name: "Test", purchasedCourses: [] };
    myCoursesResponse = () => json([]);
    coursesResponse = () => json([]);

    renderApp();
    await new Promise((r) => setTimeout(r, 50));
    await clickBanner();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No courses are available right now. Check back soon!",
      ),
    );
  });
});

describe("Deterministic course selection and eligibility", () => {
  it("selects in-progress course over unstarted or completed courses", () => {
    const unstarted = { id: 1, title: "Unstarted", total: 10, completed: 0 };
    const inProgress = { id: 2, title: "In Progress", total: 10, completed: 4 };
    const completed = { id: 3, title: "Completed", total: 10, completed: 10 };

    const selected = selectEligibleAICourse([unstarted, inProgress, completed]);
    expect(selected?.id).toBe(2);
  });

  it("selects unstarted course with lessons when no in-progress courses exist", () => {
    const unstarted = { id: 1, title: "Unstarted", total: 10, completed: 0 };
    const completed = { id: 3, title: "Completed", total: 10, completed: 10 };

    const selected = selectEligibleAICourse([completed, unstarted]);
    expect(selected?.id).toBe(1);
  });

  it("filters out courses with 0 eligible lessons", () => {
    const emptyCourse = { id: 1, title: "Empty", total: 0, completed: 0 };
    const selected = selectEligibleAICourse([emptyCourse]);
    expect(selected).toBeNull();
  });

  it("shows error feedback when enrolled courses have no eligible lessons", async () => {
    // Course exists but has 0 lessons
    coursesResponse = () => json([{ id: 7, title: "Zero Lesson Course", lessonsCount: 0 }]);
    authState.user = {
      id: 1,
      name: "Test",
      purchasedCourses: [{ courseId: 7, progress: {} }],
    };

    renderApp();
    await clickBanner();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "No eligible lessons available in your enrolled courses.",
      ),
    );
  });

  it("applies progress tie-break rule: selects course with highest progress % among in-progress courses", () => {
    const courseA = { id: 10, title: "Alpha", total: 10, completed: 3 }; // 30%
    const courseB = { id: 20, title: "Beta", total: 10, completed: 7 }; // 70%
    const courseC = { id: 30, title: "Gamma", total: 20, completed: 10 }; // 50%

    const selected = selectEligibleAICourse([courseA, courseB, courseC]);
    expect(selected?.id).toBe(20); // 70% progress wins
  });

  it("applies alphabetical tie-break rule: selects alphabetical title when progress % ties", () => {
    const courseZ = { id: 1, title: "Zeta Course", total: 10, completed: 5 }; // 50%
    const courseA = { id: 2, title: "Alpha Course", total: 10, completed: 5 }; // 50%
    const courseM = { id: 3, title: "Middle Course", total: 10, completed: 5 }; // 50%

    const selected = selectEligibleAICourse([courseZ, courseA, courseM]);
    expect(selected?.id).toBe(2); // "Alpha Course" wins alphabetical tie-break
  });

  it("applies alphabetical tie-break rule among unstarted courses", () => {
    const unstartedZ = { id: 10, title: "Python Advanced", total: 10, completed: 0 };
    const unstartedA = { id: 20, title: "Data Science 101", total: 10, completed: 0 };

    const selected = selectEligibleAICourse([unstartedZ, unstartedA]);
    expect(selected?.id).toBe(20); // "Data Science 101" wins alphabetical tie-break
  });

  it("breaks identical progress and title ties deterministically by course ID", () => {
    const course1 = { id: 5, title: "Duplicate Title", total: 10, completed: 2 };
    const course2 = { id: 2, title: "Duplicate Title", total: 10, completed: 2 };

    const selected = selectEligibleAICourse([course1, course2]);
    expect(selected?.id).toBe(2); // ID 2 comes before ID 5
  });

  it("falls back to /api/courses/my-courses via authenticated shared API abstraction when enrolled state is empty", async () => {
    localStorage.setItem("token", "auth-token-banner-fallback");
    authState.user = { id: 1, name: "Test", purchasedCourses: [] };
    myCoursesResponse = () => json([{ id: 7, title: "React Basics", lessonsCount: 10 }]);

    renderApp();
    await clickBanner();

    // Proves the fallback request uses the authenticated shared API path (API_BASE_URL prefix + Authorization header)
    await waitFor(() => {
      const fallbackCall = fetchMock.mock.calls.find(([u]) =>
        String(u).includes("/api/courses/my-courses"),
      );
      expect(fallbackCall).toBeDefined();
      const [url, options] = fallbackCall;
      expect(String(url)).toBe("http://localhost:5000/api/courses/my-courses");
      const headers = new Headers(options?.headers);
      expect(headers.get("Authorization")).toBe("Bearer auth-token-banner-fallback");
    });
    await waitFor(() => expect(currentLocation.pathname).toBe("/learning/7"));
  });

  it("shows error feedback when /api/courses/my-courses request fails", async () => {
    authState.user = { id: 1, name: "Test", purchasedCourses: [] };
    myCoursesResponse = () => json({ message: "Network error" }, 500);

    renderApp();
    await clickBanner();

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Couldn't load your courses. Please try again."),
    );
  });
});

describe("Dashboard banner -> AI lesson picker (real VoiceoverDialog flow)", () => {
  it("clicking the banner navigates to the course and opens the VoiceoverDialog", async () => {
    renderApp();
    await clickBanner();

    // Navigates to the enrolled course's learning page
    await waitFor(() => expect(currentLocation.pathname).toBe("/learning/7"));

    // The VoiceoverDialog opens with real accessible radio group and options
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByRole("radio", { name: /salman khan/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /modi ji/i })).toBeDefined();
    expect(screen.getByRole("radio", { name: /srk/i })).toBeDefined();

    // Opening the picker does not start video generation prematurely
    expect(generateCalls()).toHaveLength(0);
  });

  it("clears the openAIVoiceover flag while preserving any other router state", async () => {
    // Navigates with openAIVoiceover AND an extra router state property (e.g. lessonId)
    renderApp([
      { pathname: "/learning/7", state: { openAIVoiceover: true, preservedExtra: "value-123" } },
    ]);

    await screen.findByRole("dialog");

    // openAIVoiceover is removed, but preservedExtra is preserved!
    await waitFor(() => {
      expect(currentLocation.state?.openAIVoiceover).toBeUndefined();
      expect(currentLocation.state?.preservedExtra).toBe("value-123");
    });
  });

  it("does not open the picker on normal navigation to the learning page", async () => {
    render(
      <MemoryRouter initialEntries={["/learning/7"]}>
        <Routes>
          <Route path="/learning/:id" element={<LearningPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("/api/courses/7/learning")),
      ).toBe(true),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("choosing a celebrity and applying sends exactly one generate-video request with the right payload", async () => {
    generateResponse = () =>
      json({ cached: true, videoUrl: "https://res.cloudinary.com/demo/video.mp4", jobId: "j1" });

    renderApp();
    await clickBanner();
    await applyCelebrityVoice("Salman Khan");

    await waitFor(() => expect(generateCalls()).toHaveLength(1));
    const [url, options] = generateCalls()[0];
    expect(url).toContain("/api/ai/generate-video");
    expect(options.method).toBe("POST");
    const authHeader =
      options.headers instanceof Headers
        ? options.headers.get("Authorization")
        : options.headers?.Authorization;
    expect(authHeader).toBe("Bearer test-token");
    expect(JSON.parse(options.body)).toEqual({
      courseId: 7,
      lessonId: 101,
      celebrity: "salman",
    });
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("shows the classified error message when generate-video fails with 403", async () => {
    generateResponse = () => json({ message: "Course not purchased" }, 403);

    renderApp();
    await clickBanner();
    await applyCelebrityVoice("Salman Khan");

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "You do not have permission to generate this lesson.",
        { id: "ai-video-error" },
      ),
    );
  });

  it("shows a friendly fallback when the request cannot reach the server", async () => {
    generateResponse = () => Promise.reject(new TypeError("Failed to fetch"));

    renderApp();
    await clickBanner();
    await applyCelebrityVoice("Salman Khan");

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "We couldn't connect to the AI service. Check your connection and try again.",
        { id: "ai-video-error" },
      ),
    );
  });
});

describe("AILessonBanner accessibility and responsive markup", () => {
  it("renders with correct landmark, labelledby, and accessible button", () => {
    const handleGenerate = vi.fn();
    render(<AILessonBanner onGenerate={handleGenerate} />);

    const section = screen.getByRole("region", { name: /try ai generated lessons/i });
    expect(section).toBeDefined();
    expect(section.getAttribute("aria-labelledby")).toBe("ai-lesson-banner-title");

    const button = screen.getByRole("button", { name: /generate ai lesson/i });
    expect(button).toBeDefined();

    fireEvent.click(button);
    expect(handleGenerate).toHaveBeenCalledTimes(1);
  });

  it("marks decorative robot SVG as aria-hidden and not focusable", () => {
    render(<AILessonBanner onGenerate={vi.fn()} />);
    const banner = screen.getByRole("region", { name: /try ai generated lessons/i });
    const svg = banner.querySelector("svg.ai-lesson-banner__robot");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });
});
