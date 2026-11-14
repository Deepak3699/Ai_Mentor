import { useEffect, useRef } from "react";

const Modal = ({
  open,
  onClose,
  labelledBy,
  className = "",
  dismissOnBackdrop = false,
  children,
}) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (open && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  const handleEscape = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }

    if (event.key === "Tab") {
      const dialog = dialogRef.current;
      const focusableElements = Array.from(
        dialog.querySelectorAll(
          'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, object, embed, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.closest("[hidden], [inert], [aria-hidden='true']") &&
          element.getClientRects().length > 0,
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!firstElement) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  const handleCancel = (event) => {
    event.preventDefault();
    onCloseRef.current();
  };

  const handleBackdropClick = (event) => {
    if (dismissOnBackdrop && event.target === event.currentTarget) {
      onCloseRef.current();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={handleEscape}
      onCancel={handleCancel}
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none border-0 bg-transparent p-0 text-inherit"
    >
      <div className={className} onClick={handleBackdropClick}>
        {children}
      </div>
    </dialog>
  );
};

export default Modal;
