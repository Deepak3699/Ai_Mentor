import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCw, X } from "lucide-react";
import {
  fetchFlashcardDeck,
  generateFlashcardDeck,
  updateFlashcardMastery,
} from "../../service/flashcards";

export default function FlashcardStudy({
  open,
  onClose,
  courseId,
  lessonId,
  lessonTitle,
  transcript,
}) {
  const [deck, setDeck] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [count, setCount] = useState(5);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    setDeck(null);
    setActiveIndex(0);
    setIsFlipped(false);
    setError("");
    setIsLoading(true);

    fetchFlashcardDeck(courseId, lessonId)
      .then(({ deck: savedDeck }) => {
        if (active) setDeck(savedDeck);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, courseId, lessonId]);

  if (!open) return null;

  const cards = deck?.cards || [];
  const currentCard = cards[activeIndex];
  const masteredCount = cards.filter((card) => card.mastered).length;
  const masteryPercent = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0;

  const handleGenerate = async () => {
    setError("");
    setIsLoading(true);
    try {
      const result = await generateFlashcardDeck({
        courseId,
        lessonId,
        transcript,
        count,
      });
      setDeck(result.deck);
      setActiveIndex(0);
      setIsFlipped(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMastery = async () => {
    if (!currentCard || !deck) return;
    setError("");
    try {
      const result = await updateFlashcardMastery(deck.id, currentCard.id, !currentCard.mastered);
      setDeck(result.deck);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const moveCard = (offset) => {
    setActiveIndex((index) => Math.max(0, Math.min(cards.length - 1, index + offset)));
    setIsFlipped(false);
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="flashcard-study-title"
        aria-modal="true"
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card text-main shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Study deck</p>
            <h2 id="flashcard-study-title" className="mt-1 truncate text-xl font-semibold">
              {lessonTitle}
            </h2>
          </div>
          <button
            aria-label="Close flashcards"
            className="rounded-md p-2 text-muted transition hover:bg-canvas-alt hover:text-main"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
          {error && (
            <p
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          )}

          {isLoading && !deck ? (
            <p className="py-16 text-center text-sm text-muted" role="status">
              Loading flashcards...
            </p>
          ) : currentCard ? (
            <>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">
                  Card {activeIndex + 1} of {cards.length}
                </span>
                <span className="text-muted">{masteredCount} mastered</span>
              </div>
              <div
                aria-label={`${masteryPercent}% mastered`}
                aria-valuemax="100"
                aria-valuemin="0"
                aria-valuenow={masteryPercent}
                className="h-2 overflow-hidden rounded-full bg-canvas-alt"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
                  style={{ width: `${masteryPercent}%` }}
                />
              </div>

              <div className="perspective-[1000px]">
                <button
                  aria-label={isFlipped ? "Show question" : "Show answer"}
                  aria-pressed={isFlipped}
                  className="relative min-h-64 w-full rounded-lg border border-border bg-canvas-alt p-6 text-left shadow-sm transition-transform duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-72 sm:p-9"
                  onClick={() => setIsFlipped((flipped) => !flipped)}
                  style={{
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                    transformStyle: "preserve-3d",
                  }}
                  type="button"
                >
                  <span
                    className="absolute inset-0 flex flex-col justify-center p-6 sm:p-9"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Question
                    </span>
                    <span className="mt-4 text-lg font-semibold leading-relaxed sm:text-xl">
                      {currentCard.front}
                    </span>
                    {currentCard.hint && (
                      <span className="mt-5 text-sm text-muted">Hint: {currentCard.hint}</span>
                    )}
                  </span>
                  <span
                    className="absolute inset-0 flex flex-col justify-center p-6 sm:p-9"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Answer
                    </span>
                    <span className="mt-4 text-base leading-relaxed sm:text-lg">
                      {currentCard.back}
                    </span>
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-main transition hover:bg-canvas-alt disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={activeIndex === 0}
                  onClick={() => moveCard(-1)}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <button
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${currentCard.mastered ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200" : "bg-primary text-white hover:opacity-90"}`}
                  onClick={handleMastery}
                  type="button"
                >
                  <Check className="h-4 w-4" />
                  {currentCard.mastered ? "Unmark mastered" : "Mark as mastered"}
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-main transition hover:bg-canvas-alt disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={activeIndex >= cards.length - 1}
                  onClick={() => moveCard(1)}
                  type="button"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                className="mx-auto flex items-center gap-2 text-xs text-muted hover:text-main"
                onClick={() => setIsFlipped((flipped) => !flipped)}
                type="button"
              >
                <RotateCw className="h-3.5 w-3.5" /> Flip card
              </button>
            </>
          ) : (
            <div className="space-y-5 py-8 text-center">
              <p className="text-sm text-muted">Create a deck from this lesson transcript.</p>
              <label className="mx-auto flex max-w-xs items-center justify-between gap-4 text-sm">
                <span className="font-medium">Number of cards</span>
                <select
                  className="rounded-md border border-border bg-card px-3 py-2 text-main"
                  onChange={(event) => setCount(Number(event.target.value))}
                  value={count}
                >
                  {[5, 6, 7, 8, 9, 10].map((amount) => (
                    <option key={amount} value={amount}>
                      {amount}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading || !transcript?.trim()}
                onClick={handleGenerate}
                type="button"
              >
                <RotateCw className="h-4 w-4" />
                {isLoading ? "Generating..." : "Generate flashcards"}
              </button>
              {!transcript?.trim() && (
                <p className="text-xs text-muted">The lesson transcript is not available yet.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
