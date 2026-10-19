import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import LessonPicker from "./LessonPicker";
import TranscriptToggle from "../video/TranscriptToggle";

export default function LearningToolbar({
  modules,
  currentLesson,
  onLessonSelect,
  progress,
  completed,
  total,
  selectedVoice,
  onVoiceOpen,
  transcriptOpen,
  onTranscriptToggle,
  transcriptRef,
  transcriptId,
}) {
  const { t } = useTranslation();
  return (
    <div className="lw-toolbar">
      <LessonPicker modules={modules} currentLesson={currentLesson} onSelect={onLessonSelect} />
      <div className="lw-progress">
        <div>
          <span>
            {Math.round(progress)}% {t("learning.complete")}
          </span>
          <span>
            {completed}/{total}
          </span>
        </div>
        <progress aria-label={t("dashboard.progress")} value={progress} max={100} />
      </div>
      <div className="lw-toolbar-actions">
        <button type="button" className="lw-button lw-button--ai" onClick={onVoiceOpen}>
          <Sparkles size={17} aria-hidden="true" />
          <span>{t("learning.select_ai_voiceover")}</span>
          {selectedVoice && <span className="lw-voice-badge">{selectedVoice}</span>}
        </button>
        <TranscriptToggle
          buttonRef={transcriptRef}
          isOpen={transcriptOpen}
          onToggle={onTranscriptToggle}
          controlsId={transcriptId}
        />
      </div>
    </div>
  );
}
