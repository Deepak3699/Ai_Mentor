// Builds the `history` array that is sent with each chat message.
// The limits stay inside what the backend accepts (see backend/services/chatHistory.js),
// so a long conversation is trimmed here instead of being rejected by the server.

export const MAX_HISTORY_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TOTAL_CHARS = 8000;

// The backend joins neighbouring messages from the same sender with a blank line.
const JOIN_CHARS = 2;

const toCharacters = (text) => Array.from(text);

// `messages` is the list shown in the chat window: { sender: "user" | "assistant", text, isError }.
// Returns the newest messages that fit, oldest first, as [{ role: "user" | "model", text }].
export const buildChatHistory = (messages) => {
  const history = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (history.length >= MAX_HISTORY_MESSAGES) break;

    const { sender, text, isError } = messages[index];

    if (isError || typeof text !== "string") continue;

    const characters = toCharacters(text.trim()).slice(0, MAX_MESSAGE_CHARS);
    const clean = characters.join("").trimEnd();

    if (!clean) continue;

    const cost = toCharacters(clean).length + JOIN_CHARS;

    if (total + cost > MAX_TOTAL_CHARS) break;

    total += cost;
    history.unshift({ role: sender === "user" ? "user" : "model", text: clean });
  }

  // The conversation sent to the model must start with a user message (not the greeting).
  while (history.length && history[0].role !== "user") history.shift();

  return history;
};
