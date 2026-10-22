import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import Redis from "ioredis";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_REQUESTS = 5;

export const parseLimitOptions = (overrides = {}) => {
  const windowMs = Number(
    overrides.windowMs ??
      process.env.AI_RATE_LIMIT_WINDOW_MS ??
      (process.env.AI_RATE_LIMIT_WINDOW_MINUTES
        ? Number(process.env.AI_RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000
        : DEFAULT_WINDOW_MS),
  );

  const max = Number(
    overrides.max ??
      process.env.AI_RATE_LIMIT_MAX_REQUESTS ??
      process.env.AI_RATE_LIMIT_MAX ??
      DEFAULT_MAX_REQUESTS,
  );

  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS,
    max: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX_REQUESTS,
  };
};

/**
 * Creates a shared RedisStore for rate-limit-redis when deploying in multi-instance production.
 */
export const createRedisRateLimitStore = (options = {}) => {
  const host = options.host || process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(options.port || process.env.REDIS_PORT || 6379);
  const client =
    options.client || new Redis(process.env.REDIS_URL || { host, port, enableOfflineQueue: false });

  return new RedisStore({
    sendCommand: (...args) => client.call(...args),
    prefix: options.prefix || "rl:ai:",
  });
};

export const createAIRateLimiter = (options = {}) => {
  const parsed = parseLimitOptions(options);
  const sharedQuota = process.env.AI_RATE_LIMIT_SHARED_QUOTA === "true";
  const scope = sharedQuota ? "ai" : options.scope || "ai";

  let store = options.store;
  if (
    !store &&
    (process.env.USE_REDIS_RATE_LIMIT === "true" ||
      (process.env.NODE_ENV === "production" && !process.env.DISABLE_REDIS_RATE_LIMIT))
  ) {
    try {
      store = createRedisRateLimitStore({ prefix: `rl:${scope}:` });
    } catch (err) {
      console.warn(
        "[AI Rate Limit] Failed to initialize Redis store, falling back to memory store:",
        err.message,
      );
    }
  }

  return rateLimit({
    windowMs: parsed.windowMs,
    limit: options.max !== undefined ? parsed.max : () => parseLimitOptions().max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    store,
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `${scope}:user:${req.user.id}`;
      }
      return `${scope}:ip:${req.ip || "unknown"}`;
    },
    handler: (req, res, _next, limiterOptions) => {
      const headerRetry = res.getHeader("Retry-After");
      const retrySeconds = headerRetry
        ? Number(headerRetry)
        : Math.ceil((limiterOptions.windowMs || parsed.windowMs) / 1000);

      const safeRetrySeconds =
        Number.isFinite(retrySeconds) && retrySeconds > 0
          ? retrySeconds
          : Math.ceil((limiterOptions.windowMs || parsed.windowMs) / 1000);

      const retryMinutes = Math.ceil(safeRetrySeconds / 60);
      const hint =
        safeRetrySeconds < 60 ? `${safeRetrySeconds} second(s)` : `${retryMinutes} minute(s)`;

      // Safe logging: log event without raw user IDs or IP addresses
      console.warn(
        `[AI Rate Limit] Rate limit exceeded on ${req.method} ${req.originalUrl || req.url}`,
      );

      return res.status(429).json({
        message: `Too many AI generation requests. Please try again in ${hint}.`,
        error: "Too Many Requests",
        retryAfter: safeRetrySeconds,
      });
    },
    ...options,
  });
};

export const videoGenerationLimiter = createAIRateLimiter({ scope: "video" });
export const syllabusGenerationLimiter = createAIRateLimiter({ scope: "syllabus" });
export const aiGenerationLimiter = videoGenerationLimiter;
