export const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

const toDetailArray = (details) => {
  if (Array.isArray(details)) return details;
  if (details && typeof details === "object") return [details];
  return [];
};

export const normalizeApiError = (error, fallbackMessage = DEFAULT_ERROR_MESSAGE) => {
  const response = error?.response;
  const payload = response?.data ?? error?.data ?? error ?? {};
  const apiError = payload?.error && typeof payload.error === "object" ? payload.error : payload;
  const status = response?.status ?? error?.status ?? null;
  const code =
    typeof apiError?.code === "string" && apiError.code.trim()
      ? apiError.code
      : typeof payload?.code === "string" && payload.code.trim()
        ? payload.code
        : typeof error?.code === "string" && error.code.trim()
          ? error.code
          : "UNKNOWN_ERROR";

  const message =
    typeof apiError?.message === "string" && apiError.message.trim()
      ? apiError.message
      : typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : typeof error?.message === "string" && error.message.trim()
          ? error.message
          : fallbackMessage;

  const details = toDetailArray(apiError?.details ?? payload?.details ?? error?.details ?? []);

  return {
    code,
    message,
    details,
    status,
    raw: payload,
  };
};

export const getErrorMessage = (error, fallbackMessage = DEFAULT_ERROR_MESSAGE) =>
  normalizeApiError(error, fallbackMessage).message;

export const getFieldErrors = (error) => {
  const { details } = normalizeApiError(error);
  const fieldErrors = {};

  details.forEach((detail) => {
    const fieldName = detail?.field || detail?.path || detail?.name;
    const detailMessage = detail?.message || detail?.error || detail?.detail;

    if (fieldName && detailMessage) {
      fieldErrors[String(fieldName)] = String(detailMessage);
    }
  });

  return fieldErrors;
};

export default normalizeApiError;
