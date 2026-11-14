import { describe, it, expect } from "vitest";
import { PASSWORD_REQUIREMENTS, getPasswordChecks, passwordSchema } from "../lib/passwordRules";

describe("passwordRules", () => {
  it("defines all 5 password requirements", () => {
    expect(PASSWORD_REQUIREMENTS.map((rule) => rule.id)).toEqual([
      "length",
      "capital",
      "lower",
      "number",
      "symbol",
    ]);
  });

  it("evaluates individual checks accurately in getPasswordChecks", () => {
    expect(getPasswordChecks("")).toEqual({
      length: false,
      capital: false,
      lower: false,
      number: false,
      symbol: false,
    });

    expect(getPasswordChecks("abcdefgh")).toEqual({
      length: true,
      capital: false,
      lower: true,
      number: false,
      symbol: false,
    });

    expect(getPasswordChecks("Abcdef1!")).toEqual({
      length: true,
      capital: true,
      lower: true,
      number: true,
      symbol: true,
    });
  });

  it("returns the exact submit-time error messages from passwordSchema", () => {
    const cases = [
      { input: "Ab1!", expected: "Password must be at least 8 characters" },
      { input: "abcdef1!", expected: "Password must contain at least one uppercase letter" },
      { input: "ABCDEF1!", expected: "Password must contain at least one lowercase letter" },
      { input: "Abcdefg!", expected: "Password must contain at least one number" },
      { input: "Abcdefg1", expected: "Password must contain at least one symbol" },
    ];

    for (const { input, expected } of cases) {
      const result = passwordSchema.safeParse(input);
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe(expected);
    }
  });

  it("accepts a password that meets all requirements", () => {
    const result = passwordSchema.safeParse("Secure1!");
    expect(result.success).toBe(true);
  });
});
