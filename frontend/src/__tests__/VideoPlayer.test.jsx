import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { apiFetch } from "../lib/api";
import VideoPlayer from "../components/video/VideoPlayer";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));

const localVideoUrl = "/api/ai/video/12/4f302af1-908a-4d00-a3c1-95aef52373e3.mp4";

const renderPlayer = (aiVideoUrl = localVideoUrl) =>
  render(
    <VideoPlayer
      currentLesson={{ id: 5 }}
      aiVideoUrl={aiVideoUrl}
      selectedCelebrity={null}
      celebrityVideoMap={{}}
      playerContainerRef={React.createRef()}
      videoRef={React.createRef()}
      handleProgress={vi.fn()}
      isAIVideoLoading={false}
      isPlaying={false}
      volume={1}
      isMuted={false}
      progress={0}
      isFullscreen={false}
      duration={0}
      currentTime={0}
      togglePlay={vi.fn()}
      handleVolumeChange={vi.fn()}
      toggleMute={vi.fn()}
      handleSeek={vi.fn()}
      toggleFullscreen={vi.fn()}
      formatTime={(time) => String(time)}
      onEnded={vi.fn()}
    />,
  );

describe("VideoPlayer authenticated AI video playback", () => {
  let createObjectUrl;
  let revokeObjectUrl;
  let originalCreateObjectUrl;
  let originalRevokeObjectUrl;

  beforeEach(() => {
    originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    createObjectUrl = vi.fn(() => "blob:authenticated-video");
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    cleanup();
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    } else {
      delete URL.createObjectURL;
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    } else {
      delete URL.revokeObjectURL;
    }
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("fetches the protected proxy and plays its blob URL", async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["video"]),
    });

    const { container, unmount } = renderPlayer();

    await waitFor(() => {
      expect(container.querySelector("video").getAttribute("src")).toBe("blob:authenticated-video");
    });
    expect(apiFetch).toHaveBeenCalledWith(
      localVideoUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:authenticated-video");
  });

  it("reports a failed authenticated video request", async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 403 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderPlayer();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Unable to load this video. Please refresh the page and try again.",
    );
  });

  it("does not fetch public Cloudinary video URLs", () => {
    renderPlayer("https://res.cloudinary.com/example/video/upload/lesson.mp4");

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
