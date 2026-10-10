import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getQuizDifficulty,
  getWeakTopics,
} from "../utils/quizDifficulty.js";

test("score below 50 selects beginner", () => {
  assert.equal(getQuizDifficulty([{ score: 49 }]), "beginner");
});

test("score of 50 selects intermediate", () => {
  assert.equal(getQuizDifficulty([{ score: 50 }]), "intermediate");
});

test("score of 80 selects intermediate", () => {
  assert.equal(getQuizDifficulty([{ score: 80 }]), "intermediate");
});

test("score above 80 selects advanced", () => {
  assert.equal(getQuizDifficulty([{ score: 81 }]), "advanced");
});

test("missing or invalid score selects intermediate", () => {
  assert.equal(getQuizDifficulty([{}]), "intermediate");
  assert.equal(getQuizDifficulty([{ score: "invalid" }]), "intermediate");
  assert.equal(getQuizDifficulty([]), "intermediate");
});

test("weak topics are deduplicated across the three most recent attempts and limited to ten", () => {
  const history = [
    { weakTopics: ["old-topic"] },
    { weakTopics: ["functions", "loops", "lists", "arrays"] },
    { weakTopics: ["functions", "classes", "objects", "strings"] },
    {
      weakTopics: [
        "loops",
        "recursion",
        "sorting",
        "graphs",
        "trees",
        "dynamic programming",
        "extra-topic",
      ],
    },
  ];

  const result = getWeakTopics(history);

  assert.equal(result.includes("old-topic"), false);
  assert.equal(result.length, 10);
  assert.equal(new Set(result).size, result.length);
  assert.deepEqual(result, [
    "functions",
    "loops",
    "lists",
    "arrays",
    "classes",
    "objects",
    "strings",
    "recursion",
    "sorting",
    "graphs",
  ]);
});

test("weak topics ignore missing, empty, and duplicate values", () => {
  assert.deepEqual(
    getWeakTopics([
      {},
      { weakTopics: ["functions", "", null, "functions"] },
      { weakTopics: ["loops", "loops"] },
    ]),
    ["functions", "loops"],
  );
});
