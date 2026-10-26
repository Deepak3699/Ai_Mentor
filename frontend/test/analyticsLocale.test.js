import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(__dirname, "../src/i18n/locales");
const expectedLocales = ["ar", "de", "en", "es", "fr", "hi", "ja", "pt", "ru", "zh"];
const requiredAnalyticsKeys = [
  "average_progress",
  "completed_lessons_count",
  "across_all_courses",
  "total_study_time_label",
  "hours_unit",
  "this_week",
  "upcoming_tasks_count",
  "need_attention",
];

test("all required locale files exist and contain second row analytics keys", () => {
  for (const locale of expectedLocales) {
    const filePath = path.join(localesDir, `${locale}.json`);
    assert.ok(fs.existsSync(filePath), `Locale file ${locale}.json should exist`);

    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.ok(json.analytics, `Locale ${locale} must have analytics section`);

    for (const key of requiredAnalyticsKeys) {
      assert.ok(
        json.analytics[key] !== undefined && json.analytics[key] !== "",
        `Locale ${locale} must define analytics.${key}`,
      );
    }
  }
});
