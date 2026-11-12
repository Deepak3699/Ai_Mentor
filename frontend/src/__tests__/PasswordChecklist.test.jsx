import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PasswordChecklist from "../components/auth/PasswordChecklist";

describe("PasswordChecklist", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders all 5 requirements as not met when password is empty", () => {
    render(<PasswordChecklist password="" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);

    for (const item of items) {
      expect(item.textContent).toContain("not met");
    }
  });

  it("updates items from not met to met as the password changes", () => {
    const { rerender } = render(<PasswordChecklist password="abc" />);

    const getItemText = (label) => screen.getByText(label).closest("li").textContent;

    // Only lowercase is met for "abc"
    expect(getItemText("8+ Characters")).toContain("not met");
    expect(getItemText("Uppercase")).toContain("not met");
    expect(getItemText("Lowercase")).toContain("— met");
    expect(getItemText("Number")).toContain("not met");
    expect(getItemText("Symbol")).toContain("not met");

    // Now pass a fully valid password
    rerender(<PasswordChecklist password="Abcdef1!" />);

    expect(getItemText("8+ Characters")).toContain("— met");
    expect(getItemText("Uppercase")).toContain("— met");
    expect(getItemText("Lowercase")).toContain("— met");
    expect(getItemText("Number")).toContain("— met");
    expect(getItemText("Symbol")).toContain("— met");
  });
});
