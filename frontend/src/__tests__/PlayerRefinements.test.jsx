import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import LessonPicker from "../components/learning/LessonPicker";
import SpeedMenu from "../components/video/SpeedMenu";
import CaptionsGlyph from "../components/video/CaptionsGlyph";
import GenerationFailure from "../components/video/GenerationFailure";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key) => key }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Player refinement controls", () => {
  it("selects a speed, restores focus and keeps its menu in the fullscreen player", () => {
    const Harness = () => {
      const containerRef = useRef(null);
      const [value, setValue] = useState(1);
      return (
        <div ref={containerRef} data-testid="player">
          <SpeedMenu value={value} onChange={setValue} containerRef={containerRef} />
        </div>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "learning.player.settings" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /learning.player.speed/ }));
    expect(screen.getByTestId("player").contains(screen.getByRole("menu"))).toBe(true);
    const normal = screen.getByRole("menuitemradio", { name: "learning.player.normal" });
    expect(normal.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(normal, { key: "ArrowDown" });
    expect(document.activeElement.textContent).toBe("1.25×");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1.5×" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /learning.player.speed/ }).textContent).toContain(
      "1.5×",
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps player controls visible while Settings is open", () => {
    render(<SpeedMenu value={1} onChange={() => {}} containerRef={{ current: document.body }} />);
    const trigger = screen.getByRole("button", { name: "learning.player.settings" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
  });
  it("uses outline and filled caption glyphs", () => {
    const { container, rerender } = render(<CaptionsGlyph active={false} />);
    expect(container.querySelector("rect").getAttribute("fill")).toBe("none");
    rerender(<CaptionsGlyph active />);
    expect(container.querySelector("rect").getAttribute("fill")).toBe("currentColor");
    expect(container.querySelector("path").getAttribute("stroke")).toBe("#111318");
  });
  it("does not expose raw diagnostics or offer retry for expired authentication", () => {
    render(
      <GenerationFailure
        error={{ type: "authentication", retryable: false, message: "private diagnostic" }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("learning.failure.authentication");
    expect(screen.queryByText("private diagnostic")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("offers status recovery for a known job and warns on uncertain submission", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <GenerationFailure
        error={{ type: "timeout", retryable: true, details: { jobId: "j" } }}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "learning.failure.check_again" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(
      <GenerationFailure
        error={{ type: "request_timeout", retryable: true, details: { submissionUncertain: true } }}
        onRetry={retry}
      />,
    );
    expect(screen.getByText("learning.failure.uncertain")).toBeTruthy();
  });
});

it("scrolls the selected lesson fully into view when contents opens", async () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  const lessons = Array.from({ length: 9 }, (_, index) => ({
    id: `lesson-${index + 1}`,
    title: `Lesson ${index + 1}`,
  }));
  render(
    <LessonPicker
      modules={[{ id: "module", title: "Long module", lessons }]}
      currentLesson={lessons[8]}
      onSelect={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /learning.workspace.course_contents/ }));
  await vi.waitFor(() =>
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest" }),
  );
  expect(screen.getByRole("button", { name: "Lesson 9" }).getAttribute("aria-current")).toBe(
    "step",
  );
});

it("shows the selected lesson and its module in the closed contents control", () => {
  const lessons = [
    { id: "a", title: "First lesson" },
    { id: "b", title: "History of React" },
  ];
  render(
    <LessonPicker
      modules={[{ id: "m", title: "Module One", lessons }]}
      currentLesson={lessons[1]}
      onSelect={() => {}}
    />,
  );
  const trigger = screen.getByRole("button", { name: /learning.workspace.course_contents/ });
  expect(trigger.textContent).toContain("History of React");
  expect(trigger.textContent).toContain("Module One");
});

describe("Caption appearance settings", () => {
  it("opens caption appearance and changes font size", () => {
    const on = vi.fn(),
      prefs = vi.fn();
    render(
      <SpeedMenu
        value={1}
        onChange={() => {}}
        containerRef={{ current: document.body }}
        captionsEnabled
        onCaptionsChange={on}
        captionLanguage="English"
        audioLanguage="English"
        captionPreferences={{
          fontSize: 100,
          fontFamily: "default",
          textColor: "#ffffff",
          backgroundOpacity: 75,
        }}
        onCaptionPreferencesChange={prefs}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "learning.player.settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /learning.workspace.captions/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "learning.player.off" }));
    expect(on).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("menuitem", { name: /Caption appearance/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Font size/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "150%" }));
    expect(prefs).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 150 }));
  });
});
