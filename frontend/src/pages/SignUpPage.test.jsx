import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SignUpPage from "./SignUpPage.jsx";

const { mockLogin, mockNavigate, mockFetch } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockNavigate: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../lib/api", () => ({
  apiFetch: mockFetch,
  default: "http://localhost:5000",
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../components/auth/AuthLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/auth/SocialLogin", () => ({
  default: () => <div>Social Login</div>,
}));

describe("SignUpPage accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderSignUpPage = () =>
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>,
    );

  it("associates all form labels with their inputs", () => {
    renderSignUpPage();

    expect(screen.getByLabelText("First Name")).toHaveAttribute("id", "signup-first-name");

    expect(screen.getByLabelText("Last Name")).toHaveAttribute("id", "signup-last-name");

    expect(screen.getByLabelText("Email Address")).toHaveAttribute("id", "signup-email");

    expect(screen.getByLabelText("Choose a Username")).toHaveAttribute("id", "signup-username");

    expect(screen.getByLabelText("Create a Password")).toHaveAttribute("id", "signup-password");
  });

  it("focuses the correct input when its label is clicked", async () => {
    const user = userEvent.setup();
    renderSignUpPage();

    const firstNameInput = screen.getByLabelText("First Name");
    const passwordInput = screen.getByLabelText("Create a Password");

    await user.click(screen.getByText("First Name"));
    expect(firstNameInput).toHaveFocus();

    await user.click(screen.getByText("Create a Password"));
    expect(passwordInput).toHaveFocus();
  });

  it("uses appropriate autocomplete attributes", () => {
    renderSignUpPage();

    expect(screen.getByLabelText("First Name")).toHaveAttribute("autocomplete", "given-name");

    expect(screen.getByLabelText("Last Name")).toHaveAttribute("autocomplete", "family-name");

    expect(screen.getByLabelText("Email Address")).toHaveAttribute("autocomplete", "email");

    expect(screen.getByLabelText("Choose a Username")).toHaveAttribute("autocomplete", "username");

    expect(screen.getByLabelText("Create a Password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("toggles password visibility with accessible button names", () => {
    renderSignUpPage();

    const passwordInput = screen.getByLabelText("Create a Password");

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

  it("displays accessible validation errors for invalid signup input", async () => {
    renderSignUpPage();

    const form = screen
      .getByRole("button", {
        name: "Sign Up",
      })
      .closest("form");

    fireEvent.submit(form);

    expect(await screen.findByText("First name is required")).toBeInTheDocument();

    expect(screen.getByLabelText("First Name")).toHaveAttribute("aria-invalid", "true");

    expect(screen.getByLabelText("First Name")).toHaveAttribute(
      "aria-describedby",
      "signup-first-name-error",
    );

    expect(screen.getByLabelText("Last Name")).toHaveAttribute("aria-invalid", "true");

    expect(screen.getByLabelText("Email Address")).toHaveAttribute("aria-invalid", "true");

    expect(screen.getByLabelText("Choose a Username")).toHaveAttribute("aria-invalid", "true");

    expect(screen.getByLabelText("Create a Password")).toHaveAttribute("aria-invalid", "true");

    expect(screen.getByText("First name is required")).toHaveAttribute("role", "alert");
  });
});
