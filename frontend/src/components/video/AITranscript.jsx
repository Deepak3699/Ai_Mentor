import { FileText, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import OverlaySurface from "../learning/OverlaySurface";
import "../learning/learning-workspace.css";

export default function AITranscript({
  id,
  isOpen,
  isDrawer = false,
  isLoading,
  error,
  onClose,
  captions,
  currentTime,
  activeCaptionRef,
  containerRef,
  onTranscriptClick,
  formatTime,
}) {
  const { t } = useTranslation();
  const headingId = `${id}-heading`;
  const content = (
    <>
      <header className="lw-surface-header">
        <span className="lw-icon-tile">
          <FileText size={18} aria-hidden="true" />
        </span>
        <div className="lw-grow">
          <h2 id={headingId}>{t("learning.transcript")}</h2>
        </div>
        <button
          type="button"
          className="lw-icon-button"
          aria-label={t("learning.close_transcript")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div ref={containerRef} className="lw-transcript-scroll" aria-busy={isLoading}>
        {isLoading ? (
          <div role="status" className="lw-empty">
            <LoaderCircle className="motion-safe:animate-spin" size={24} aria-hidden="true" />
            <p>{t("learning.transcript_loading")}</p>
          </div>
        ) : captions.length ? (
          <ol className="lw-cues">
            {captions.map((caption, index) => {
              const active =
                currentTime >= caption.start &&
                (currentTime < caption.end ||
                  (index === captions.length - 1 && currentTime === caption.end));
              return (
                <li key={`${caption.start}-${index}`} ref={active ? activeCaptionRef : null}>
                  <button
                    type="button"
                    className={`lw-cue ${active ? "is-active" : ""}`}
                    aria-current={active ? "true" : undefined}
                    title={t("learning.transcript_jump_to", { time: formatTime(caption.start) })}
                    onClick={() => onTranscriptClick(caption.start)}
                  >
                    <span className="lw-timestamp">{formatTime(caption.start)}</span>
                    <span>{caption.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="lw-empty">
            <span className="lw-empty-icon">
              <FileText size={26} aria-hidden="true" />
            </span>
            <p>{error || t("learning.no_transcript")}</p>
          </div>
        )}
      </div>
    </>
  );
  if (isDrawer && isOpen)
    return (
      <OverlaySurface id={id} variant="drawer" labelledBy={headingId} onClose={onClose}>
        {content}
      </OverlaySurface>
    );
  return (
    <section
      id={id}
      hidden={!isOpen}
      role="region"
      aria-labelledby={headingId}
      aria-busy={isLoading}
      className="lw-transcript"
      data-shortcuts-ignore
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {content}
    </section>
  );
}
