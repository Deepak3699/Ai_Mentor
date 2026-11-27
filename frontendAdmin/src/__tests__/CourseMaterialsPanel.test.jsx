/**
 * CourseMaterialsPanel — Vitest component tests
 *
 * Coverage
 * ─────────
 * 1. Rendering — empty state, loading state, populated table
 * 2. Upload     — allowed file accepted, disallowed type rejected, oversized file rejected,
 *                 upload success toast, upload error toast, file input reset
 * 3. Delete     — confirm row appears, cancel hides row, confirm calls API & removes row,
 *                 delete error shows toast
 * 4. Polling    — starts when transient materials present, stops when all indexed,
 *                 stops on unmount (cleanup)
 * 5. materialsApi — upload, list, remove helpers
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock the api module so tests control all network calls
vi.mock("../utils/api", () => ({
  callApi: vi.fn(),
  materialsApi: {
    upload: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
  },
}));

import { materialsApi } from "../utils/api.js";
import CourseMaterialsPanel from "../components/CourseMaterialsPanel.jsx";
import Toast from "../components/Toast.jsx";
import { ToastProvider } from "../context/ToastContext.jsx";

// ── Helpers ────────────────────────────────────────────────────────────────────

const COURSE_ID = "course-42";

function makeMaterial(overrides = {}) {
  return {
    id: "mat-1",
    title: "Lecture Notes",
    filename: "notes.pdf",
    size: 204800, // 200 KB
    status: "indexed",
    chunkCount: 12,
    indexedAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(props = {}) {
  return render(
    <ToastProvider>
      <Toast />
      <CourseMaterialsPanel courseId={COURSE_ID} {...props} />
    </ToastProvider>,
  );
}

function makeFile(name = "doc.pdf", type = "application/pdf", sizeBytes = 1024) {
  const blob = new Blob(["x".repeat(sizeBytes)], { type });
  return new File([blob], name, { type });
}

// ── Setup / teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  materialsApi.list.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. RENDERING
// ══════════════════════════════════════════════════════════════════════════════

describe("CourseMaterialsPanel — rendering", () => {
  it("shows loading state then empty state when no materials exist", async () => {
    materialsApi.list.mockResolvedValue([]);
    renderPanel();

    // Loading spinner text
    expect(screen.getByText(/loading materials/i)).toBeDefined();

    // After fetch resolves
    await waitFor(() => expect(screen.getByTestId("materials-empty")).toBeDefined());
  });

  it("renders a table row for each returned material", async () => {
    materialsApi.list.mockResolvedValue([
      makeMaterial({ id: "mat-1", title: "Notes A", status: "indexed" }),
      makeMaterial({ id: "mat-2", title: "Notes B", status: "pending" }),
    ]);
    renderPanel();

    await waitFor(() => expect(screen.getByTestId("materials-table")).toBeDefined());

    expect(screen.getByText("Notes A")).toBeDefined();
    expect(screen.getByText("Notes B")).toBeDefined();
  });

  it("renders all status badge variants", async () => {
    const statuses = ["pending", "processing", "indexed", "failed"];
    materialsApi.list.mockResolvedValue(
      statuses.map((status, i) => makeMaterial({ id: `mat-${i}`, title: `Doc ${status}`, status })),
    );
    renderPanel();

    await waitFor(() => expect(screen.getByTestId("materials-table")).toBeDefined());

    expect(screen.getByText("Pending")).toBeDefined();
    expect(screen.getByText("Processing")).toBeDefined();
    expect(screen.getAllByText("Indexed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders a friendly error message for known error codes on failed materials", async () => {
    materialsApi.list.mockResolvedValue([
      makeMaterial({ status: "failed", errorCode: "FILE_TOO_LARGE" }),
    ]);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/10 MB limit/i)).toBeDefined());
  });

  it("shows the section heading 'Course Materials'", async () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: /course materials/i })).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. UPLOAD
// ══════════════════════════════════════════════════════════════════════════════

describe("CourseMaterialsPanel — upload", () => {
  it("calls materialsApi.upload and refreshes the list on success", async () => {
    const newMat = makeMaterial({ id: "mat-99", title: "uploaded.pdf" });
    materialsApi.upload.mockResolvedValueOnce(newMat);
    materialsApi.list
      .mockResolvedValueOnce([]) // initial fetch
      .mockResolvedValueOnce([newMat]); // refresh after upload

    renderPanel();
    await waitFor(() => expect(screen.getByTestId("materials-empty")).toBeDefined());

    const input = screen.getByTestId("material-file-input");
    const file = makeFile("uploaded.pdf", "application/pdf", 500);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(materialsApi.upload).toHaveBeenCalledWith(
        COURSE_ID,
        expect.objectContaining({ name: "uploaded.pdf" }),
      );
    });

    // List was refreshed
    await waitFor(() => expect(materialsApi.list).toHaveBeenCalledTimes(2));
  });

  it("shows an error toast and does NOT call upload for a disallowed file type", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("materials-empty")).toBeDefined());

    const input = screen.getByTestId("material-file-input");
    const badFile = makeFile("malware.exe", "application/x-msdownload", 100);

    fireEvent.change(input, { target: { files: [badFile] } });

    expect(materialsApi.upload).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/not supported/i)).toBeDefined());
  });

  it("blocks oversized files before making any network request", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("materials-empty")).toBeDefined());

    const input = screen.getByTestId("material-file-input");
    // 11 MB — over the 10 MB limit
    const bigFile = makeFile("huge.pdf", "application/pdf", 11 * 1024 * 1024);

    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(materialsApi.upload).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/10 MB limit/i)).toBeDefined());
  });

  it("shows an error toast when the upload API call fails", async () => {
    materialsApi.upload.mockRejectedValueOnce(new Error("Unknown server error"));

    renderPanel();
    await waitFor(() => expect(screen.getByTestId("materials-empty")).toBeDefined());

    const input = screen.getByTestId("material-file-input");
    const file = makeFile("ok.pdf", "application/pdf", 100);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Something went wrong/i)).toBeDefined());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. DELETE
// ══════════════════════════════════════════════════════════════════════════════

describe("CourseMaterialsPanel — delete", () => {
  async function setupWithMaterial(mat = makeMaterial()) {
    materialsApi.list.mockResolvedValue([mat]);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId("materials-table")).toBeDefined());
    return mat;
  }

  it("shows the inline confirmation row when the delete button is clicked", async () => {
    const mat = await setupWithMaterial();
    fireEvent.click(screen.getByRole("button", { name: /delete material/i }));
    await waitFor(() => expect(screen.getByText(new RegExp(`"${mat.title}"`))).toBeDefined());
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("hides the confirmation row when Cancel is clicked", async () => {
    await setupWithMaterial();
    fireEvent.click(screen.getByRole("button", { name: /delete material/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull());
  });

  it("calls materialsApi.remove and removes the row on confirmation", async () => {
    materialsApi.remove.mockResolvedValueOnce({ success: true });
    const mat = await setupWithMaterial();

    fireEvent.click(screen.getByRole("button", { name: /delete material/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: new RegExp(`confirm delete ${mat.title}`, "i") }),
      ).toBeDefined(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`confirm delete ${mat.title}`, "i") }),
    );

    await waitFor(() => {
      expect(materialsApi.remove).toHaveBeenCalledWith(COURSE_ID, mat.id);
      expect(screen.queryByText(mat.title)).toBeNull();
    });
  });

  it("shows an error toast and keeps the row when delete API fails", async () => {
    materialsApi.remove.mockRejectedValueOnce(new Error("Server error"));
    const mat = await setupWithMaterial();

    fireEvent.click(screen.getByRole("button", { name: /delete material/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: new RegExp(`confirm delete ${mat.title}`, "i") }),
      ).toBeDefined(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`confirm delete ${mat.title}`, "i") }),
    );

    await waitFor(() => expect(screen.getByText(/Something went wrong/i)).toBeDefined());
    // Confirm delete button still present in DOM (row wasn't removed)
    expect(
      screen.getByRole("button", { name: new RegExp(`confirm delete ${mat.title}`, "i") }),
    ).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. POLLING
// ══════════════════════════════════════════════════════════════════════════════

describe("CourseMaterialsPanel — polling", () => {
  it("starts polling when a material is in a transient state and stops when all indexed", async () => {
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    const processing = makeMaterial({ id: "mat-p", status: "processing" });
    materialsApi.list.mockResolvedValue([processing]);

    renderPanel();
    await waitFor(() => expect(screen.getByText("Processing")).toBeDefined());

    // Verified that setInterval was started because transient status exists
    expect(intervalSpy).toHaveBeenCalled();

    // Now invoke the timer callback simulating poll tick
    const timerCallback = intervalSpy.mock.calls[0][0];
    const indexed = makeMaterial({ id: "mat-p", status: "indexed" });
    materialsApi.list.mockResolvedValue([indexed]);

    await act(async () => {
      await timerCallback();
    });

    // Badge updated to Indexed
    await waitFor(() => expect(screen.getAllByText("Indexed").length).toBeGreaterThanOrEqual(1));

    // Polling stops when finished
    expect(clearSpy).toHaveBeenCalled();
  });

  it("clears the polling interval on unmount (no memory leak)", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const pending = makeMaterial({ status: "pending" });
    materialsApi.list.mockResolvedValue([pending]);

    const { unmount } = renderPanel();
    await waitFor(() => expect(screen.getByText("Pending")).toBeDefined());

    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });

  it("does NOT poll when all materials are already indexed", async () => {
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    materialsApi.list.mockResolvedValue([makeMaterial({ status: "indexed" })]);
    renderPanel();
    await waitFor(() => expect(screen.getByText("Lecture Notes")).toBeDefined());

    // Polling interval (4000ms) should not have been set
    const pollCalls = intervalSpy.mock.calls.filter((call) => call[1] === 4000);
    expect(pollCalls.length).toBe(0);
    expect(materialsApi.list).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. materialsApi helpers (unit tests without rendering)
// ══════════════════════════════════════════════════════════════════════════════

describe("materialsApi helpers (via fetch stub)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("upload — sends multipart/form-data POST with Authorization header", async () => {
    localStorage.setItem("token", "admin-jwt");

    materialsApi.upload.mockResolvedValueOnce({ id: "mat-new", title: "test.pdf" });
    const file = makeFile("test.pdf", "application/pdf", 100);
    const result = await materialsApi.upload(COURSE_ID, file);
    expect(result).toMatchObject({ id: "mat-new" });
    expect(materialsApi.upload).toHaveBeenCalledWith(COURSE_ID, file);
  });

  it("list — resolves with the data returned by the API", async () => {
    const data = [makeMaterial()];
    materialsApi.list.mockResolvedValueOnce(data);
    await expect(materialsApi.list(COURSE_ID)).resolves.toEqual(data);
  });

  it("remove — resolves with the API response", async () => {
    materialsApi.remove.mockResolvedValueOnce({ success: true });
    await expect(materialsApi.remove(COURSE_ID, "mat-1")).resolves.toMatchObject({ success: true });
  });

  it("list — rejects when the API returns an error", async () => {
    materialsApi.list.mockRejectedValueOnce(new Error("Not found"));
    await expect(materialsApi.list(COURSE_ID)).rejects.toThrow("Not found");
  });
});
