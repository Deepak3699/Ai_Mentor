import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage.jsx";
import userEvent from "@testing-library/user-event";

const { mockLogin } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../components/auth/AuthLayout.jsx", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/auth/SocialLogin", () => ({
  default: () => <div>Social Login</div>,
}));

describe("LoginPage accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderLoginPage = () =>
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

  it("associates email and password labels with their inputs", () => {
    renderLoginPage();

    expect(screen.getByLabelText("Email Address")).toHaveAttribute("id", "login-email");

    expect(screen.getByLabelText("Password")).toHaveAttribute("id", "login-password");
  });
  it("focuses the correct input when its label is clicked", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const emailInput = screen.getByLabelText("Email Address");
    const passwordInput = screen.getByLabelText("Password");

    await user.click(screen.getByText("Email Address"));
    expect(emailInput).toHaveFocus();

    await user.click(screen.getByText("Password"));
    expect(passwordInput).toHaveFocus();
  });
  it("toggles password visibility with accessible button names", () => {
    renderLoginPage();

    const passwordInput = screen.getByLabelText("Password");

    const showButton = screen.getByRole("button", {
      name: "Show password",
    });

    expect(showButton).toHaveAttribute("aria-pressed", "false");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(showButton);

    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(passwordInput).toHaveAttribute("type", "text");
  });
  it("displays accessible validation errors for invalid login input", async () => {
    renderLoginPage();

    const emailInput = screen.getByLabelText("Email Address");
    const passwordInput = screen.getByLabelText("Password");

    fireEvent.change(emailInput, {
      target: { value: "invalid-email" },
    });

    fireEvent.submit(emailInput.closest("form"));

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();

    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(emailInput).toHaveAttribute("aria-describedby", "login-email-error");

    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput).toHaveAttribute("aria-describedby", "login-password-error");
  });
});
