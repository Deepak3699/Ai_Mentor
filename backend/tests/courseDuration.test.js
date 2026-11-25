import { test } from "node:test";
import assert from "node:assert/strict";
import { courseDuration } from "../utils/courseDuration.js";
const modules = (...durations) => [{ lessons: durations.map((duration) => ({ duration })) }];
test("sums lesson durations across modules with human and clock formats", () => {
  assert.equal(
    courseDuration([...modules("1h 15m", "12 min"), ...modules("3:00", "00:30:00")]),
    "2h",
  );
  assert.equal(courseDuration(modules("1.5 hours", "30 mins")), "2h");
  assert.equal(courseDuration(modules("30 seconds", "45 seconds")), "2m");
});
test("does not invent a total for missing or invalid durations", () => {
  for (const values of [[], [null], ["12 min", "unknown"], ["0 min"]]) {
    assert.equal(courseDuration(modules(...values)), null);
  }
  assert.equal(courseDuration(), null);
});
