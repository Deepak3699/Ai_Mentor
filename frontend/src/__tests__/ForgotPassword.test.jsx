import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ForgotPassword from "../pages/ForgotPassword.jsx";

const { mockAxiosPost, mockGetErrorMessage } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
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

vi.mock("../components/auth/AuthLayout", () => ({
  default: ({ children, title }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const renderForgotPassword = () =>
  render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>,
  );

describe("ForgotPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the forgot password form", () => {
    renderForgotPassword();

    expect(screen.getByText("Forgot Password?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reset Link" })).toBeInTheDocument();
  });

  it("shows an error when email is invalid", async () => {
    renderForgotPassword();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "invalid-email" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Send Reset Link" }).closest("form"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email address")).toBeInTheDocument();
    });

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("sends reset link and shows confirmation after successful API request", async () => {
    mockAxiosPost.mockResolvedValue({ data: { message: "Success" } });

    renderForgotPassword();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "john@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/forgot-password"),
        { email: "john@example.com" },
      );

      expect(
        screen.getByText(
          "If an account exists for john@example.com, you will receive a password reset link shortly.",
        ),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: /Back to Login/i })).toHaveAttribute("href", "/login");
  });

  it("shows an error when the forgot password API fails", async () => {
    mockAxiosPost.mockRejectedValue(new Error("Server unavailable"));

    renderForgotPassword();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "john@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(screen.getByText("Server unavailable")).toBeInTheDocument();
    });
  });

  it("provides a Back to Login link before submitting the form", () => {
    renderForgotPassword();

    expect(screen.getByRole("link", { name: /Back to Login/i })).toHaveAttribute("href", "/login");
  });
});
