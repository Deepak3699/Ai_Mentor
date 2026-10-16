import { apiFetch } from "../lib/api";

async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Flashcard request failed");
  }
  return data;
}

export async function fetchFlashcardDeck(courseId, lessonId) {
  const response = await apiFetch(`/api/flashcards/${courseId}/${lessonId}`);
  return readResponse(response);
}

export async function generateFlashcardDeck({ courseId, lessonId, transcript, count }) {
  const response = await apiFetch("/api/flashcards", {
    method: "POST",
    body: JSON.stringify({ courseId, lessonId, transcript, count }),
  });
  return readResponse(response);
}

export async function updateFlashcardMastery(deckId, cardId, mastered) {
  const response = await apiFetch(`/api/flashcards/${deckId}/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ mastered }),
  });
  return readResponse(response);
}
