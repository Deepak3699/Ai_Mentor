import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  fetchFlashcardDeck,
  generateFlashcardDeck,
  updateFlashcardMastery,
} from "../../service/flashcards";
import OverlaySurface from "./OverlaySurface";

export default function FlashcardStudy({
  open,
  onClose,
  courseId,
  lessonId,
  lessonTitle,
  transcript,
}) {
  const { t } = useTranslation();
  const id = useId();
  const [deck, setDeck] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [count, setCount] = useState(5);
  const [isFlipped, setIsFlipped] = useState(false);
  const [operation, setOperation] = useState("loading");
  const [error, setError] = useState("");
  const session = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return undefined;
    const request = ++session.current;
    busy.current = true;
    setDeck(null);
    setActiveIndex(0);
    setIsFlipped(false);
    setError("");
    setOperation("loading");
    fetchFlashcardDeck(courseId, lessonId)
      .then(({ deck: savedDeck }) => {
        if (session.current === request) setDeck(savedDeck);
      })
      .catch((requestError) => {
        if (session.current === request) setError(requestError.message);
      })
      .finally(() => {
        if (session.current === request) {
          busy.current = false;
          setOperation("idle");
        }
      });
    return () => {
      session.current += 1;
      busy.current = false;
    };
  }, [open, courseId, lessonId]);
  if (!open) return null;
  const cards = deck?.cards || [];
  const currentCard = cards[activeIndex];
  const masteredCount = cards.filter((card) => card.mastered).length;
  const masteryPercent = cards.length ? Math.round((masteredCount / cards.length) * 100) : 0;
  const isBusy = operation !== "idle";
  const handleGenerate = async () => {
    if (busy.current || !transcript?.trim()) return;
    const request = session.current;
    busy.current = true;
    setError("");
    setOperation("generating");
    try {
      const result = await generateFlashcardDeck({ courseId, lessonId, transcript, count });
      if (session.current !== request) return;
      setDeck(result.deck);
      setActiveIndex(0);
      setIsFlipped(false);
    } catch (requestError) {
      if (session.current === request) setError(requestError.message);
    } finally {
      if (session.current === request) {
        busy.current = false;
        setOperation("idle");
      }
    }
  };
  const handleMastery = async () => {
    if (!currentCard || !deck || busy.current) return;
    const request = session.current;
    busy.current = true;
    setError("");
    setOperation("saving");
    try {
      const result = await updateFlashcardMastery(deck.id, currentCard.id, !currentCard.mastered);
      if (session.current === request) setDeck(result.deck);
    } catch (requestError) {
      if (session.current === request) setError(requestError.message);
    } finally {
      if (session.current === request) {
        busy.current = false;
        setOperation("idle");
      }
    }
  };
  const moveCard = (offset) => {
    setActiveIndex((index) => Math.max(0, Math.min(cards.length - 1, index + offset)));
    setIsFlipped(false);
  };
  return (
    <OverlaySurface variant="study" labelledBy={`${id}-title`} onClose={onClose}>
      <header className="lw-surface-header">
        <span className="lw-icon-tile lw-icon-tile--ai">
          <BookOpen size={20} aria-hidden="true" />
        </span>
        <div className="lw-grow">
          <span className="lw-eyebrow">{t("learning.study.title")}</span>
          <h2 id={`${id}-title`}>{lessonTitle}</h2>
        </div>
        <button
          type="button"
          className="lw-icon-button"
          aria-label={t("learning.study.close")}
          onClick={onClose}
        >
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      <div className="lw-study-body" aria-busy={isBusy}>
        {error && (
          <p className="lw-study-error" role="alert">
            {error}
          </p>
        )}
        {operation === "loading" || operation === "generating" ? (
          <div className="lw-study-empty" role="status">
            <LoaderCircle className="motion-safe:animate-spin" size={26} aria-hidden="true" />
            <p>
              {t(operation === "loading" ? "learning.study.loading" : "learning.study.generating")}
            </p>
          </div>
        ) : currentCard ? (
          <>
            <div className="lw-study-meta" aria-live="polite">
              <span>
                {t("learning.study.position", { current: activeIndex + 1, total: cards.length })}
              </span>
              <span>{t("learning.study.mastered", { count: masteredCount })}</span>
            </div>
            <progress
              className="lw-study-progress"
              value={masteryPercent}
              max={100}
              aria-label={t("learning.study.progress")}
            />
            <button
              type="button"
              className="lw-study-card"
              aria-label={t(
                isFlipped ? "learning.study.show_question" : "learning.study.show_answer",
              )}
              aria-pressed={isFlipped}
              onClick={() => setIsFlipped((value) => !value)}
            >
              <span className="lw-study-card-label">
                {t(isFlipped ? "learning.study.answer" : "learning.study.question")}
              </span>
              <span className="lw-study-card-copy">
                {isFlipped ? currentCard.back : currentCard.front}
              </span>
              {!isFlipped && currentCard.hint && (
                <span className="lw-study-hint">
                  {t("learning.study.hint")}: {currentCard.hint}
                </span>
              )}
              <span className="lw-study-card-action">
                <RotateCw size={14} aria-hidden="true" />
                {t(isFlipped ? "learning.study.show_question" : "learning.study.show_answer")}
              </span>
            </button>
            <div className="lw-study-navigation">
              <button
                type="button"
                className="lw-button lw-button--quiet"
                disabled={activeIndex === 0 || isBusy}
                onClick={() => moveCard(-1)}
              >
                <ChevronLeft size={17} aria-hidden="true" />
                {t("learning.previous")}
              </button>
              <button
                type="button"
                className={`lw-button ${currentCard.mastered ? "lw-button--selected" : "lw-button--primary"}`}
                disabled={isBusy}
                aria-pressed={!!currentCard.mastered}
                onClick={handleMastery}
              >
                <Check size={17} aria-hidden="true" />
                {t(currentCard.mastered ? "learning.study.unmark" : "learning.study.mark")}
              </button>
              <button
                type="button"
                className="lw-button lw-button--quiet"
                disabled={activeIndex >= cards.length - 1 || isBusy}
                onClick={() => moveCard(1)}
              >
                {t("learning.next")}
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <div className="lw-study-empty">
            <span className="lw-study-illustration">
              <BookOpen size={29} aria-hidden="true" />
            </span>
            <h3>{t("learning.study.create_title")}</h3>
            <p>{t("learning.study.create_description")}</p>
            <fieldset className="lw-study-count">
              <legend>{t("learning.study.number")}</legend>
              <div>
                {[5, 6, 7, 8, 9, 10].map((amount) => (
                  <label key={amount}>
                    <input
                      type="radio"
                      name={`${id}-count`}
                      value={amount}
                      checked={count === amount}
                      onChange={() => setCount(amount)}
                    />
                    <span>{amount}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {!transcript?.trim() && <p>{t("learning.study.unavailable")}</p>}
          </div>
        )}
      </div>
      <footer className="lw-surface-footer lw-study-footer">
        <span>{t("learning.study.footer")}</span>
        {!currentCard && (
          <button
            type="button"
            className="lw-button lw-button--primary"
            disabled={isBusy || !transcript?.trim()}
            onClick={handleGenerate}
          >
            <Sparkles size={16} aria-hidden="true" />
            {t("learning.study.generate")}
          </button>
        )}
        {currentCard && (
          <button type="button" className="lw-button" onClick={onClose}>
            {t("learning.done")}
          </button>
        )}
      </footer>
    </OverlaySurface>
  );
}
