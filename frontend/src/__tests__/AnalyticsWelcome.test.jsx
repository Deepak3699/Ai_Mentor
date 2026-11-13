import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../pages/Analytics.jsx"), "utf8");
const translations = JSON.parse(readFileSync(resolve(here, "../i18n/locales/en.json"), "utf8"));

describe("Analytics welcome section", () => {
  it("uses the first name and Learner fallback", () => {
    expect(source).toContain('user?.name?.trim().split(/\\s+/)[0] || "Learner"');
  });

  it("handles leading and repeated whitespace in names", () => {
    expect(source).toContain(".trim().split(/\\s+/)[0]");
  });

  it("hides the decorative wave from assistive technology", () => {
    expect(source).toContain('aria-hidden="true"');
  });

  it("allows long welcome names to wrap", () => {
    expect(source).toContain("break-words");
    expect(source).toContain("min-w-0 flex-1");
  });

  it("keeps the welcome translation and subtitle", () => {
    expect(translations.analytics.welcome_back_user).toContain("{{name}}");
    expect(translations.analytics.analytics_subtitle).toBe(
      "Track your progress, analyze your performance and keep achieving your goals.",
    );
  });
});
