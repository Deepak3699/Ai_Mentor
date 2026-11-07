import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./learning-workspace.css";

// Portals keep fixed surfaces outside animated ancestors and the route scroller.
export default function OverlaySurface({
  children,
  labelledBy,
  onClose,
  variant = "modal",
  anchorRef,
  id,
}) {
  const surfaceRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState({});
  useLayoutEffect(() => {
    if (variant !== "popover" || !anchorRef?.current) return undefined;
    const place = () => {
      const rect = anchorRef.current.getBoundingClientRect();
      const width = Math.min(480, window.innerWidth - 32);
      const availableBelow = window.innerHeight - rect.bottom - 24;
      const below = availableBelow >= 260;
      setPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        width,
        top: below ? rect.bottom + 8 : undefined,
        bottom: below ? undefined : Math.max(16, window.innerHeight - rect.top + 8),
        maxHeight: Math.max(180, Math.min(560, below ? availableBelow : rect.top - 24)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, variant]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    const previous = document.activeElement;
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    if (root && !root.contains(surface)) root.inert = true;
    const scrollNodes = [document.body, ...document.querySelectorAll(".app-route-scroll")];
    const overflow = scrollNodes.map((node) => node.style.overflow);
    scrollNodes.forEach((node) => {
      node.style.overflow = "hidden";
    });
    const focusable = () =>
      [
        ...surface.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
        ),
      ].filter((node) => !node.closest("[hidden]"));
    (surface.querySelector("[data-initial-focus]") || focusable()[0] || surface).focus();
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = items[0],
        last = items.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !surface.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !surface.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const keepFocus = (event) => {
      if (!surface.contains(event.target)) (focusable()[0] || surface).focus();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", keepFocus);
      if (root) root.inert = wasInert;
      scrollNodes.forEach((node, i) => {
        node.style.overflow = overflow[i];
      });
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      className={`lw-overlay lw-overlay--${variant}`}
      data-shortcuts-ignore
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={surfaceRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`lw-surface lw-surface--${variant}`}
        style={variant === "popover" ? position : undefined}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
