// Validation and normalization of the chat history sent by the browser.
// Every entry comes from the client, so all of it is treated as untrusted text.
//
// Rules (keep frontend/src/service/chatHistory.js in sync with these limits):
// - `history` may be omitted. If present it must be an array of at most MAX_HISTORY_ENTRIES.
// - Each entry must be an object with role "user" or "model" and a string `text`.
//   Any other entry rejects the whole history. Extra fields are ignored and never forwarded.
// - Control characters are removed and broken Unicode is repaired. Entries that are empty or
//   whitespace-only are dropped. Longer text is cut to MAX_HISTORY_ENTRY_CHARS characters
//   (counted as Unicode characters, so an emoji is never split).
// - Adjacent entries with the same role are merged, and leading "model" turns are dropped.
// - After that, the total text must not exceed MAX_HISTORY_TOTAL_CHARS, otherwise it is rejected.

export const MAX_HISTORY_ENTRIES = 20;
export const MAX_HISTORY_ENTRY_CHARS = 2000;
export const MAX_HISTORY_TOTAL_CHARS = 8000;

// Fixed messages: the error never repeats anything the client sent.
export const HISTORY_ERRORS = Object.freeze({
  NOT_ARRAY: "History must be an array",
  TOO_MANY: "History has too many entries",
  INVALID_ENTRY: "History contains an invalid entry",
  TOO_LARGE: "History is too large",
});

const ROLES = new Set(["user", "model"]);

// Keeps tab and newline, removes every other control character.
const isAllowedChar = (char) => {
  const code = char.codePointAt(0);

  return code === 9 || code === 10 || (code >= 32 && code !== 127);
};

const cleanText = (text) => {
  const characters = Array.from(text.toWellFormed()).filter(isAllowedChar);

  return Array.from(characters.join("").trim())
    .slice(0, MAX_HISTORY_ENTRY_CHARS)
    .join("")
    .trimEnd();
};

const countCharacters = (text) => Array.from(text).length;

// Returns { turns } with clean [{ role, text }] turns, or { error } with one of HISTORY_ERRORS.
export const normalizeHistory = (history) => {
  if (history === undefined) return { turns: [] };

  if (!Array.isArray(history)) return { error: HISTORY_ERRORS.NOT_ARRAY };

  if (history.length > MAX_HISTORY_ENTRIES) return { error: HISTORY_ERRORS.TOO_MANY };

  const turns = [];

  for (const entry of history) {
    const isObject = entry !== null && typeof entry === "object" && !Array.isArray(entry);

    if (!isObject || !ROLES.has(entry.role) || typeof entry.text !== "string") {
      return { error: HISTORY_ERRORS.INVALID_ENTRY };
    }

    const text = cleanText(entry.text);

    if (!text) continue;

    const last = turns[turns.length - 1];

    if (last && last.role === entry.role) {
      last.text += `\n\n${text}`;
    } else {
      turns.push({ role: entry.role, text });
    }
  }

  // A Gemini conversation must start with a user turn (for example, drop the greeting).
  while (turns.length && turns[0].role !== "user") turns.shift();

  const total = turns.reduce((sum, turn) => sum + countCharacters(turn.text), 0);

  if (total > MAX_HISTORY_TOTAL_CHARS) return { error: HISTORY_ERRORS.TOO_LARGE };

  return { turns };
};

// Previous turns followed by the current question, in the format Gemini expects.
export const buildContents = (message, turns = []) => {
  const contents = turns.map(({ role, text }) => ({ role, parts: [{ text }] }));
  const last = contents[contents.length - 1];

  if (last && last.role === "user") {
    last.parts[0].text += `\n\n${message}`;
  } else {
    contents.push({ role: "user", parts: [{ text: message }] });
  }

  return contents;
};
