import React, { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // 1. React calls this when an error is thrown in any child component
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // 2. Log the error details for debugging
  componentDidCatch(error, errorInfo) {
    console.error("Unhandled render error:", error, errorInfo?.componentStack);
  }

  // 3. User action: reload the browser
  handleReload = () => {
    window.location.reload();
  };

  // 4. User action: reset state when navigating away
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    // If an error happened, show the fallback UI
    if (this.state.hasError) {
      // Allows passing a custom fallback UI if needed
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center text-gray-900 dark:text-gray-100"
        >
          {/* Warning Icon */}
          <div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-950 dark:text-red-400">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">
            An unexpected error occurred while rendering this page. Please reload or return to the
            dashboard.
          </p>

          {/* Recovery Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              Reload page
            </button>
            <a
              href="/dashboard"
              onClick={this.handleReset}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      );
    }

    // If no error, render the normal children as usual
    return this.props.children;
  }
}

export default ErrorBoundary;
