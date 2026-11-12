
import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import SignUpPage from "../pages/SignUpPage.jsx";

const {
  mockLogin,
  mockNavigate,
  mockApiFetch,
  mockToastSuccess,
  mockToastError,
  mockToggleTheme,
} = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockNavigate: vi.fn(),
  mockApiFetch: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockToggleTheme: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    isDark: false,
    toggleTheme: mockToggleTheme,
  }),
}));

vi.mock("../lib/api", () => ({
  apiFetch: mockApiFetch,
  default: "http://localhost:5000",
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

vi.mock("../components/auth/AuthLayout", () => ({
  default: ({ children, title }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("../components/auth/SocialLogin", () => ({
  default: () => <div>Social Login</div>,
}));

const renderSignUpPage = () =>
  render(
    <HelmetProvider>
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    </HelmetProvider>,
  );

const fillSignUpForm = ({
  firstName = "John",
  lastName = "Doe",
  email = "john@example.com",
  username = "johndoe",
  password = "Password1!",
} = {}) => {
  fireEvent.change(screen.getByPlaceholderText("John"), {
    target: { value: firstName },
  });

  fireEvent.change(screen.getByPlaceholderText("Doe"), {
    target: { value: lastName },
  });

  fireEvent.change(screen.getByPlaceholderText("Enter your email here"), {
    target: { value: email },
  });

  fireEvent.change(screen.getByPlaceholderText("Enter your username here"), {
    target: { value: username },
  });

  fireEvent.change(document.querySelector('input[type="password"]'), {
    target: { value: password },
  });
};

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows an error when first name is missing", async () => {
    renderSignUpPage();

    fillSignUpForm({ firstName: "" });

    fireEvent.submit(screen.getByRole("button", { name: "Sign Up" }).closest("form"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("First name is required");
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("shows an error when password has no uppercase letter", async () => {
    renderSignUpPage();

    fillSignUpForm({ password: "password1!" });

    fireEvent.submit(screen.getByRole("button", { name: "Sign Up" }).closest("form"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Password must contain at least one uppercase letter",
      );
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("shows an error when password has no symbol", async () => {
    renderSignUpPage();

    fillSignUpForm({ password: "Password123" });

    fireEvent.submit(screen.getByRole("button", { name: "Sign Up" }).closest("form"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Password must contain at least one symbol",
      );
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("updates the password checklist when the password changes", () => {
    renderSignUpPage();

    const passwordInput = document.querySelector('input[type="password"]');
    const uppercaseItem = screen.getByText("Uppercase").parentElement;

    expect(uppercaseItem).toHaveClass("text-gray-400");

    fireEvent.change(passwordInput, {
      target: { value: "Password1!" },
    });

    expect(uppercaseItem).toHaveClass("text-green-500");
    expect(screen.getByText("8+ Characters").parentElement).toHaveClass(
      "text-green-500",
    );
    expect(screen.getByText("Symbol").parentElement).toHaveClass("text-green-500");
  });

  it("registers the user and redirects after successful signup", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ token: "test-token", user: { name: "John" } }),
    });

    renderSignUpPage();

    fillSignUpForm();

    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/auth/register",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(mockLogin).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/complete-profile");
      expect(mockToastSuccess).toHaveBeenCalledWith("Account created successfully!");
    });
  });

  it("shows an error when the signup API fails", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Email already exists" }),
    });

    renderSignUpPage();

    fillSignUpForm();

    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
