<<<<<<< HEAD
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
=======
import React, { useId, useState } from "react";
import { ArrowDown, X } from "lucide-react";
import Modal from "./Modal";
>>>>>>> 8194845 (fix: improve learner modal accessibility)

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
  const modalTitleId = useId();
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

<<<<<<< HEAD
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
=======
  return (
    <Modal
      open={show}
      onClose={onClose}
      labelledBy={modalTitleId}
      dismissOnBackdrop
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <div
        className="relative w-full max-w-md bg-white/90 dark:bg-black/50 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-2xl"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <h2 id={modalTitleId} className="sr-only">
              Report an Issue
            </h2>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500"></div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Submitting report...
            </p>
>>>>>>> 8194845 (fix: improve learner modal accessibility)
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 id={modalTitleId} className="text-xl font-semibold text-gray-900 dark:text-white">
                  Report an Issue
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Help us improve your experience
                </p>
              </div>

              <button
<<<<<<< HEAD
                onClick={requestClose}
=======
                onClick={onClose}
                aria-label="Close report dialog"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
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
<<<<<<< HEAD
                onClick={() => {
                  setOpenDropdown(!openDropdown);
                  setOpenCourseDropdown(false);
                  setOpenSubDropdown(false);
                }}
                data-report-dropdown
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-[#3867D6] focus:border-[#3867D6] transition"
=======
                onClick={() => setOpenDropdown(!openDropdown)}
                aria-haspopup="listbox"
                aria-expanded={openDropdown}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-teal-400 transition"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
              >
                {reportType}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${openDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {openDropdown && (
<<<<<<< HEAD
                <div
                  className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card text-main shadow-xl ui-popover-surface"
                  data-report-dropdown
                >
=======
                <div role="listbox" className="absolute mt-2 w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-lg shadow-lg overflow-hidden z-50">
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                  {reportOptions.map((option) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={reportType === option}
                      key={option}
                      onClick={() => {
                        setReportType(option);
                        setSelectedCourse("");
                        setSubType("");
                        setOpenDropdown(false);
                      }}
<<<<<<< HEAD
                      className="cursor-pointer px-4 py-2.5 text-sm text-main transition-colors hover:bg-canvas-alt"
=======
                      className="w-full px-4 py-3 text-left text-sm hover:bg-teal-50 dark:hover:bg-white/10 transition"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                    >
                      {option}
                    </button>
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
<<<<<<< HEAD
                  onClick={() => {
                    setOpenCourseDropdown(!openCourseDropdown);
                    setOpenDropdown(false);
                    setOpenSubDropdown(false);
                  }}
                  data-report-dropdown
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-[#3867D6] focus:border-[#3867D6] transition"
=======
                  onClick={() => setOpenCourseDropdown(!openCourseDropdown)}
                  aria-haspopup="listbox"
                  aria-expanded={openCourseDropdown}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-teal-400 transition"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                >
                  {selectedCourse || "Select your course"}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${openCourseDropdown ? "rotate-180" : ""}`}
                  />
                </button>

                {openCourseDropdown && (
<<<<<<< HEAD
                  <div
                    className="absolute z-50 mt-2 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-card text-main shadow-xl ui-popover-surface"
                    data-report-dropdown
                  >
=======
                  <div role="listbox" className="absolute mt-2 w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-lg shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                    {enrolledCourses.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">No enrolled courses</div>
                    ) : (
                      enrolledCourses.map((course) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedCourse === course.title}
                          key={course.id}
                          onClick={() => {
                            setSelectedCourse(course.title);
                            setSubType("");
                            setOpenCourseDropdown(false);
                          }}
<<<<<<< HEAD
                          className="cursor-pointer px-4 py-2.5 text-sm text-main transition-colors hover:bg-canvas-alt"
=======
                          className="w-full px-4 py-3 text-left text-sm hover:bg-teal-50 dark:hover:bg-white/10 transition"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                        >
                          {course.title}
                        </button>
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
<<<<<<< HEAD
                    onClick={() => {
                      setOpenSubDropdown(!openSubDropdown);
                      setOpenDropdown(false);
                      setOpenCourseDropdown(false);
                    }}
                    data-report-dropdown
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-[#3867D6] focus:border-[#3867D6] transition"
=======
                    onClick={() => setOpenSubDropdown(!openSubDropdown)}
                    aria-haspopup="listbox"
                    aria-expanded={openSubDropdown}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm hover:border-teal-400 transition"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                  >
                    {subType || "Select reason"}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${openSubDropdown ? "rotate-180" : ""}`}
                    />
                  </button>

                  {openSubDropdown && (
<<<<<<< HEAD
                    <div
                      className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card text-main shadow-xl ui-popover-surface"
                      data-report-dropdown
                    >
=======
                    <div role="listbox" className="absolute mt-2 w-full bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-lg shadow-lg overflow-hidden z-50">
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                      {(subOptionsMap[reportType] || []).map((item) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={subType === item}
                          key={item}
                          onClick={() => {
                            setSubType(item);
                            setOpenSubDropdown(false);
                          }}
<<<<<<< HEAD
                          className="cursor-pointer px-4 py-2.5 text-sm text-main transition-colors hover:bg-canvas-alt"
=======
                          className="w-full px-4 py-3 text-left text-sm hover:bg-teal-50 dark:hover:bg-white/10 transition"
>>>>>>> 8194845 (fix: improve learner modal accessibility)
                        >
                          {item}
                        </button>
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
<<<<<<< HEAD
    </div>,
    document.body,
=======
    </Modal>
>>>>>>> 8194845 (fix: improve learner modal accessibility)
  );
};

export default ReportModal;
