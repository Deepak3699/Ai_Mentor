import { Download } from "lucide-react";
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

const getLocalDateStamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const ExportReportButton = () => {
  const { t } = useTranslation();
  const originalTitleRef = useRef(null);
  const restoreTitleRef = useRef(null);

  useEffect(() => {
    return () => {
      restoreTitleRef.current?.();
    };
  }, []);

  const handleExport = () => {
    if (typeof window === "undefined" || typeof window.print !== "function") {
      toast.error(t("analytics.export_report_error"));
      return;
    }

    restoreTitleRef.current?.();

    const originalTitle = document.title;
    originalTitleRef.current = originalTitle;
    document.title = `AI-Mentor-Report-${getLocalDateStamp()}`;

    let restored = false;
    const restoreTitle = () => {
      if (restored) return;
      restored = true;
      window.removeEventListener("afterprint", restoreTitle);
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
      restoreTitleRef.current = null;
    };

    restoreTitleRef.current = restoreTitle;
    window.addEventListener("afterprint", restoreTitle);

    try {
      window.print();
    } catch (error) {
      restoreTitle();
      toast.error(t("analytics.export_report_error"));
      console.error("Failed to open the print dialog:", error);
      return;
    }

    restoreTitle();
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      aria-label={t("analytics.export_report")}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff6d34] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#ff6d34]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6d34] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      <span>{t("analytics.export_report")}</span>
    </button>
  );
};

export default ExportReportButton;
