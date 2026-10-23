import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import FloatingAssistant from "../components/common/FloatingAssistant.jsx";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const openAssistant = () => {
  render(
    <MemoryRouter>
      <FloatingAssistant />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /drag or open ai mentor assistant/i }));
  return {
    input: screen.getByPlaceholderText("Ask me anything..."),
    sendButton: screen.getByRole("button", { name: /send message/i }),
  };
};

describe("FloatingAssistant regression tests", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    axios.post.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("prevents duplicate Enter submissions", async () => {
    const request = deferred();
    axios.post.mockReturnValue(request.promise);
    const { input } = openAssistant();
    fireEvent.change(input, { target: { value: "Explain React" } });

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Explain React")).toHaveLength(1);

    await act(async () => {
      request.resolve({ data: { reply: "React is a UI library." } });
      await request.promise;
    });
    expect(await screen.findByText("React is a UI library.")).toBeInTheDocument();
  });

  it("prevents duplicate Send clicks", async () => {
    const request = deferred();
    axios.post.mockReturnValue(request.promise);
    const { input, sendButton } = openAssistant();
    fireEvent.change(input, { target: { value: "Explain Python" } });

    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Explain Python")).toHaveLength(1);

    await act(async () => {
      request.resolve({ data: { reply: "Python is a programming language." } });
      await request.promise;
    });
    expect(await screen.findByText("Python is a programming language.")).toBeInTheDocument();
  });

  it("disables input and Send while a request is pending", async () => {
    const request = deferred();
    axios.post.mockReturnValue(request.promise);
    const { input, sendButton } = openAssistant();
    fireEvent.change(input, { target: { value: "Pending question" } });
    fireEvent.click(sendButton);

    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();

    await act(async () => {
      request.resolve({ data: { reply: "Completed." } });
      await request.promise;
    });
    await waitFor(() => expect(input).toBeEnabled());
  });

  it("does not submit on Shift+Enter", () => {
    const { input } = openAssistant();
    fireEvent.change(input, { target: { value: "First line" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(axios.post).not.toHaveBeenCalled();
    expect(input).toHaveValue("First line");
  });

  it("releases the request lock after success", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { reply: "First answer" } })
      .mockResolvedValueOnce({ data: { reply: "Second answer" } });
    const { input, sendButton } = openAssistant();

    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.click(sendButton);
    expect(await screen.findByText("First answer")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Second question" } });
    fireEvent.click(sendButton);
    expect(await screen.findByText("Second answer")).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("releases the request lock after failure", async () => {
    axios.post
      .mockRejectedValueOnce({ response: { data: { message: "Request failed" } } })
      .mockResolvedValueOnce({ data: { reply: "Recovered successfully" } });
    const { input, sendButton } = openAssistant();

    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.click(sendButton);
    expect(await screen.findByText("Request failed")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Try again" } });
    fireEvent.click(sendButton);
    expect(await screen.findByText("Recovered successfully")).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it("preserves multiline assistant replies", async () => {
    axios.post.mockResolvedValue({
      data: { reply: "First line\nSecond line\nThird line" },
    });
    const { input, sendButton } = openAssistant();
    fireEvent.change(input, { target: { value: "Give me three lines" } });
    fireEvent.click(sendButton);

    const reply = await waitFor(() => {
      const element = [...document.querySelectorAll("p")].find(
        (node) => node.textContent === "First line\nSecond line\nThird line",
      );
      expect(element).toBeTruthy();
      return element;
    });
    expect(reply).toHaveClass("whitespace-pre-wrap");
    expect(reply.textContent).toBe("First line\nSecond line\nThird line");
  });

  it("preserves earlier conversation messages", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { reply: "First reply" } })
      .mockResolvedValueOnce({ data: { reply: "Second reply" } });
    const { input, sendButton } = openAssistant();

    fireEvent.change(input, { target: { value: "First question" } });
    fireEvent.click(sendButton);
    expect(await screen.findByText("First reply")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Second question" } });
    fireEvent.click(sendButton);
    expect(await screen.findByText("Second reply")).toBeInTheDocument();

    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.getByText("First reply")).toBeInTheDocument();
    expect(screen.getByText("Second question")).toBeInTheDocument();
  });
});
