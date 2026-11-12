
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../pages/LoginPage.jsx";

const {
  mockLogin,
  mockNavigate,
  mockAxiosPost,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockNavigate: vi.fn(),
  mockAxiosPost: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("axios", () => ({
  default: { post: mockAxiosPost },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../components/auth/AuthLayout.jsx", () => ({
  default: ({ children, title, subtitle }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children}
    </div>
  ),
}));

vi.mock("../components/auth/SocialLogin", () => ({
  default: () => <div>Social Login</div>,
}));

const renderLoginPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the login heading and input fields", () => {
    renderLoginPage();

    expect(screen.getByRole("heading", { name: "Welcome Back!" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LOG IN" })).toBeInTheDocument();
  });

  it("shows an error for an invalid email", async () => {
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "invalid-email" },
    });

    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: "password123" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "LOG IN" }).closest("form"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("shows an error when the password is empty", async () => {
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "learner@example.com" },
    });

    fireEvent.submit(screen.getByRole("button", { name: "LOG IN" }).closest("form"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Password is required");
    });

    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("redirects to dashboard after successful login with a complete profile", async () => {
    mockAxiosPost.mockResolvedValue({
      data: {
        token: "test-token",
        isProfileComplete: true,
        email: "learner@example.com",
      },
    });

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "learner@example.com" },
    });

    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "LOG IN" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Logged in successfully!");
  });

  it("redirects to complete-profile when the profile is incomplete", async () => {
    mockAxiosPost.mockResolvedValue({
      data: {
        token: "test-token",
        isProfileComplete: false,
      },
    });

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "learner@example.com" },
    });

    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "LOG IN" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/complete-profile");
    });
  });

  it("shows an error when the login API fails", async () => {
    mockAxiosPost.mockRejectedValue(new Error("Server error"));

    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "learner@example.com" },
    });

    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "LOG IN" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows and hides the password when the toggle button is clicked", () => {
    renderLoginPage();

    const passwordInput = document.querySelector('input[type="password"]');
    const toggleButton = passwordInput.parentElement.querySelector("button");

    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
