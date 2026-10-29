import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculatePercentages } from "../src/utils/completionBreakdown.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(__dirname, "../src/i18n/locales");
const expectedLocales = ["ar", "de", "en", "es", "fr", "hi", "ja", "pt", "ru", "zh"];
const requiredBreakdownKeys = [
  "title",
  "completed",
  "completed_courses",
  "in_progress",
  "not_started",
  "empty_state_message",
  "aria_summary",
  "table_caption",
  "status_header",
  "count_header",
  "percentage_header",
];

test("calculatePercentages returns 0s when total count is 0", () => {
  const result = calculatePercentages({ completed: 0, inProgress: 0, notStarted: 0 });
  assert.deepEqual(result, { completed: 0, inProgress: 0, notStarted: 0 });
});

test("calculatePercentages correctly allocates 100% when only one group has items", () => {
  assert.deepEqual(calculatePercentages({ completed: 5, inProgress: 0, notStarted: 0 }), {
    completed: 100,
    inProgress: 0,
    notStarted: 0,
  });
  assert.deepEqual(calculatePercentages({ completed: 0, inProgress: 2, notStarted: 0 }), {
    completed: 0,
    inProgress: 100,
    notStarted: 0,
  });
  assert.deepEqual(calculatePercentages({ completed: 0, inProgress: 0, notStarted: 7 }), {
    completed: 0,
    inProgress: 0,
    notStarted: 100,
  });
});

test("calculatePercentages uses largest-remainder method so sum is exactly 100", () => {
  // 1/3, 1/3, 1/3 -> 33.333% each -> floors 33, 33, 33 sum to 99 -> diff 1 distributed to first remainder
  const threeWay = calculatePercentages({ completed: 1, inProgress: 1, notStarted: 1 });
  assert.equal(threeWay.completed + threeWay.inProgress + threeWay.notStarted, 100);
  assert.equal(threeWay.completed, 34);
  assert.equal(threeWay.inProgress, 33);
  assert.equal(threeWay.notStarted, 33);

  // 6 courses: 4 completed (66.67%), 1 in progress (16.67%), 1 not started (16.67%)
  const sixCourses = calculatePercentages({ completed: 4, inProgress: 1, notStarted: 1 });
  assert.equal(sixCourses.completed + sixCourses.inProgress + sixCourses.notStarted, 100);
  assert.equal(sixCourses.completed, 67);
  assert.equal(sixCourses.inProgress, 17);
  assert.equal(sixCourses.notStarted, 16);
});

test("all 10 locale files define completion_breakdown keys", () => {
  for (const locale of expectedLocales) {
    const filePath = path.join(localesDir, `${locale}.json`);
    assert.ok(fs.existsSync(filePath), `Locale file ${locale}.json must exist`);

    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.ok(json.analytics, `Locale ${locale} must have analytics section`);
    assert.ok(
      json.analytics.completion_breakdown,
      `Locale ${locale} must have analytics.completion_breakdown`,
    );

    for (const key of requiredBreakdownKeys) {
      assert.ok(
        json.analytics.completion_breakdown[key] !== undefined &&
          json.analytics.completion_breakdown[key] !== "",
        `Locale ${locale} missing completion_breakdown.${key}`,
      );
    }
  }
});
