import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FileText } from "lucide-react";

/*
  TranscriptToggle
  Disclosure button that opens and closes the transcript panel identified by `controlsId`.
*/
const TranscriptToggle = ({ isOpen, onToggle, controlsId, buttonRef }) => {
  const { t } = useTranslation();
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={controlsId}
      data-shortcuts-ignore
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-main transition-colors hover:bg-canvas-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <FileText aria-hidden="true" className="h-4 w-4" />
      {t("learning.transcript")}
      <ChevronDown
        aria-hidden="true"
        className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
      />
    </button>
  );
};

export default TranscriptToggle;
