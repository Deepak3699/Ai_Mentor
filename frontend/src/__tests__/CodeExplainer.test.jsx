import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CodeExplainer from "../pages/CodeExplainer";
import { explainCode } from "../service/aiService";

vi.mock("../service/aiService", () => ({
  explainCode: vi.fn(),
}));

describe("CodeExplainer", () => {
  it("renders object-shaped explanation and issues without [object Object]", async () => {
    explainCode.mockResolvedValue({
      summary: "This code increments a variable.",
      explanation: [
        {
          line: 5,
          code: "x = x + 1",
          explanation: "Increments x by one.",
        },
      ],
      issues: [
        {
          line: 8,
          problem: "Possible division by zero.",
          suggestion: "Check the denominator before dividing.",
        },
      ],
      suggested_code: "x += 1",
      time_complexity: "O(1)",
      space_complexity: "O(1)",
    });

    render(<CodeExplainer />);

    fireEvent.change(screen.getByPlaceholderText("Paste your code here..."), {
      target: { value: "x = x + 1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Analyze Code" }));

    expect(
      await screen.findByText("Increments x by one."),
    ).toBeTruthy();

    expect(screen.getByText("Possible division by zero.")).toBeTruthy();
    expect(
      screen.getByText("Check the denominator before dividing."),
    ).toBeTruthy();

    expect(screen.getByText("Line: 5")).toBeTruthy();
    expect(screen.getByText("Line: 8")).toBeTruthy();
    expect(screen.queryByText("[object Object]")).toBeNull();

    await waitFor(() => {
      expect(explainCode).toHaveBeenCalledWith({
        code: "x = x + 1",
        language: "python",
        mode: "explain",
      });
    });
  });
});
