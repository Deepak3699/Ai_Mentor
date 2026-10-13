import { apiFetch as fetch } from "../lib/api";
import { isAbortError } from "./aiGeneration";

export const getAIVideo = async (payload, { signal } = {}) => {
  const token = localStorage.getItem("token");

  const response = await fetch("/api/ai/generate-video", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  let data;

  try {
    data = await response.json();
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error("Server returned empty or invalid JSON");
  }

  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
  }

  return data;
};
export const explainCode = async (payload) => {
  const token = localStorage.getItem("token");

  const response = await fetch("/api/ai/explain-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Server returned empty or invalid JSON");
  }

  if (!response.ok) {
    throw new Error(data?.message || "Code explanation request failed");
  }

  return data;
};
