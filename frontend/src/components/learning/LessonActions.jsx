import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
export default function LessonActions({
  index,
  total,
  onPrevious,
  onNext,
  navigating,
  showFlashcards,
  flashcardsDisabled,
  onFlashcards,
}) {
  const { t } = useTranslation();
  return (
    <nav className="lw-lesson-actions" aria-label={t("learning.workspace.lesson_navigation")}>
      <button type="button" className="lw-button" disabled={index <= 0} onClick={onPrevious}>
        <ChevronLeft size={17} aria-hidden="true" />
        {t("learning.previous")}
      </button>
      {showFlashcards ? (
        <button
          type="button"
          className="lw-button lw-button--quiet lw-flashcards"
          disabled={flashcardsDisabled}
          onClick={onFlashcards}
        >
          <BookOpen size={17} aria-hidden="true" />
          {t("learning.workspace.flashcards")}
        </button>
      ) : (
        <span className="lw-lesson-position">
          {Math.max(0, index + 1)} / {total}
        </span>
      )}
      <button
        type="button"
        className="lw-button lw-button--primary"
        disabled={index >= total - 1 || navigating}
        onClick={onNext}
      >
        {navigating ? t("learning.loading") : t("learning.next")}
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </nav>
  );
}
