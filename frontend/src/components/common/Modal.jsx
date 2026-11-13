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

  const handleCancel = () => {
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
