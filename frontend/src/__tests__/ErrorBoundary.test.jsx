import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ErrorBoundary from "../components/common/ErrorBoundary";

// A dummy component that we can tell to crash on command
const CrashingComponent = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error("Simulated render crash");
  }
  return <div>Healthy Component Content</div>;
};

describe("ErrorBoundary", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Suppress console.error in the terminal during intentional error tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // 1. Unmounts React components
    cleanup();
    // 2. Physically wipes the DOM clean so tests never leak elements into each other
    document.body.innerHTML = "";
    // 3. Restores console.error
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <CrashingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Healthy Component Content")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("catches render errors and displays the fallback screen with role alert", () => {
    render(
      <ErrorBoundary>
        <CrashingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    // 1. Checks accessibility alert role
    const alertElement = screen.getByRole("alert");
    expect(alertElement).toBeTruthy();

    // 2. Checks heading and helpful message
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(
      screen.getByText(/An unexpected error occurred while rendering this page/i),
    ).toBeTruthy();

    // 3. Checks recovery actions (Reload button and Dashboard link)
    expect(screen.getByRole("button", { name: /reload page/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toBeTruthy();
  });

  it("logs unhandled error details with console.error", () => {
    render(
      <ErrorBoundary>
        <CrashingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("renders custom fallback prop when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error Fallback</div>}>
        <CrashingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom Error Fallback")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
