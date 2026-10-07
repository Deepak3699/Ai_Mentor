import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../context/ThemeContext.jsx";
import ThemeToggle from "../components/common/ThemeToggle.jsx";

const ThemeValue = () => { const { theme, isDark } = useTheme(); return React.createElement("output", { "data-testid": "theme-value" }, `${theme}:${isDark}`); };

describe("learner theme behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => cleanup());

  it("uses and persists auto mode by default", async () => {
    render(React.createElement(ThemeProvider, null, React.createElement(ThemeValue)));
    expect(screen.getByTestId("theme-value").textContent).toBe("auto:false");
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("auto"));
  });

  it("restores dark mode and applies the root class", async () => {
    localStorage.setItem("theme", "dark");
    render(React.createElement(ThemeProvider, null, React.createElement(ThemeValue)));
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(screen.getByTestId("theme-value").textContent).toBe("dark:true");
  });

  it("ThemeToggle switches from light to dark", async () => {
    localStorage.setItem("theme", "light");
    render(React.createElement(ThemeProvider, null, React.createElement(ThemeToggle)));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("dark"));
  });
});
