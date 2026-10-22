import { useId, useState } from "react";
import { Check, Sparkles, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import OverlaySurface from "./OverlaySurface";

export default function VoiceoverDialog({ voices, selected, onApply, onClose }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(voices.includes(selected) ? selected : null);
  const id = useId();
  return (
    <OverlaySurface labelledBy={`${id}-title`} onClose={onClose}>
      <header className="lw-surface-header">
        <span className="lw-icon-tile lw-icon-tile--ai">
          <Sparkles size={20} aria-hidden="true" />
        </span>
        <div className="lw-grow">
          <h2 id={`${id}-title`}>{t("learning.select_ai_voiceover")}</h2>
          <p>{t("learning.ai_celebrity_subtitle")}</p>
        </div>
        <button
          type="button"
          className="lw-icon-button"
          aria-label={t("learning.workspace.close")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div
        className="lw-voice-list"
        role="radiogroup"
        aria-label={t("learning.select_ai_voiceover")}
      >
        {voices.map((voice) => (
          <label key={voice} className={`lw-voice-row ${draft === voice ? "is-selected" : ""}`}>
            <span className="lw-icon-tile">
              <UserRound size={19} aria-hidden="true" />
            </span>
            <span className="lw-grow">{voice}</span>
            <input
              className="lw-voice-input"
              type="radio"
              name={id}
              value={voice}
              checked={draft === voice}
              onChange={() => setDraft(voice)}
            />
            <span className="lw-voice-indicator" aria-hidden="true">
              {draft === voice && <Check size={13} strokeWidth={3} />}
            </span>
          </label>
        ))}
      </div>
      <footer className="lw-surface-footer">
        <button type="button" className="lw-button lw-button--quiet" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="lw-button lw-button--primary"
          disabled={!voices.includes(draft)}
          onClick={() => {
            if (!voices.includes(draft)) return;
            onApply(draft);
            onClose();
          }}
        >
          {t("learning.workspace.apply_voice")}
        </button>
      </footer>
    </OverlaySurface>
  );
}
