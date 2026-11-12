import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
export default function TranscriptToggle({ isOpen, onToggle, controlsId, buttonRef }) {
  const { t } = useTranslation();
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`lw-button ${isOpen ? "lw-button--selected" : ""}`}
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={controlsId}
      data-shortcuts-ignore
    >
      <FileText size={17} aria-hidden="true" />
      {t("learning.transcript")}
    </button>
  );
}
