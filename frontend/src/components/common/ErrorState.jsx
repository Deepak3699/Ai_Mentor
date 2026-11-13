const ErrorState = ({ title, message, onRetry, retryLabel }) => {
  return (
    <div
      role="alert"
      className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 bg-white dark:bg-[#1A1A1A]"
    >
      <div className="mb-4 rounded-full bg-red-100 dark:bg-red-900/30 p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-10 h-10 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">{title}</h2>

      <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>

      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-lg bg-[#ff6d34] hover:bg-[#ff6d34]/90 text-white font-medium transition-colors"
      >
        {retryLabel}
      </button>
    </div>
  );
};

export default ErrorState;
