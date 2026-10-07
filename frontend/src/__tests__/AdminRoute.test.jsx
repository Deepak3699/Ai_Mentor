import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AdminRoute from "../components/AdminRoute.jsx";
import { getAdminAppTarget } from "../lib/adminApp.js";

let mockAuthState = {
  isAuthenticated: false,
  user: null,
};

vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
};

const renderAdminRoute = (initialPath = "/admin") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={null} />
          <Route path="/admin/users" element={null} />
          <Route path="/admin/courses" element={null} />
        </Route>
        <Route path="/login" element={<LocationProbe />} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe("AdminRoute", () => {
  let originalLocation;
  let replace;

  beforeEach(() => {
    mockAuthState = {
      isAuthenticated: false,
      user: null,
    };

    originalLocation = window.location;
    replace = vi.fn();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        replace,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    cleanup();
    vi.restoreAllMocks();
  });

  it("sends unauthenticated users through the existing login flow", async () => {
    renderAdminRoute();

    expect(await screen.findByTestId("location")).toHaveTextContent("/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("blocks normal users from reaching the admin application", async () => {
    mockAuthState = {
      isAuthenticated: true,
      user: { role: "user", isProfileComplete: true },
    };

    renderAdminRoute("/admin/users");

    expect(await screen.findByTestId("location")).toHaveTextContent("/");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects admins to the supported admin application", async () => {
    mockAuthState = {
      isAuthenticated: true,
      user: { role: "admin", isProfileComplete: true },
    };

    renderAdminRoute("/admin/courses");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("http://localhost:5174/courses")
    );
  });

  it("redirects superadmins to the supported admin application", async () => {
    mockAuthState = {
      isAuthenticated: true,
      user: { role: "superadmin", isProfileComplete: true },
    };

    renderAdminRoute("/admin/users");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("http://localhost:5174/users")
    );
  });

  it("maps the learner admin root to the admin dashboard", () => {
    expect(getAdminAppTarget("/admin")).toBe("http://localhost:5174/dashboard");
  });
});
