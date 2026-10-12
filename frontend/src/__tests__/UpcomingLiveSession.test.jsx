import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import UpcomingLiveSession from "../components/UpcomingLiveSession";
afterEach(cleanup);
describe("UpcomingLiveSession", () => {
  it("shows an honest empty state by default", () => {
    render(<UpcomingLiveSession />);
    expect(screen.getByText("No live sessions scheduled")).toBeDefined();
    expect(screen.queryByRole("button", { name: /join session/i })).toBeNull();
  });
  it("renders supplied sessions and joins through the callback", () => {
    const onJoin = vi.fn();
    const { container } = render(
      <UpcomingLiveSession
        sessions={[{ id: "s1", title: "Node.js Microservices", time: "Tomorrow · 5:00 PM" }]}
        onJoin={onJoin}
      />,
    );
    const joinButton = container.querySelector(
      'button[aria-label="Join session Node.js Microservices"]',
    );
    expect(joinButton).not.toBeNull();
    joinButton.click();
    expect(onJoin).toHaveBeenCalledTimes(1);
  });
});
