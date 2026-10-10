import { describe, it, expect, vi, afterEach } from "vitest";
import { getAIVideo } from "../service/aiService";
import { isAbortError } from "../service/aiGeneration";

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAIVideo", () => {
  it("passes the abort signal through to fetch", async () => {
    const fetchMock = vi.fn(async () => json({ jobId: "j" }));
    vi.stubGlobal("fetch", fetchMock);
    const { signal } = new AbortController();

    await expect(getAIVideo({ lessonId: 1 }, { signal })).resolves.toEqual({ jobId: "j" });

    expect(fetchMock.mock.calls[0][1].signal).toBe(signal);
  });

  it("keeps working without options", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ jobId: "j" })));
    await expect(getAIVideo({})).resolves.toEqual({ jobId: "j" });
  });

  it("rethrows aborts instead of masking them as invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new DOMException("aborted", "AbortError");
        },
      }))
    );
    await expect(getAIVideo({})).rejects.toSatisfy(isAbortError);
  });

  it("still reports invalid JSON and server errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("bad");
        },
      }))
    );
    await expect(getAIVideo({})).rejects.toThrow("Server returned empty or invalid JSON");

    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "nope" }, false)));
    await expect(getAIVideo({})).rejects.toThrow("nope");
  });
});
