import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_TOTAL_CHARS,
  buildChatHistory,
} from "../src/service/chatHistory.js";
// The backend rules are the source of truth. Whatever is built here must pass them.
import {
  MAX_HISTORY_ENTRIES,
  MAX_HISTORY_ENTRY_CHARS,
  MAX_HISTORY_TOTAL_CHARS,
  normalizeHistory,
} from "../../backend/services/chatHistory.js";

const user = (text) => ({ sender: "user", text });
const assistant = (text, extra = {}) => ({ sender: "assistant", text, ...extra });

test("the frontend limits stay inside the backend limits", () => {
  assert.ok(MAX_HISTORY_MESSAGES <= MAX_HISTORY_ENTRIES);
  assert.ok(MAX_MESSAGE_CHARS <= MAX_HISTORY_ENTRY_CHARS);
  assert.ok(MAX_TOTAL_CHARS <= MAX_HISTORY_TOTAL_CHARS);
});

test("no messages gives no history", () => {
  assert.deepEqual(buildChatHistory([]), []);
});

test("the greeting is skipped and roles use the model's names", () => {
  const messages = [
    assistant("Hello! I'm your AI Mentor Assistant."),
    user("Give me a 3 step plan"),
    assistant("1. Read 2. Practice 3. Build"),
  ];

  assert.deepEqual(buildChatHistory(messages), [
    { role: "user", text: "Give me a 3 step plan" },
    { role: "model", text: "1. Read 2. Practice 3. Build" },
  ]);
});

test("error bubbles, empty messages and extra fields are not sent", () => {
  const messages = [
    user("First question"),
    assistant("Sorry, something went wrong.", { isError: true }),
    user("Second question"),
    assistant("   "),
    assistant("An answer", { route: "/settings", lessonId: 4 }),
  ];
  const history = buildChatHistory(messages);

  assert.deepEqual(history, [
    { role: "user", text: "First question" },
    { role: "user", text: "Second question" },
    { role: "model", text: "An answer" },
  ]);
  assert.deepEqual(Object.keys(history[2]), ["role", "text"]);
});

test("only the newest messages are kept", () => {
  const messages = Array.from({ length: 30 }, (_, i) =>
    i % 2 === 0 ? user(`question ${i}`) : assistant(`answer ${i}`),
  );
  const history = buildChatHistory(messages);

  assert.ok(history.length <= MAX_HISTORY_MESSAGES);
  assert.equal(history[0].role, "user");
  assert.equal(history.at(-1).text, "answer 29");
});

test("long messages are cut without splitting an emoji", () => {
  const [entry] = buildChatHistory([user("😀".repeat(MAX_MESSAGE_CHARS + 10))]);

  assert.equal(Array.from(entry.text).length, MAX_MESSAGE_CHARS);
  assert.equal(entry.text, entry.text.toWellFormed());
});

test("the total size stays under the limit by dropping the oldest messages", () => {
  const block = "a".repeat(MAX_MESSAGE_CHARS);
  const messages = [user(block), assistant(block), user(block), assistant(block), user(block)];
  const history = buildChatHistory(messages);
  const total = history.reduce((sum, entry) => sum + Array.from(entry.text).length, 0);

  assert.ok(total <= MAX_TOTAL_CHARS);
  assert.equal(history.at(-1).text, block);
  assert.ok(history.length < messages.length);
});

test("what is built is always accepted by the backend rules", () => {
  const block = "é😀".repeat(MAX_MESSAGE_CHARS);
  const samples = [
    [],
    [assistant("Hello")],
    [user("hi"), assistant("hello")],
    [user("a"), assistant("x", { isError: true }), user("b"), user("c")],
    Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? user(block) : assistant(block))),
    Array.from({ length: 40 }, () => user(block)),
    Array.from({ length: 25 }, (_, i) => user(`  message ${i}\u0000  `)),
  ];

  for (const messages of samples) {
    const history = buildChatHistory(messages);
    const result = normalizeHistory(history);

    assert.equal(result.error, undefined, JSON.stringify(history).slice(0, 80));
  }
});
