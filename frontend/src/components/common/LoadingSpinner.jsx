import React from "react";

const LoadingSpinner = ({
  variant = "inline",
  label = "Loading page...",
  className = "",
  light = false,
}) => {
  const spinnerClass = light
    ? "border-white/30 border-t-white"
    : "border-blue-100 border-t-blue-500 dark:border-blue-950 dark:border-t-blue-400";

  if (variant === "compact") {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        role="status"
        aria-label={label}
      >
        <span
          className={`h-5 w-5 animate-spin rounded-full border-[2.5px] ${spinnerClass} motion-reduce:animate-none`}
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <div
      className={`flex min-h-[calc(100dvh-4rem)] w-full flex-1 items-center justify-center px-6 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center">
        <div
          className={`mx-auto h-10 w-10 animate-spin rounded-full border-[3px] ${spinnerClass} motion-reduce:animate-none`}
        />
        {label && <p className="mt-4 text-sm font-semibold text-muted">{label}</p>}
      </div>
    </div>
  );
};

export default LoadingSpinner;
