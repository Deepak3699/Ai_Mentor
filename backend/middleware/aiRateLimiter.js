import rateLimit from "express-rate-limit";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_REQUESTS = 5;

export const parseLimitOptions = (overrides = {}) => {
  const windowMs = Number(
    overrides.windowMs ??
      process.env.AI_RATE_LIMIT_WINDOW_MS ??
      (process.env.AI_RATE_LIMIT_WINDOW_MINUTES
        ? Number(process.env.AI_RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000
        : DEFAULT_WINDOW_MS)
  );

  const max = Number(
    overrides.max ??
      process.env.AI_RATE_LIMIT_MAX_REQUESTS ??
      process.env.AI_RATE_LIMIT_MAX ??
      DEFAULT_MAX_REQUESTS
  );

  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS,
    max: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_REQUESTS,
  };
};

export const createAIRateLimiter = (options = {}) => {
  const parsed = parseLimitOptions(options);

  return rateLimit({
    windowMs: parsed.windowMs,
    limit: options.max !== undefined ? parsed.max : () => parseLimitOptions().max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `user:${req.user.id}`;
      }
      return req.ip || "unknown";
    },
    handler: (req, res, _next, limiterOptions) => {
      const headerRetry = res.getHeader("Retry-After");
      const retrySeconds = headerRetry
        ? Number(headerRetry)
        : Math.ceil((limiterOptions.windowMs || parsed.windowMs) / 1000);

      const safeRetrySeconds = Number.isFinite(retrySeconds) && retrySeconds > 0
        ? retrySeconds
        : Math.ceil((limiterOptions.windowMs || parsed.windowMs) / 1000);

      const retryMinutes = Math.ceil(safeRetrySeconds / 60);
      const hint = safeRetrySeconds < 60
        ? `${safeRetrySeconds} second(s)`
        : `${retryMinutes} minute(s)`;

      const identifier = req.user?.id ? `User ${req.user.id}` : `IP ${req.ip || "unknown"}`;
      console.warn(`[AI Rate Limit] ${identifier} exceeded rate limit on ${req.method} ${req.originalUrl || req.url}`);

      return res.status(429).json({
        message: `Too many AI generation requests. Please try again in ${hint}.`,
        error: "Too Many Requests",
        retryAfter: safeRetrySeconds,
      });
    },
    ...options,
  });
};

export const aiGenerationLimiter = createAIRateLimiter();
