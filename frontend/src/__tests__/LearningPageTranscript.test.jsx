import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import Learning from "../pages/LearningPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => (options?.time ? `${key}:${options.time}` : key),
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "1" }),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../context/AuthContext", () => {
  const value = { user: { id: 1, purchasedCourses: [] }, updateUser: vi.fn() };
  return { useAuth: () => value };
});

// Minimal player: attaches the video ref and shows the shortcut-driven mute state.
vi.mock("../components/video/VideoPlayer", () => ({
  default: ({ videoRef, isMuted, title, moduleTitle, onPlaybackChange }) => (
    <div>
      <video ref={videoRef} />
      <button onClick={() => onPlaybackChange(true)}>Start playback</button>
      <button onClick={() => onPlaybackChange(false)}>Pause playback</button>
      <span data-testid="muted">{String(!!isMuted)}</span>
      <span data-testid="player-title">{title}</span>
      <span data-testid="player-module">{moduleTitle}</span>
    </div>
  ),
}));

const COURSE = {
  id: 1,
  modules: [{ id: "m1", title: "Module 1", lessons: [{ id: "l1", title: "Lesson One" }] }],
};

const SCRIPT = "Welcome to the lesson. Neural networks learn patterns! Ready to begin?";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

let transcriptName;
let transcriptResponse;
let fetchCalls;
let failStudySession;

const fakeFetch = (url, options = {}) => {
  fetchCalls.push({ url, options });
  url = url.replace(/^https?:\/\/[^/]+/, "");
  if (url === "/api/analytics/study-session" && failStudySession) {
    return Promise.reject(new Error("Study session request failed"));
  }
  let response = ok({});
  if (url === "/api/courses/1/learning") response = ok(structuredClone(COURSE));
  else if (url === "/api/ai/generate-video") {
    response = ok({ cached: true, videoUrl: "https://cdn.test/v.mp4", transcriptName });
  } else if (url.startsWith("/api/ai/transcript/")) response = transcriptResponse;
  return Promise.resolve(response);
};

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

const renderWithTranscript = async () => {
  render(<Learning />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: /learning\.select_ai_voiceover/ }));
  fireEvent.click(screen.getByRole("radio", { name: "SRK" }));
  fireEvent.click(screen.getByRole("button", { name: "learning.workspace.apply_voice" }));
  await flush();
  await flush();
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem("token", "test-token");
  transcriptName = "t1";
  transcriptResponse = ok({ content: SCRIPT });
  fetchCalls = [];
  failStudySession = false;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(30);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Lesson transcript", () => {
  it("keeps the transcript closed until the user opens it", async () => {
    await renderWithTranscript();
    const toggle = screen.getByRole("button", { name: "learning.transcript" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "learning.transcript" })).toBeNull();
    expect(screen.getByTestId("player-title").textContent).toBe("Lesson One");
    expect(screen.getByTestId("player-module").textContent).toBe("Module 1");
  });
  it("shows the saved lesson transcript after the user opens it", async () => {
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.transcript" }));
    const panel = screen.getByRole("region", { name: "learning.transcript" });
    const cues = Array.from(panel.querySelectorAll("li button")).map((b) => b.textContent);
    expect(cues).toEqual([
      expect.stringContaining("Welcome to the lesson."),
      expect.stringContaining("Neural networks learn patterns!"),
      expect.stringContaining("Ready to begin?"),
    ]);
    expect(screen.getByText("0:10")).toBeTruthy();
  });

  it("opens and closes from the toggle next to the player", async () => {
    await renderWithTranscript();
    const toggle = screen.getByRole("button", { name: "learning.transcript" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "learning.transcript" })).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "learning.transcript" })).toBeNull();
  });

  it("returns focus to the toggle when the transcript is closed from inside", async () => {
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.transcript" }));
    fireEvent.click(screen.getByRole("button", { name: "learning.close_transcript" }));
    const toggle = screen.getByRole("button", { name: "learning.transcript" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("jumps the video to the clicked timestamp", async () => {
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.transcript" }));
    fireEvent.click(screen.getByRole("button", { name: /Neural networks learn patterns!/ }));
    expect(document.querySelector("video").currentTime).toBe(10);
  });

  it("does not trigger player shortcuts while a transcript control has focus", async () => {
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.transcript" }));
    const cue = screen.getByRole("button", { name: /Ready to begin\?/ });
    fireEvent.keyDown(cue, { key: "m" });
    expect(screen.getByTestId("muted").textContent).toBe("false");

    fireEvent.keyDown(document.body, { key: "m" });
    expect(screen.getByTestId("muted").textContent).toBe("true");
  });

  it("shows the unavailable state when the lesson has no transcript", async () => {
    transcriptName = "";
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.transcript" }));
    expect(screen.getByText("learning.no_transcript")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a loading state while the transcript is being fetched", async () => {
    let release;
    transcriptResponse = new Promise((resolve) => {
      release = () => resolve(ok({ content: SCRIPT }));
    });
    const pending = fakeFetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => (url.includes("/api/ai/transcript/") ? transcriptResponse : pending(url))),
    );
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.transcript" }));
    expect(screen.getByRole("status").textContent).toBe("learning.transcript_loading");
    expect(screen.queryByText("learning.no_transcript")).toBeNull();

    release();
    await flush();
    await flush();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Welcome to the lesson.")).toBeTruthy();
  });

  it("records elapsed playback in throttled study-session requests", async () => {
    await renderWithTranscript();
    const video = document.querySelector("video");
    let videoTime = 0;
    Object.defineProperty(video, "currentTime", { configurable: true, get: () => videoTime });
    const paused = vi.spyOn(HTMLMediaElement.prototype, "paused", "get");
    paused.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Start playback" }));

    for (let index = 0; index < 16; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      videoTime += 4;
      fireEvent.timeUpdate(video);
    }
    await flush();

    const studyRequests = fetchCalls.filter((call) =>
      call.url.includes("/api/analytics/study-session"),
    );
    expect(studyRequests).toHaveLength(2);
    expect(studyRequests[0].options.method).toBe("POST");
    expect(JSON.parse(studyRequests[0].options.body).hours).toBeCloseTo(32 / 3600);
    expect(JSON.parse(studyRequests[1].options.body).hours).toBeCloseTo(32 / 3600);
  });

  it("keeps time accumulated while paused and records it during resumed playback", async () => {
    await renderWithTranscript();
    const video = document.querySelector("video");
    let videoTime = 0;
    Object.defineProperty(video, "currentTime", { configurable: true, get: () => videoTime });
    vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Start playback" }));

    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      videoTime += 4;
      fireEvent.timeUpdate(video);
    }
    paused.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    videoTime += 10;
    fireEvent.timeUpdate(video);
    expect(
      fetchCalls.filter((call) => call.url.includes("/api/analytics/study-session")),
    ).toHaveLength(0);

    paused.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Start playback" }));
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      videoTime += 4;
      fireEvent.timeUpdate(video);
    }
    await flush();

    const studyRequests = fetchCalls.filter((call) =>
      call.url.includes("/api/analytics/study-session"),
    );
    expect(studyRequests).toHaveLength(1);
    expect(JSON.parse(studyRequests[0].options.body).hours).toBeCloseTo(32 / 3600);
  });

  it("does not record time while the video is paused", async () => {
    await renderWithTranscript();
    const video = document.querySelector("video");
    let videoTime = 0;
    Object.defineProperty(video, "currentTime", { configurable: true, get: () => videoTime });
    const paused = vi.spyOn(HTMLMediaElement.prototype, "paused", "get");
    paused.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Start playback" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    videoTime = 4;
    fireEvent.timeUpdate(video);
    videoTime = 10;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    fireEvent.timeUpdate(video);

    paused.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Pause playback" }));
    videoTime = 20;
    fireEvent.timeUpdate(video);
    await flush();

    expect(
      fetchCalls.filter((call) => call.url.includes("/api/analytics/study-session")),
    ).toHaveLength(0);
  });

  it("ignores a failed study-session request without surfacing an error", async () => {
    failStudySession = true;
    await renderWithTranscript();
    const video = document.querySelector("video");
    let videoTime = 0;
    Object.defineProperty(video, "currentTime", { configurable: true, get: () => videoTime });
    vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Start playback" }));

    for (let index = 0; index < 15; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      videoTime += 4;
      fireEvent.timeUpdate(video);
    }
    await flush();

    expect(
      fetchCalls.filter((call) => call.url.includes("/api/analytics/study-session")),
    ).toHaveLength(1);
  });
});
