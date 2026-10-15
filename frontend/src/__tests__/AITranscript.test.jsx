import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AITranscript from "../components/video/AITranscript";
import TranscriptToggle from "../components/video/TranscriptToggle";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => (options?.time ? `${key}:${options.time}` : key),
  }),
}));

const CAPTIONS = [
  { start: 0, end: 10, text: "First sentence." },
  { start: 10, end: 20, text: "Second sentence." },
];

const formatTime = (time) => `0:${String(Math.floor(time)).padStart(2, "0")}`;

const renderPanel = (props = {}) => {
  const onClose = vi.fn();
  const onTranscriptClick = vi.fn();
  render(
    <AITranscript
      id="panel"
      isOpen
      isLoading={false}
      onClose={onClose}
      captions={CAPTIONS}
      currentTime={12}
      activeCaptionRef={{ current: null }}
      containerRef={{ current: null }}
      onTranscriptClick={onTranscriptClick}
      formatTime={formatTime}
      {...props}
    />,
  );
  return { onClose, onTranscriptClick };
};

afterEach(cleanup);

describe("AITranscript", () => {
  it("renders the saved transcript text with timestamps in a labelled region", () => {
    renderPanel();
    const region = screen.getByRole("region", { name: "learning.transcript" });
    expect(region).toHaveProperty("id", "panel");
    expect(screen.getByText("First sentence.")).toBeTruthy();
    expect(screen.getByText("Second sentence.")).toBeTruthy();
    expect(screen.getByText("0:10")).toBeTruthy();
  });

  it("lets keyboard users jump to a timestamp through focusable buttons", () => {
    const { onTranscriptClick } = renderPanel();
    const cue = screen.getByRole("button", { name: /Second sentence\./ });
    expect(cue.tagName).toBe("BUTTON");
    expect(cue.getAttribute("title")).toBe("learning.transcript_jump_to:0:10");
    fireEvent.click(cue);
    expect(onTranscriptClick).toHaveBeenCalledWith(10);
  });

  it("marks the cue that is currently playing", () => {
    renderPanel({ currentTime: 12 });
    expect(
      screen.getByRole("button", { name: /Second sentence\./ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /First sentence\./ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("shows an unavailable message when there is no transcript", () => {
    renderPanel({ captions: [] });
    expect(screen.getByText("learning.no_transcript")).toBeTruthy();
  });

  it("shows a loading status instead of the empty message while loading", () => {
    renderPanel({ captions: [], isLoading: true });
    expect(screen.getByRole("status").textContent).toBe("learning.transcript_loading");
    expect(screen.queryByText("learning.no_transcript")).toBeNull();
    expect(
      screen.getByRole("region", { name: "learning.transcript" }).getAttribute("aria-busy"),
    ).toBe("true");
  });

  it("closes from the close button and from the Escape key", () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "learning.close_transcript" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("button", { name: /First sentence\./ }), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("is hidden from the page when closed", () => {
    renderPanel({ isOpen: false });
    expect(screen.queryByRole("region", { name: "learning.transcript" })).toBeNull();
    expect(document.getElementById("panel").hidden).toBe(true);
  });
});

describe("TranscriptToggle", () => {
  it("is a button that reports and controls the transcript panel", () => {
    const onToggle = vi.fn();
    render(<TranscriptToggle isOpen={false} onToggle={onToggle} controlsId="panel" />);
    const button = screen.getByRole("button", { name: "learning.transcript" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("panel");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects the open state", () => {
    render(<TranscriptToggle isOpen onToggle={() => {}} controlsId="panel" />);
    expect(
      screen.getByRole("button", { name: "learning.transcript" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
