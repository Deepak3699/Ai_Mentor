import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";

const ReportModal = ({
  show,
  onClose,
  onSubmit,
  reportText,
  setReportText,
  reportType,
  setReportType,
  enrolledCourses,
  subType,
  setSubType,
  selectedCourse,
  setSelectedCourse,
  loading,
}) => {
  const [openDropdown, setOpenDropdown] = useState(false);
  const [openCourseDropdown, setOpenCourseDropdown] = useState(false);
  const [openSubDropdown, setOpenSubDropdown] = useState(false);
  const [shouldRender, setShouldRender] = useState(show);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame;
    let timer;
    if (show) {
      setShouldRender(true);
      frame = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      timer = window.setTimeout(() => setShouldRender(false), 180);
    }
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [show]);
  useEffect(() => {
    const handleOutsideDropdownClick = (event) => {
      if (event.target.closest("[data-report-dropdown]")) return;

      setOpenDropdown(false);
      setOpenCourseDropdown(false);
      setOpenSubDropdown(false);
    };

    document.addEventListener("pointerdown", handleOutsideDropdownClick);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideDropdownClick);
    };
  }, []);
  const requestClose = () => {
    setVisible(false);
    window.setTimeout(onClose, 180);
  };

  const reportOptions = ["Bug / Error", "Course", "Payment Issue", "Other"];

  const subOptionsMap = {
    "Bug / Error": [
      "App Crash",
      "Button Not Working",
      "Page Not Loading",
      "UI Issue",
      "Slow Performance",
    ],
    "Payment Issue": [
      "Payment Failed",
      "Amount Deducted",
      "Refund Not Received",
      "Wrong Charge",
      "Other",
    ],
    Course: [
      "Course Not Loading",
      "Video Not Working",
      "Offensive Content",
      "Audio Issue",
      "Subtitles Missing",
      "Lesson Missing",
      "Access Issue",
      "Other",
    ],
  };

  if (!shouldRender) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center px-4 ui-overlay ${visible ? "is-open" : "is-closing"}`}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[4px] dark:bg-black/55"
        onClick={requestClose}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 text-main shadow-2xl ui-modal-surface"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <LoadingSpinner variant="compact" label="Submitting report" />
            <p className="text-sm text-gray-600 dark:text-gray-300">Submitting report...</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Report an Issue
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Help us improve your experience
                </p>
              </div>

              <button
                onClick={requestClose}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition"
              >
                <X className="w-4 h-4 text-gray-700 dark:text-white" />
              </button>
            </div>

            <div className="relative mb-5">
              <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                Issue Type
              </label>

              <button
                onClick={() => {
                  setOpenDropdown(!openDropdown);
                  setOpenCourseDropdown(false);
                  setOpenSubDropdown(false);
                }}
                data-report-dropdown
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-[#3867D6] focus:border-[#3867D6] transition"
              >
                {reportType}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${openDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {openDropdown && (
                <div
                  className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card text-main shadow-xl ui-popover-surface"
                  data-report-dropdown
                >
                  {reportOptions.map((option) => (
                    <div
                      key={option}
                      onClick={() => {
                        setReportType(option);
                        setSelectedCourse("");
                        setSubType("");
                        setOpenDropdown(false);
                      }}
                      className="cursor-pointer px-4 py-2.5 text-sm text-main transition-colors hover:bg-canvas-alt"
                    >
                      {option}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {reportType === "Course" && (
              <div className="relative mb-5">
                <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                  Select Course
                </label>

                <button
                  onClick={() => {
                    setOpenCourseDropdown(!openCourseDropdown);
                    setOpenDropdown(false);
                    setOpenSubDropdown(false);
                  }}
                  data-report-dropdown
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-[#3867D6] focus:border-[#3867D6] transition"
                >
                  {selectedCourse || "Select your course"}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${openCourseDropdown ? "rotate-180" : ""}`}
                  />
                </button>

                {openCourseDropdown && (
                  <div
                    className="absolute z-50 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-card text-main shadow-xl ui-popover-surface"
                    data-report-dropdown
                  >
                    {enrolledCourses.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">No enrolled courses</div>
                    ) : (
                      enrolledCourses.map((course) => (
                        <div
                          key={course.id}
                          onClick={() => {
                            setSelectedCourse(course.title);
                            setSubType("");
                            setOpenCourseDropdown(false);
                          }}
                          className="cursor-pointer px-4 py-2.5 text-sm text-main transition-colors hover:bg-canvas-alt"
                        >
                          {course.title}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {reportType !== "Select Issue Type" &&
              reportType !== "Other" &&
              (reportType !== "Course" || selectedCourse) && (
                <div className="relative mb-5">
                  <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                    Select Reason
                  </label>

                  <button
                    onClick={() => {
                      setOpenSubDropdown(!openSubDropdown);
                      setOpenDropdown(false);
                      setOpenCourseDropdown(false);
                    }}
                    data-report-dropdown
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-[#3867D6] focus:border-[#3867D6] transition"
                  >
                    {subType || "Select reason"}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${openSubDropdown ? "rotate-180" : ""}`}
                    />
                  </button>

                  {openSubDropdown && (
                    <div
                      className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card text-main shadow-xl ui-popover-surface"
                      data-report-dropdown
                    >
                      {(subOptionsMap[reportType] || []).map((item) => (
                        <div
                          key={item}
                          onClick={() => {
                            setSubType(item);
                            setOpenSubDropdown(false);
                          }}
                          className="cursor-pointer px-4 py-2.5 text-sm text-main transition-colors hover:bg-canvas-alt"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            <div className="mb-6">
              <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">
                Description
              </label>

              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={4}
                placeholder="Describe the issue..."
                className="w-full rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 pb-12 pr-20 text-sm transition-colors dark:border-white/10 dark:bg-white/5 focus:border-[#3867D6] focus:outline-none focus:ring-1 focus:ring-[#3867D6]/60"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-white hover:opacity-80 transition"
              >
                Cancel
              </button>

              <button
                disabled={
                  loading ||
                  reportType === "Select Issue Type" ||
                  !reportText.trim() ||
                  (reportType === "Course" && (!selectedCourse || !subType))
                }
                onClick={() =>
                  onSubmit({
                    reportType,
                    reportText,
                    course: selectedCourse,
                    subType,
                  })
                }
                className="flex-1 py-3 rounded-lg bg-[#3867D6] text-white font-medium hover:bg-[#315BC0] transition disabled:opacity-40 flex items-center justify-center"
              >
                {loading ? (
                  <LoadingSpinner variant="compact" light label="Submitting report" />
                ) : (
                  "Submit"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ReportModal;
