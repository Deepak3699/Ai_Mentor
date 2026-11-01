import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import VoiceoverDialog from "../components/learning/VoiceoverDialog";
import LessonPicker from "../components/learning/LessonPicker";
import AITranscript from "../components/video/AITranscript";
import VideoPlayer from "../components/video/VideoPlayer";
import FlashcardStudy from "../components/learning/FlashcardStudy";
import {
  fetchFlashcardDeck,
  generateFlashcardDeck,
  updateFlashcardMastery,
} from "../service/flashcards";
vi.mock("../service/flashcards", () => ({
  fetchFlashcardDeck: vi.fn(),
  generateFlashcardDeck: vi.fn(),
  updateFlashcardMastery: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const modules = [
  {
    id: "m1",
    title: "Module One",
    lessons: [
      { id: "l1", title: "First lesson" },
      { id: "l2", title: "Second lesson" },
    ],
  },
];
describe("Learning workspace selectors", () => {
  it("keeps a voice selection local until Apply", () => {
    const apply = vi.fn(),
      close = vi.fn();
    render(
      <VoiceoverDialog
        voices={["SRK", "Modi ji"]}
        selected="SRK"
        onApply={apply}
        onClose={close}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Modi ji" }));
    expect(apply).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "learning.workspace.apply_voice" }));
    expect(apply).toHaveBeenCalledWith("Modi ji");
    expect(close).toHaveBeenCalledOnce();
  });
  it("Cancel does not apply a draft", () => {
    const apply = vi.fn(),
      close = vi.fn();
    render(<VoiceoverDialog voices={["SRK"]} selected={null} onApply={apply} onClose={close} />);
    fireEvent.click(screen.getByRole("radio", { name: "SRK" }));
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(apply).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
  it("offers only supported voices and requires a choice", () => {
    const apply = vi.fn();
    render(
      <VoiceoverDialog
        voices={["Salman Khan", "Modi ji", "SRK"]}
        selected={null}
        onApply={apply}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByText("learning.workspace.original_audio")).toBeNull();
    const button = screen.getByRole("button", {
      name: "learning.workspace.apply_voice",
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "SRK" }));
    expect(button.disabled).toBe(false);
  });
  it("filters course lessons and selects a result", () => {
    const select = vi.fn();
    render(
      <LessonPicker modules={modules} currentLesson={modules[0].lessons[0]} onSelect={select} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /learning.workspace.course_contents/,
      }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Second" },
    });
    expect(screen.queryByRole("button", { name: "First lesson" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Second lesson" }));
    expect(select).toHaveBeenCalledWith(modules[0].lessons[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows no-results feedback", () => {
    render(
      <LessonPicker modules={modules} currentLesson={modules[0].lessons[0]} onSelect={() => {}} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /learning.workspace.course_contents/,
      }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "not-found" },
    });
    expect(screen.getByText("learning.workspace.no_results")).toBeTruthy();
  });
  it("restores trigger focus after Escape", () => {
    render(
      <LessonPicker modules={modules} currentLesson={modules[0].lessons[0]} onSelect={() => {}} />,
    );
    const trigger = screen.getByRole("button", {
      name: /learning.workspace.course_contents/,
    });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("portals the drawer outside its transformed parent and restores scrolling", () => {
    const route = document.createElement("div");
    route.className = "app-route-scroll";
    route.style.overflow = "auto";
    document.body.append(route);
    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <div data-testid="ancestor" style={{ transform: "translateY(0)" }}>
          <AITranscript
            id="drawer"
            isDrawer
            isOpen={open}
            isLoading={false}
            onClose={() => setOpen(false)}
            captions={[]}
            currentTime={0}
            activeCaptionRef={{ current: null }}
            containerRef={{ current: null }}
            onTranscriptClick={() => {}}
            formatTime={String}
          />
        </div>
      );
    };
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "learning.transcript" });
    expect(screen.getByTestId("ancestor").contains(dialog)).toBe(false);
    expect(route.style.overflow).toBe("hidden");
    fireEvent.mouseDown(dialog.parentElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(route.style.overflow).toBe("auto");
    route.remove();
  });
  it("wraps focus to Cancel while Apply is disabled", () => {
    render(
      <VoiceoverDialog voices={["SRK"]} selected={null} onApply={() => {}} onClose={() => {}} />,
    );
    const first = screen.getByRole("button", {
      name: "learning.workspace.close",
    });
    const cancel = screen.getByRole("button", { name: "common.cancel" });
    const apply = screen.getByRole("button", {
      name: "learning.workspace.apply_voice",
    });
    expect(apply.disabled).toBe(true);
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });
  it("includes Apply in the focus loop after choosing a voice", () => {
    render(
      <VoiceoverDialog voices={["SRK"]} selected={null} onApply={() => {}} onClose={() => {}} />,
    );
    const first = screen.getByRole("button", {
      name: "learning.workspace.close",
    });
    const apply = screen.getByRole("button", {
      name: "learning.workspace.apply_voice",
    });
    fireEvent.click(screen.getByRole("radio", { name: "SRK" }));
    expect(apply.disabled).toBe(false);
    apply.focus();
    fireEvent.keyDown(apply, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(apply);
  });
  it("marks only one transcript cue at a shared boundary", () => {
    render(
      <AITranscript
        id="cues"
        isOpen
        isLoading={false}
        onClose={() => {}}
        captions={[
          { start: 0, end: 10, text: "First" },
          { start: 10, end: 20, text: "Second" },
        ]}
        currentTime={10}
        activeCaptionRef={{ current: null }}
        containerRef={{ current: null }}
        onTranscriptClick={() => {}}
        formatTime={String}
      />,
    );
    expect(screen.getByRole("button", { name: /First/ }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: /Second/ }).getAttribute("aria-current")).toBe(
      "true",
    );
  });
  it("shows a Play button on initial load instead of forcing voice selection", () => {
    const play = vi.fn();
    render(
      <VideoPlayer
        togglePlay={play}
        currentLesson={{ id: "l1" }}
        celebrityVideoMap={{}}
        videoRef={{ current: null }}
        playerContainerRef={{ current: null }}
        isPlaying={false}
        volume={1}
        progress={0}
        formatTime={String}
      />,
    );
    expect(screen.getByRole("button", { name: "learning.workspace.play" })).toBeTruthy();
    expect(screen.queryByText("learning.workspace.choose_voice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "learning.workspace.play" }));
    expect(play).toHaveBeenCalledOnce();
  });
});

describe("Player and study polish regressions", () => {
  const playerProps = () => ({
    videoRef: { current: null },
    playerContainerRef: { current: null },
    selectedCelebrity: "SRK",
    aiVideoUrl: "https://cdn.test/video.mp4",
    isPlaying: false,
    volume: 1,
    progress: 0,
    formatTime: String,
    togglePlay: vi.fn(),
    handleVolumeChange: vi.fn(),
    handleProgress: vi.fn(),
  });
  it("shows the active module in the course contents trigger", () => {
    render(
      <LessonPicker modules={modules} currentLesson={modules[0].lessons[0]} onSelect={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: /learning.workspace.course_contents/ }).textContent,
    ).toContain("Module One");
  });
  it("shows lesson metadata inside the player without a permanent footer", () => {
    render(
      <VideoPlayer
        {...playerProps()}
        title="Using useEffect Hook"
        moduleTitle="Module 4: React Hooks Fundamentals"
      />,
    );
    expect(screen.getByText("Using useEffect Hook").closest(".lw-player-title")).toBeTruthy();
    expect(
      screen.getByText("Module 4: React Hooks Fundamentals").closest(".lw-player-title"),
    ).toBeTruthy();
    expect(document.querySelector(".lw-media-footer")).toBeNull();
  });
  it("does not offer generation cancellation for an available video", () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const props = playerProps();
    render(<VideoPlayer {...props} isAIVideoLoading onCancelGeneration={vi.fn()} />);
    expect(screen.queryByText("learning.workspace.generating")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "learning.workspace.cancel_generation" }),
    ).toBeNull();
  });
  it("shows media buffering separately from generation", () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const props = playerProps();
    render(<VideoPlayer {...props} />);
    fireEvent.waiting(document.querySelector("video"));
    expect(screen.getByRole("status").textContent).toContain("learning.player.loading_video");
    expect(screen.queryByText("learning.workspace.generating")).toBeNull();
    fireEvent.canPlay(document.querySelector("video"));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("changes real playback speed and clamps skip controls to the duration", () => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(21);
    const props = playerProps();
    render(<VideoPlayer {...props} />);
    const video = document.querySelector("video");
    fireEvent.click(screen.getByRole("button", { name: "learning.player.settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /learning.player.speed/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1.5×" }));
    expect(video.playbackRate).toBe(1.5);
    video.currentTime = 19;
    fireEvent.click(screen.getByRole("button", { name: "learning.player.forward" }));
    expect(video.currentTime).toBe(21);
    video.currentTime = 2;
    fireEvent.click(screen.getByRole("button", { name: "learning.player.rewind" }));
    expect(video.currentTime).toBe(0);
  });
  it("pauses playback when a study or voice dialog blocks the player", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    render(<VideoPlayer {...playerProps()} isPlaying playbackBlocked />);
    expect(pause).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
  it("portals study outside a contained page and restores trigger focus", async () => {
    fetchFlashcardDeck.mockResolvedValue({ deck: null });
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <div data-testid="study-parent" style={{ transform: "translateY(0)" }}>
          <button onClick={() => setOpen(true)}>Study</button>
          <FlashcardStudy
            open={open}
            onClose={() => setOpen(false)}
            courseId="1"
            lessonId="l1"
            lessonTitle="Lesson"
            transcript="Text"
          />
        </div>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Study" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Lesson" });
    expect(screen.getByTestId("study-parent").contains(dialog)).toBe(false);
    expect(dialog.parentElement.parentElement).toBe(document.body);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("generates the selected card count and exposes only the current card face", async () => {
    fetchFlashcardDeck.mockResolvedValue({ deck: null });
    generateFlashcardDeck.mockResolvedValue({
      deck: {
        id: "d",
        cards: [{ id: "c", front: "Question text", back: "Answer text", mastered: false }],
      },
    });
    updateFlashcardMastery.mockResolvedValue({
      deck: {
        id: "d",
        cards: [{ id: "c", front: "Question text", back: "Answer text", mastered: true }],
      },
    });
    render(
      <FlashcardStudy
        open
        onClose={() => {}}
        courseId="1"
        lessonId="l1"
        lessonTitle="Lesson"
        transcript="Text"
      />,
    );
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "8" }));
    fireEvent.click(screen.getByRole("button", { name: "learning.study.generate" }));
    await waitFor(() => expect(screen.getByText("Question text")).toBeTruthy());
    expect(generateFlashcardDeck).toHaveBeenCalledWith({
      courseId: "1",
      lessonId: "l1",
      transcript: "Text",
      count: 8,
    });
    expect(screen.queryByText("Answer text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "learning.study.show_answer" }));
    expect(screen.getByText("Answer text")).toBeTruthy();
    expect(screen.queryByText("Question text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "learning.study.mark" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "learning.study.unmark" })).toBeTruthy(),
    );
    expect(updateFlashcardMastery).toHaveBeenCalledWith("d", "c", true);
  });
});
