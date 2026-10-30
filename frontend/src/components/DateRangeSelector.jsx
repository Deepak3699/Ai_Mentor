import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

const DateRangeSelector = ({ preset, label, onSelectPreset, onApplyCustom }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const containerRef = useRef(null);
  const today = new Date().toLocaleDateString("en-CA");

  const presets = [
    { key: "last7", label: t("analytics.range_last7", "Last 7 days") },
    { key: "last30", label: t("analytics.range_last30", "Last 30 days") },
    { key: "thisMonth", label: t("analytics.range_this_month", "This month") },
  ];

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
        setShowCustom(false);
        setError("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setShowCustom(false);
        setError("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleApply = () => {
    setError("");

    if (!from || !to) {
      setError(t("analytics.select_both_dates", "Please select both dates."));
      return;
    }

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const todayDate = new Date(`${today}T00:00:00`);
    const days = Math.round((end - start) / 86400000) + 1;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError(t("analytics.invalid_dates", "Please enter valid dates."));
      return;
    }

    if (start > end) {
      setError(t("analytics.invalid_date_order", "From date must be before To date."));
      return;
    }

    if (end > todayDate) {
      setError(t("analytics.future_date", "Future dates are not allowed."));
      return;
    }

    if (days > 90) {
      setError(t("analytics.max_date_range", "Select a range of up to 90 days."));
      return;
    }

    onApplyCustom({ start, end });
    setOpen(false);
    setShowCustom(false);
  };

  return (
    <div className="relative w-full sm:w-auto" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setShowCustom(false);
          setError("");
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#CCCCCC] bg-white px-4 py-3 text-sm font-medium text-[#2D3436] shadow-sm hover:border-[#ff6d34] dark:border-gray-700 dark:bg-[#1A1A1A] dark:text-white sm:w-auto"
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#ff6d34]" />
          {label}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-full min-w-[260px] rounded-xl border border-[#CCCCCC] bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-[#1A1A1A] sm:w-72">
          {!showCustom ? (
            <>
              {presets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onSelectPreset(item.key);
                    setOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F5F5F5] dark:hover:bg-gray-700 ${
                    preset === item.key
                      ? "bg-orange-50 font-semibold text-[#ff6d34] dark:bg-orange-950/30"
                      : "text-[#2D3436] dark:text-gray-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[#ff6d34] hover:bg-[#F5F5F5] dark:hover:bg-gray-700"
              >
                {t("analytics.custom_range", "Custom range")}
              </button>
            </>
          ) : (
            <div className="space-y-3 p-2">
              <p className="font-semibold text-[#2D3436] dark:text-white">
                {t("analytics.custom_range", "Custom range")}
              </p>
              <label className="block text-sm text-[#2D3436] dark:text-gray-300">
                {t("analytics.from", "From")}
                <input
                  type="date"
                  value={from}
                  max={today}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setError("");
                  }}
                  className="mt-1 w-full rounded-lg border border-[#CCCCCC] bg-white p-2 text-[#2D3436] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
              <label className="block text-sm text-[#2D3436] dark:text-gray-300">
                {t("analytics.to", "To")}
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={today}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setError("");
                  }}
                  className="mt-1 w-full rounded-lg border border-[#CCCCCC] bg-white p-2 text-[#2D3436] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustom(false);
                    setError("");
                  }}
                  className="flex-1 rounded-lg border border-[#CCCCCC] px-3 py-2 text-sm dark:border-gray-700 dark:text-white"
                >
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 rounded-lg bg-[#ff6d34] px-3 py-2 text-sm font-medium text-white hover:bg-[#ff6d34]/90"
                >
                  {t("common.apply", "Apply")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DateRangeSelector;
