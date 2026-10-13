/**
 * fetchWithTimeout
 *
 * A thin wrapper around the global `fetch` that aborts the request after a
 * configurable timeout so a slow or unreachable service cannot hang an Express
 * request forever.
 *
 * The default timeout is read from `AI_SERVICE_TIMEOUT_MS` (milliseconds) and
 * falls back to {@link DEFAULT_AI_SERVICE_TIMEOUT_MS} when it is missing or
 * invalid. Pass `{ timeoutMs }` as the third argument to override per call.
 *
 * A timeout is surfaced to callers as an error whose `name` is `"TimeoutError"`;
 * use {@link isTimeoutError} to detect it and respond with a 503.
 */

export const DEFAULT_AI_SERVICE_TIMEOUT_MS = 30000;

export const AI_SERVICE_TIMEOUT_MESSAGE =
  "The AI service is not responding. Please try again shortly.";

export const getAiServiceTimeoutMs = () => {
  const configured = Number(process.env.AI_SERVICE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_AI_SERVICE_TIMEOUT_MS;
};

export const isTimeoutError = (error) =>
  error?.name === "TimeoutError" || error?.name === "AbortError";

const fetchWithTimeout = (url, options = {}, { timeoutMs } = {}) => {
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : getAiServiceTimeoutMs();
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
};

export default fetchWithTimeout;
