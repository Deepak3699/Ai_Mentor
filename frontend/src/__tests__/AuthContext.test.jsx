import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext.jsx";

vi.mock("firebase/auth", () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../firebase.js", () => ({
  auth: {},
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
  SESSION_EXPIRED_EVENT: "auth:session-expired",
}));

const TestConsumer = () => {
  const { logout, isAuthenticated, user } = useAuth();
  return (
    <div>
      <span data-testid="auth-state">{isAuthenticated ? "logged-in" : "logged-out"}</span>
      <span data-testid="user-state">{user ? user.email : "no-user"}</span>
      <button data-testid="logout-btn" onClick={() => logout()}>
        Log Out
      </button>
    </div>
  );
};

describe("AuthContext logout preferences preservation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("removes user and session data while retaining device preferences", async () => {
    // Populate session, user-specific, and progress data
    localStorage.setItem("token", "jwt-token-xyz");
    localStorage.setItem("user", JSON.stringify({ email: "learner@example.com" }));
    localStorage.setItem("preferencesSkipped", "true");
    localStorage.setItem("streak", "7");
    localStorage.setItem("lastLogin", "2026-10-07");
    localStorage.setItem("calendarTasks", JSON.stringify([{ id: 1, title: "Study" }]));
    localStorage.setItem("course-progress-react-101", JSON.stringify({ completed: 5 }));
    localStorage.setItem("course-progress-python", JSON.stringify({ completed: 2 }));

    // Populate device/client preferences that must be preserved
    localStorage.setItem("theme", "dark");
    localStorage.setItem("i18nextLng", "es");
    localStorage.setItem("sidebarCollapsed", "true");

    const clearSpy = vi.spyOn(Storage.prototype, "clear");

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByTestId("auth-state").textContent).toBe("logged-in");

    // Perform logout
    fireEvent.click(screen.getByTestId("logout-btn"));

    // 1. Verify user/auth data is cleared
    await waitFor(() => {
      expect(localStorage.getItem("token")).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(localStorage.getItem("preferencesSkipped")).toBeNull();
      expect(localStorage.getItem("streak")).toBeNull();
      expect(localStorage.getItem("lastLogin")).toBeNull();
      expect(localStorage.getItem("calendarTasks")).toBeNull();
      expect(localStorage.getItem("course-progress-react-101")).toBeNull();
      expect(localStorage.getItem("course-progress-python")).toBeNull();
    });

    // 2. Verify device-level preferences are preserved
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(localStorage.getItem("i18nextLng")).toBe("es");
    expect(localStorage.getItem("sidebarCollapsed")).toBe("true");

    // 3. Verify no indiscriminate localStorage.clear() was invoked
    expect(clearSpy).not.toHaveBeenCalled();

    // 4. Verify auth state reflects logout
    expect(screen.getByTestId("auth-state").textContent).toBe("logged-out");
    expect(screen.getByTestId("user-state").textContent).toBe("no-user");
  });
});
