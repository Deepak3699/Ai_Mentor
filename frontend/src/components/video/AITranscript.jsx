import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

/*
  AITranscript Component
  Collapsible transcript panel for the lesson video. Each cue is a button, so learners can reach
  it with the keyboard and jump to that point in the video.
*/
const AITranscript = ({
  id,
  isOpen,
  isLoading,
  onClose,
  captions,
  currentTime,
  activeCaptionRef,
  containerRef,
  onTranscriptClick,
  formatTime,
}) => {
  const { t } = useTranslation();
  const headingId = `${id}-heading`;

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <section
      id={id}
      ref={containerRef}
      hidden={!isOpen}
      aria-labelledby={headingId}
      aria-busy={isLoading}
      data-shortcuts-ignore
      onKeyDown={handleKeyDown}
      className="lg:col-span-1 bg-card border-l border-border overflow-y-auto max-h-[calc(100vh-180px)]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between bg-card border-b border-border px-6 py-4">
        <h2 id={headingId} className="text-lg font-semibold text-main">
          {t("learning.transcript")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("learning.close_transcript")}
          className="rounded p-1 text-muted hover:text-main focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <div className="px-4 py-4 scroll-smooth">
        {isLoading ? (
          <p role="status" className="text-sm text-muted text-center py-8">
            {t("learning.transcript_loading")}
          </p>
        ) : captions.length > 0 ? (
          <ol className="space-y-2">
            {captions.map((caption, index) => {
              const isActive = currentTime >= caption.start && currentTime <= caption.end;
              return (
                <li key={index} ref={isActive ? activeCaptionRef : null}>
                  <button
                    type="button"
                    onClick={() => onTranscriptClick(caption.start)}
                    aria-current={isActive ? "true" : undefined}
                    title={t("learning.transcript_jump_to", { time: formatTime(caption.start) })}
                    className={`block w-full py-3 border-l-4 pl-4 pr-2 rounded-r text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? "border-blue-500 bg-transcript-bg"
                        : "border-transparent bg-card hover:bg-color-transcript-bg hover:border-border"
                    }`}
                  >
                    <span className="block text-xs font-medium mb-1 text-muted">
                      {formatTime(caption.start)}
                    </span>
                    <span className="block text-sm leading-relaxed text-muted">{caption.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted text-center py-8">{t("learning.no_transcript")}</p>
        )}
      </div>
    </section>
  );
};

export default AITranscript;
