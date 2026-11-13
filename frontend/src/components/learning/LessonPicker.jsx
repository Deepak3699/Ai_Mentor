import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, FileText, Play, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import OverlaySurface from "./OverlaySurface";

export default function LessonPicker({ modules = [], currentLesson, onSelect }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const triggerRef = useRef(null);
  const selectedLessonRef = useRef(null);
  const id = useId();
  const currentModule = modules.find((module) =>
    module.lessons?.some((lesson) => lesson.id === currentLesson?.id),
  );
  const term = query.trim().toLocaleLowerCase();
  useEffect(() => {
    if (!open || term || !selectedLessonRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      selectedLessonRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, expanded, term, currentLesson?.id]);
  const visible = modules
    .map((module, index) => ({
      ...module,
      key: module.id ?? index,
      lessons: (module.lessons || []).filter(
        (lesson) => !term || `${module.title} ${lesson.title}`.toLocaleLowerCase().includes(term),
      ),
    }))
    .filter((module) => module.lessons.length);
  const move = (event) => {
    if (
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
      event.target.tagName === "INPUT"
    )
      return;
    const buttons = [...event.currentTarget.querySelectorAll("button[data-picker-row]")].filter(
      (node) => !node.closest("[hidden]"),
    );
    const index = buttons.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault();
    buttons[next]?.focus();
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lw-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setExpanded(currentModule?.id ?? modules.indexOf(currentModule));
          setQuery("");
          setOpen(true);
        }}
      >
        <span className="lw-icon-tile">
          <BookOpen aria-hidden="true" size={18} />
        </span>
        <span className="lw-picker-copy">
          <span className="lw-picker-title">{t("learning.workspace.course_contents")}</span>
          <span className="lw-picker-lesson" title={currentLesson?.title}>
            {currentLesson?.title}
          </span>
          <span className="lw-picker-hint" title={currentModule?.title}>
            {currentModule?.title || t("learning.workspace.browse_contents")}
          </span>
        </span>
        <span className="lw-picker-chevron">
          <ChevronDown aria-hidden="true" size={20} className={open ? "lw-rotate" : ""} />
        </span>
      </button>
      {open && (
        <OverlaySurface
          id={id}
          variant="popover"
          anchorRef={triggerRef}
          labelledBy={`${id}-title`}
          onClose={() => setOpen(false)}
        >
          <header className="lw-surface-header">
            <div>
              <span className="lw-eyebrow">{t("learning.my_course")}</span>
              <h2 id={`${id}-title`}>{t("learning.contents")}</h2>
            </div>
            <button
              className="lw-icon-button"
              type="button"
              aria-label={t("learning.workspace.close")}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <label className="lw-search">
            <Search size={17} aria-hidden="true" />
            <input
              data-initial-focus
              type="search"
              aria-label={t("learning.workspace.search_lessons")}
              placeholder={t("learning.workspace.search_lessons")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="lw-picker-list" onKeyDown={move}>
            {!visible.length && (
              <p className="lw-empty-copy">{t("learning.workspace.no_results")}</p>
            )}
            {visible.map((module) => {
              const isExpanded = !!term || expanded === module.key;
              return (
                <div className="lw-module" key={module.key}>
                  <button
                    data-picker-row
                    type="button"
                    className="lw-module-trigger"
                    aria-expanded={isExpanded}
                    aria-controls={`${id}-${module.key}`}
                    onClick={() => setExpanded(isExpanded ? null : module.key)}
                  >
                    <span>{module.title}</span>
                    <span className="lw-count">{module.lessons.length}</span>
                    <ChevronDown
                      aria-hidden="true"
                      size={15}
                      className={isExpanded ? "lw-rotate" : ""}
                    />
                  </button>
                  <div id={`${id}-${module.key}`} hidden={!isExpanded}>
                    {module.lessons.map((lesson) => (
                      <button
                        data-picker-row
                        type="button"
                        key={lesson.id}
                        ref={lesson.id === currentLesson?.id ? selectedLessonRef : undefined}
                        className={`lw-lesson-row ${lesson.id === currentLesson?.id ? "is-selected" : ""}`}
                        aria-current={lesson.id === currentLesson?.id ? "step" : undefined}
                        onClick={() => {
                          onSelect(lesson);
                          setOpen(false);
                        }}
                      >
                        {lesson.type === "document" ? (
                          <FileText size={16} aria-hidden="true" />
                        ) : (
                          <Play size={15} aria-hidden="true" />
                        )}
                        <span>{lesson.title}</span>
                        {lesson.id === currentLesson?.id && <Check size={16} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </OverlaySurface>
      )}
    </>
  );
}
