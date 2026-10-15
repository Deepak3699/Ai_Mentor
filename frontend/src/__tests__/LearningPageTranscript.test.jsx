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
  const value = { user: { purchasedCourses: [] }, updateUser: vi.fn() };
  return { useAuth: () => value };
});

// Minimal player: attaches the video ref and shows the shortcut-driven mute state.
vi.mock("../components/video/VideoPlayer", () => ({
  default: ({ videoRef, isMuted }) => (
    <div>
      <video ref={videoRef} />
      <span data-testid="muted">{String(!!isMuted)}</span>
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

const fakeFetch = (url) => {
  url = url.replace(/^https?:\/\/[^/]+/, "");
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
  fireEvent.click(screen.getByRole("button", { name: "SRK" }));
  await flush();
  await flush();
};

beforeEach(() => {
  vi.useFakeTimers();
  transcriptName = "t1";
  transcriptResponse = ok({ content: SCRIPT });
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
  it("shows the saved lesson transcript, matching the stored text", async () => {
    await renderWithTranscript();
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
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("region", { name: "learning.transcript" })).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("region", { name: "learning.transcript" })).toBeTruthy();
  });

  it("returns focus to the toggle when the transcript is closed from inside", async () => {
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: "learning.close_transcript" }));
    const toggle = screen.getByRole("button", { name: "learning.transcript" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("jumps the video to the clicked timestamp", async () => {
    await renderWithTranscript();
    fireEvent.click(screen.getByRole("button", { name: /Neural networks learn patterns!/ }));
    expect(document.querySelector("video").currentTime).toBe(10);
  });

  it("does not trigger player shortcuts while a transcript control has focus", async () => {
    await renderWithTranscript();
    const cue = screen.getByRole("button", { name: /Ready to begin\?/ });
    fireEvent.keyDown(cue, { key: "m" });
    expect(screen.getByTestId("muted").textContent).toBe("false");

    fireEvent.keyDown(document.body, { key: "m" });
    expect(screen.getByTestId("muted").textContent).toBe("true");
  });

  it("shows the unavailable state when the lesson has no transcript", async () => {
    transcriptName = "";
    await renderWithTranscript();
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
    expect(screen.getByRole("status").textContent).toBe("learning.transcript_loading");
    expect(screen.queryByText("learning.no_transcript")).toBeNull();

    release();
    await flush();
    await flush();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Welcome to the lesson.")).toBeTruthy();
  });
});
