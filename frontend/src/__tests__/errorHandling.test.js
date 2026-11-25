import { describe, expect, it } from "vitest";
import { getErrorMessage, getFieldErrors, normalizeApiError } from "../lib/errorHandling.js";

describe("frontend error normalization", () => {
  it("normalizes the backend error contract", () => {
    const normalized = normalizeApiError({
      response: {
        status: 400,
        data: {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: [{ field: "email", message: "Email is required" }],
          },
        },
      },
    });

    expect(normalized).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      status: 400,
      details: [{ field: "email", message: "Email is required" }],
    });
  });

  it("returns a safe fallback for network and malformed failures", () => {
    expect(getErrorMessage({ code: "ERR_NETWORK" })).toBe(
      "Something went wrong. Please try again.",
    );
    expect(getErrorMessage({ response: { data: {} } })).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("extracts field-level validation details when available", () => {
    const fieldErrors = getFieldErrors({
      response: {
        status: 400,
        data: {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: [
              { field: "email", message: "Email is required" },
              { field: "password", message: "Password is too short" },
            ],
          },
        },
      },
    });

    expect(fieldErrors).toEqual({
      email: "Email is required",
      password: "Password is too short",
    });
  });
});
