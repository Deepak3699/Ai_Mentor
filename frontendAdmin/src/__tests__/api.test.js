import { afterEach, describe, expect, it, vi } from "vitest";
import { callApi } from "../utils/api.js";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("admin API client", () => {
  it("adds the stored bearer token and caller headers", async () => {
    localStorage.setItem("token", "admin-token");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });

    await expect(
      callApi("/courses", { headers: { "X-Trace": "trace" } }),
    ).resolves.toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      "/api/courses",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer admin-token",
          "X-Trace": "trace",
        }),
      }),
    );
  });

  it("uses API messages and status fallbacks for failures", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ message: "Forbidden" }),
    });
    await expect(callApi("/private")).rejects.toThrow("Forbidden");

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    });
    await expect(callApi("/broken")).rejects.toThrow(
      "Request failed with status 500",
    );
  });
});
