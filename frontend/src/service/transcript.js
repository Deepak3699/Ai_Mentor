// Helpers for turning a saved lesson script into transcript cues.

// Splits on sentence-ending punctuation followed by whitespace (or on line breaks), keeping the
// punctuation so the transcript matches the saved text. Decimals such as "3.5" stay intact.
export const splitTranscriptSentences = (text) => {
  if (typeof text !== "string") return [];
  return text
    .split(/(?<=[.!?])\s+|\s*\n+\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

// The saved script carries no timings, so its sentences are spread evenly across the video.
export const buildCuesFromText = (text, duration) => {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const sentences = splitTranscriptSentences(text);
  if (!sentences.length) return [];
  const slot = duration / sentences.length;
  return sentences.map((sentence, index) => ({
    start: index * slot,
    end: (index + 1) * slot,
    text: sentence,
  }));
};

// True when the script has at least one character that is not whitespace or sentence punctuation.
export const hasTranscriptText = (text) => typeof text === "string" && /[^\s.!?]/.test(text);
