import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import en from "../i18n/locales/en.json";

const toastMock = vi.hoisted(() => {
  const fn = vi.fn();
  fn.error = vi.fn();
  return fn;
});

vi.mock("react-hot-toast", () => ({ default: toastMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, options) => {
      const template = key.split(".").reduce((acc, part) => acc?.[part], en);
      if (!template) return key;
      if (!options) return template;
      return Object.entries(options).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, replacement),
        template,
      );
    },
  }),
}));

import ExportReportButton from "../components/ExportReportButton";

let originalTitle;
let originalPrint;
let consoleError;

beforeEach(() => {
  originalTitle = document.title;
  originalPrint = window.print;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  document.title = originalTitle;
  window.print = originalPrint;
  consoleError.mockRestore();
  vi.clearAllMocks();
});

describe("ExportReportButton", () => {
  it("opens the print dialog with a dated report title and restores the original title", () => {
    let titleDuringPrint;
    window.print = vi.fn(() => {
      titleDuringPrint = document.title;
    });
    document.title = "Original Analytics Title";

    render(<ExportReportButton />);
    fireEvent.click(screen.getByRole("button", { name: en.analytics.export_report }));

    expect(window.print).toHaveBeenCalledTimes(1);
    expect(titleDuringPrint).toMatch(/^AI-Mentor-Report-\d{4}-\d{2}-\d{2}$/);
    expect(document.title).toBe("Original Analytics Title");
  });

  it("shows an error toast and restores the title when printing fails", () => {
    window.print = vi.fn(() => {
      throw new Error("Printing is unavailable");
    });
    document.title = "Original Analytics Title";

    render(<ExportReportButton />);
    fireEvent.click(screen.getByRole("button", { name: en.analytics.export_report }));

    expect(toastMock.error).toHaveBeenCalledWith(en.analytics.export_report_error);
    expect(document.title).toBe("Original Analytics Title");
  });
});
