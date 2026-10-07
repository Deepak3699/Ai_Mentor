import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import toast from "react-hot-toast";
import Learning from "../pages/LearningPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "1" }),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../context/AuthContext", () => {
  const value = { user: { purchasedCourses: [] }, updateUser: vi.fn() };
  return { useAuth: () => value };
});

vi.mock("../components/video/AITranscript", () => ({ default: () => null }));

// Minimal player: attaches the video ref and exposes the page state under test.
vi.mock("../components/video/VideoPlayer", () => ({
  default: ({ videoRef, aiVideoUrl, isAIVideoLoading }) => (
    <div>
      <video ref={videoRef} />
      <span data-testid="ai-url">{aiVideoUrl || ""}</span>
      <span data-testid="loading">{String(!!isAIVideoLoading)}</span>
    </div>
  ),
}));

const COURSE = {
  id: 1,
  modules: [
    {
      id: "m1",
      title: "Module 1",
      lessons: [
        { id: "l1", title: "Lesson One" },
        { id: "l2", title: "Lesson Two" },
      ],
    },
  ],
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

let calls;
let readyJobs;

// fetch stand-in that honours AbortSignal, like the real one.
const fakeFetch = (url, init = {}) =>
  new Promise((resolve, reject) => {
    const { signal } = init;
    const onAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });

    // apiFetch prefixes the API origin; tests care about the path only.
    url = url.replace(/^https?:\/\/[^/]+/, "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, signal, body });

    let response;
    if (url === "/api/courses/1/learning") {
      response = ok(structuredClone(COURSE));
    } else if (url === "/api/ai/generate-video") {
      response = ok({ jobId: `job-${body.lessonId}-${body.celebrity}` });
    } else if (url.startsWith("/api/ai/status/")) {
      const jobId = url.split("/").pop();
      response = ok(
        readyJobs.has(jobId)
          ? { status: "ready", cloudinary_url: `https://cdn.test/${jobId}.mp4` }
          : { status: "processing" }
      );
    } else {
      response = ok({});
    }
    Promise.resolve().then(() => resolve(response));
  });

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const selectCelebrity = (name) => {
  fireEvent.click(screen.getByRole("button", { name: /learning\.select_ai_voiceover/ }));
  fireEvent.click(screen.getByRole("button", { name }));
};

const selectLesson = (title) =>
  fireEvent.click(screen.getByRole("button", { name: title, hidden: true }));

const callsFor = (fragment) => calls.filter((c) => c.url.includes(fragment));
const statusCallsFor = (jobId) => callsFor(`/api/ai/status/${jobId}`);
const generateCallsFor = (lessonId, celebrity) =>
  callsFor("/api/ai/generate-video").filter(
    (c) => c.body.lessonId === lessonId && c.body.celebrity === celebrity
  );

const renderPage = async () => {
  const utils = render(<Learning />);
  await flush();
  return utils;
};

let errorSpy;

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  readyJobs = new Set();
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  toast.error.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const expectNoFailureReported = () => {
  expect(toast.error).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(errorSpy.mock.calls.some(([msg]) => msg === "AI video generation failed:")).toBe(false);
};

describe("Learning page AI video polling cancellation", () => {
  it("polls while mounted (sanity check)", async () => {
    await renderPage();
    selectCelebrity("SRK");
    await flush();
    const before = statusCallsFor("job-l1-srk").length;
    expect(before).toBeGreaterThan(0);

    await flush(2000);
    expect(statusCallsFor("job-l1-srk").length).toBeGreaterThan(before);
  });

  it("stops polling and aborts in-flight requests on unmount", async () => {
    const { unmount } = await renderPage();
    selectCelebrity("SRK");
    await flush();

    const generate = generateCallsFor("l1", "srk");
    expect(generate).toHaveLength(1);
    expect(statusCallsFor("job-l1-srk").length).toBeGreaterThan(0);
    expect(generate[0].signal.aborted).toBe(false);

    unmount();

    expect(calls.every((c) => c.url === "/api/courses/1/learning" || c.signal.aborted)).toBe(true);

    const countAtUnmount = calls.length;
    await flush(60_000);
    expect(calls.length).toBe(countAtUnmount);
    expectNoFailureReported();
  });

  it("aborts a request that is still in flight when the page unmounts", async () => {
    const { unmount } = await renderPage();
    selectCelebrity("SRK");
    // No flush: generate-video has been sent but has not resolved yet.
    const [generate] = generateCallsFor("l1", "srk");
    expect(generate.signal.aborted).toBe(false);

    unmount();
    expect(generate.signal.aborted).toBe(true);
    await flush(10_000);
    expect(statusCallsFor("job-l1-srk")).toHaveLength(0);
    expectNoFailureReported();
  });

  it("cancels the previous flow when the lesson changes", async () => {
    await renderPage();
    selectCelebrity("SRK");
    await flush();

    const [firstGenerate] = generateCallsFor("l1", "srk");
    const firstStatusCalls = statusCallsFor("job-l1-srk");
    expect(firstStatusCalls.length).toBeGreaterThan(0);

    selectLesson("Lesson Two");
    await flush();

    expect(firstGenerate.signal.aborted).toBe(true);
    expect(firstStatusCalls.every((c) => c.signal.aborted)).toBe(true);
    const [secondGenerate] = generateCallsFor("l2", "srk");
    expect(secondGenerate.signal.aborted).toBe(false);

    // The old job finishing must not leak into the page, and is no longer polled.
    const staleCount = statusCallsFor("job-l1-srk").length;
    readyJobs.add("job-l1-srk");
    await flush(10_000);
    expect(statusCallsFor("job-l1-srk")).toHaveLength(staleCount);
    expect(screen.getByTestId("ai-url").textContent).toBe("");

    readyJobs.add("job-l2-srk");
    await flush(10_000);
    expect(screen.getByTestId("ai-url").textContent).toBe("https://cdn.test/job-l2-srk.mp4");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expectNoFailureReported();
  });

  it("cancels the previous flow when the celebrity changes", async () => {
    await renderPage();
    selectCelebrity("SRK");
    await flush();

    const [srkGenerate] = generateCallsFor("l1", "srk");
    const srkStatusCalls = statusCallsFor("job-l1-srk");

    selectCelebrity("Modi ji");
    await flush();

    expect(srkGenerate.signal.aborted).toBe(true);
    expect(srkStatusCalls.every((c) => c.signal.aborted)).toBe(true);
    expect(generateCallsFor("l1", "modi")[0].signal.aborted).toBe(false);

    const staleCount = statusCallsFor("job-l1-srk").length;
    readyJobs.add("job-l1-srk");
    await flush(10_000);
    expect(statusCallsFor("job-l1-srk")).toHaveLength(staleCount);
    expect(screen.getByTestId("ai-url").textContent).toBe("");

    readyJobs.add("job-l1-modi");
    await flush(10_000);
    expect(screen.getByTestId("ai-url").textContent).toBe("https://cdn.test/job-l1-modi.mp4");
    expectNoFailureReported();
  });

  it("only lets the latest request update the page when switching rapidly", async () => {
    await renderPage();

    // Switch faster than any request can resolve.
    selectCelebrity("SRK");
    selectCelebrity("Modi ji");
    selectCelebrity("Salman Khan");
    selectLesson("Lesson Two");
    selectCelebrity("SRK");

    const generates = callsFor("/api/ai/generate-video");
    expect(generates).toHaveLength(5);
    expect(generates.slice(0, -1).every((c) => c.signal.aborted)).toBe(true);
    expect(generates.at(-1).signal.aborted).toBe(false);
    expect(generates.at(-1).body).toMatchObject({ lessonId: "l2", celebrity: "srk" });

    // Even if every job were ready, only the latest one may drive the page.
    ["job-l1-srk", "job-l1-modi", "job-l1-salman", "job-l2-salman", "job-l2-srk"].forEach((j) =>
      readyJobs.add(j)
    );
    await flush(10_000);

    ["job-l1-srk", "job-l1-modi", "job-l1-salman"].forEach((j) =>
      expect(statusCallsFor(j)).toHaveLength(0)
    );
    expect(screen.getByTestId("ai-url").textContent).toBe("https://cdn.test/job-l2-srk.mp4");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expectNoFailureReported();
  });

  it("clears the loading flag when the celebrity is deselected mid-generation", async () => {
    await renderPage();
    selectCelebrity("SRK");
    await flush();
    expect(screen.getByTestId("loading").textContent).toBe("true");
    const [generate] = generateCallsFor("l1", "srk");

    // Deselect: the cancelled flow must not leave loading stuck on.
    selectCelebrity("SRK");
    await flush();
    expect(generate.signal.aborted).toBe(true);
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expectNoFailureReported();
  });

  it("starts a fresh generation when the same celebrity is re-selected", async () => {
    await renderPage();
    selectCelebrity("SRK");
    await flush();

    selectCelebrity("SRK"); // deselect
    await flush();
    selectCelebrity("SRK"); // select again
    await flush();

    const generates = generateCallsFor("l1", "srk");
    expect(generates).toHaveLength(2);
    expect(generates[0].signal.aborted).toBe(true);
    expect(generates[1].signal.aborted).toBe(false);

    readyJobs.add("job-l1-srk");
    await flush(5000);
    expect(screen.getByTestId("ai-url").textContent).toBe("https://cdn.test/job-l1-srk.mp4");
    expectNoFailureReported();
  });

  it("still reports genuine (non-abort) failures", async () => {
    await renderPage();
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init) =>
        url.endsWith("/api/ai/generate-video")
          ? Promise.resolve({ ok: false, status: 500, json: async () => ({ message: "boom" }) })
          : fakeFetch(url, init)
      )
    );

    selectCelebrity("SRK");
    await flush();

    expect(errorSpy.mock.calls.some(([msg]) => msg === "AI video generation failed:")).toBe(true);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});
