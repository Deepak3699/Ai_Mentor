import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
export default function GenerationFailure({ error, onRetry }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const retryAt = error?.details?.retryAt || 0;
  useEffect(() => {
    if (retryAt <= Date.now()) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [retryAt]);
  if (!error) return null;
  const types = [
    "authentication",
    "permission",
    "rate_limit",
    "service",
    "timeout",
    "request_timeout",
    "not_found",
    "invalid_request",
    "invalid_response",
    "connectivity",
    "generation",
  ];
  const type = types.includes(error.type) ? error.type : "generation";
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return (
    <div className="lw-generation-failure" role="alert" data-shortcuts-ignore>
      <AlertCircle size={26} aria-hidden="true" />
      <h3>{t("learning.failure.title")}</h3>
      <p>{t(`learning.failure.${type}`)}</p>
      {error.details?.submissionUncertain && (
        <p className="lw-failure-note">{t("learning.failure.uncertain")}</p>
      )}
      {error.retryable && onRetry && (
        <button type="button" disabled={seconds > 0} className="lw-player-retry" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          {seconds > 0
            ? t("learning.failure.retry_in", { seconds })
            : t(error.details?.jobId ? "learning.failure.check_again" : "learning.workspace.retry")}
        </button>
      )}
    </div>
  );
}
