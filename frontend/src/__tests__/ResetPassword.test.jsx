
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ResetPassword from "../pages/ResetPassword.jsx";

const { mockAxiosPost, mockNavigate, mockGetErrorMessage } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
  mockNavigate: vi.fn(),
  mockGetErrorMessage: vi.fn((err, fallback) => err?.message || fallback),
}));

vi.mock("axios", () => ({
  default: {
    post: mockAxiosPost,
  },
}));

vi.mock("../lib/errorHandling.js", () => ({
  getErrorMessage: mockGetErrorMessage,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../components/auth/AuthLayout", () => ({
  default: ({ children, title }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const renderResetPassword = () =>
  render(
    <MemoryRouter initialEntries={["/reset-password/test-token"]}>
      <Routes>
        <Route path="/reset-password/:token" element={<ResetPassword />} />
      </Routes>
    </MemoryRouter>,
  );

const fillResetForm = (password, confirmPassword) => {
  const inputs = document.querySelectorAll('input');

  fireEvent.change(inputs[0], {
    target: { value: password },
  });

  fireEvent.change(inputs[1], {
    target: { value: confirmPassword },
  });
};

describe("ResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows an error when password is shorter than 8 characters", async () => {
    renderResetPassword();

    fillResetForm("Pass1!", "Pass1!");

    fireEvent.submit(
      screen.getByRole("button", { name: "Reset Password" }).closest("form"),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeInTheDocument();
    });

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("shows an error when passwords do not match", async () => {
    renderResetPassword();

    fillResetForm("Password1!", "Password2!");

    fireEvent.submit(
      screen.getByRole("button", { name: "Reset Password" }).closest("form"),
    );

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("resets password and shows success message after successful API request", async () => {
    mockAxiosPost.mockResolvedValue({ data: { message: "Success" } });

    renderResetPassword();

    fillResetForm("Password1!", "Password1!");

    fireEvent.submit(
      screen.getByRole("button", { name: "Reset Password" }).closest("form"),
    );

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/reset-password/test-token"),
        { password: "Password1!" },
      );

      expect(
        screen.getByText(
          "Password has been reset successfully! Redirecting you to login...",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows an error when the reset password API fails", async () => {
    mockAxiosPost.mockRejectedValue(new Error("Reset failed"));

    renderResetPassword();

    fillResetForm("Password1!", "Password1!");

    fireEvent.submit(
      screen.getByRole("button", { name: "Reset Password" }).closest("form"),
    );

    await waitFor(() => {
      expect(screen.getByText("Reset failed")).toBeInTheDocument();
    });
  });

  it("toggles password visibility", () => {
    renderResetPassword();

    const passwordInput = document.querySelectorAll("input")[0];

    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "" }));

    expect(passwordInput).toHaveAttribute("type", "text");
  });
});
