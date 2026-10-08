import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ConfirmDeleteModal from "../components/ConfirmDeleteModal.jsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("course deletion confirmation", () => {
  it("renders nothing while closed and closes on Escape", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      React.createElement(ConfirmDeleteModal, {
        isOpen: false,
        onClose,
        onConfirm: vi.fn(),
      }),
    );
    expect(screen.queryByText(/Delete Course/i)).toBeNull();

    rerender(
      React.createElement(ConfirmDeleteModal, {
        isOpen: true,
        onClose,
        onConfirm: vi.fn(),
        courseTitle: "Testing 101",
      }),
    );
    fireEvent.keyDown(screen.getByText("Testing 101").closest("div"), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires exact DELETE text and completed countdown", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(
      React.createElement(ConfirmDeleteModal, {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm,
        courseTitle: "Testing 101",
      }),
    );

    fireEvent.change(screen.getByPlaceholderText("Type DELETE here"), {
      target: { value: "DELETE" },
    });
    expect(screen.getByRole("button", { name: /Wait 3s/i }).disabled).toBe(
      true,
    );

    for (let second = 0; second < 3; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    const button = screen.getByRole("button", {
      name: /Yes, Delete Permanently/i,
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
