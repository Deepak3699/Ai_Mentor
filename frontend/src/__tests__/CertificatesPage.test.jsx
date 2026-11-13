import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CertificatesPage from "../pages/CertificatesPage";

vi.mock("../lib/api", () => ({
  apiFetch: (...args) => globalThis.fetch(...args),
  default: "http://localhost:5000",
}));

vi.mock("../components/common/FloatingAssistant", () => ({
  default: () => <div data-testid="floating-assistant" />,
}));

vi.mock("../components/common/LoadingSpinner", () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, name: "Alex" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => (key === "common.retry" ? "Try again" : key),
    i18n: { language: "en" },
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <CertificatesPage />
    </MemoryRouter>,
  );

describe("Certificates API error handling (Issue #629)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows an error state when the API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderPage();

    expect(await screen.findByRole("alert")).toBeDefined();
  });

  it("retries the request when Try again is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    const retryButton = await screen.findByRole("button", {
      name: "Try again",
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ courses: [] }),
    });

    fireEvent.click(retryButton);
    expect(fetchMock).toHaveBeenCalled();

    expect(await screen.findByText("certificates.no_courses_title")).toBeDefined();
  });
  it("shows the existing empty state when the API succeeds with no courses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ courses: [] }),
      }),
    );

    renderPage();

    expect(await screen.findByText("certificates.no_courses_title")).toBeDefined();

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
