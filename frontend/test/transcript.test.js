import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCuesFromText,
  hasTranscriptText,
  splitTranscriptSentences,
} from "../src/service/transcript.js";

test("sentences keep their punctuation so the transcript matches the saved script", () => {
  const script = "Welcome to the lesson. Why does it matter? Let's begin!";
  assert.deepEqual(splitTranscriptSentences(script), [
    "Welcome to the lesson.",
    "Why does it matter?",
    "Let's begin!",
  ]);
});

test("decimals and line breaks are handled without losing text", () => {
  assert.deepEqual(splitTranscriptSentences("Pi is about 3.14 here.\n\nNext paragraph"), [
    "Pi is about 3.14 here.",
    "Next paragraph",
  ]);
});

test("non-string or blank scripts produce no sentences", () => {
  assert.deepEqual(splitTranscriptSentences(null), []);
  assert.deepEqual(splitTranscriptSentences("   \n "), []);
});

test("cues are spread evenly across the video and cover its whole duration", () => {
  const cues = buildCuesFromText("One. Two. Three. Four.", 40);
  assert.equal(cues.length, 4);
  assert.deepEqual(
    cues.map((cue) => [cue.start, cue.end, cue.text]),
    [
      [0, 10, "One."],
      [10, 20, "Two."],
      [20, 30, "Three."],
      [30, 40, "Four."],
    ],
  );
});

test("no cues are built until the video duration is known", () => {
  assert.deepEqual(buildCuesFromText("One. Two.", NaN), []);
  assert.deepEqual(buildCuesFromText("One. Two.", 0), []);
  assert.deepEqual(buildCuesFromText("", 30), []);
});

test("hasTranscriptText ignores empty and punctuation-only scripts", () => {
  assert.equal(hasTranscriptText("Hello."), true);
  assert.equal(hasTranscriptText(" ... "), false);
  assert.equal(hasTranscriptText(""), false);
  assert.equal(hasTranscriptText(undefined), false);
});
