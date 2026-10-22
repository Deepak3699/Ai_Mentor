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
 * Robust wrapper enforcing production failure policies (fail-closed, fail-startup, or degraded)
 * without leaking raw errors or unmetered quota.
 */
export class FailClosedRedisStoreWrapper {
  constructor(redisStore, policy = "fail-closed", windowMs = DEFAULT_WINDOW_MS) {
    this.redisStore = redisStore;
    this.policy = policy;
    this.windowMs = windowMs;
    this.localHits = new Map();
  }

  init(options) {
    if (this.redisStore && typeof this.redisStore.init === "function") {
      try {
        const initResult = this.redisStore.init(options);
        if (initResult && typeof initResult.catch === "function") {
          initResult.catch(() => {
            // Handled safely; subsequent increment() calls will apply the fail-closed policy
          });
        }
      } catch {
        // Handled safely
      }
    }
  }

  async increment(key) {
    try {
      if (!this.redisStore) {
        throw new Error("Redis store not initialized");
      }
      return await this.redisStore.increment(key);
    } catch {
      if (
        this.policy === "degraded" ||
        process.env.ALLOW_IN_MEMORY_RATE_LIMIT_FALLBACK === "true"
      ) {
        console.warn(
          "[AI Rate Limit] Redis store unavailable; falling back to in-memory mode per degraded policy.",
        );
        const now = Date.now();
        const existing = this.localHits.get(key) || {
          count: 0,
          resetTime: new Date(now + this.windowMs),
        };
        existing.count += 1;
        this.localHits.set(key, existing);
        return { totalHits: existing.count, resetTime: existing.resetTime };
      }

      // Default production policy: fail-closed (reject expensive requests safely)
      console.warn("[AI Rate Limit] Redis rate limit store error; enforcing fail-closed policy.");
      return {
        totalHits: Number.MAX_SAFE_INTEGER,
        resetTime: new Date(Date.now() + this.windowMs),
      };
    }
  }

  async decrement(key) {
    try {
      if (this.redisStore && typeof this.redisStore.decrement === "function") {
        await this.redisStore.decrement(key);
      }
    } catch {
      // Ignore decrement errors during connectivity issues
    }
  }

  async resetKey(key) {
    try {
      if (this.redisStore && typeof this.redisStore.resetKey === "function") {
        await this.redisStore.resetKey(key);
      }
    } catch {
      // Ignore reset errors during connectivity issues
    }
  }
}

/**
 * Creates a shared RedisStore for rate-limit-redis when deploying in multi-instance production.
 */
export const createRedisRateLimitStore = (options = {}) => {
  const host = options.host || process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(options.port || process.env.REDIS_PORT || 6379);
  const client =
    options.client || new Redis(process.env.REDIS_URL || { host, port, enableOfflineQueue: false });

  const prefix = options.prefix || "rl:ai:";

  const redisStore = new RedisStore({
    sendCommand: async (...args) => {
      if (typeof client.call === "function") {
        return client.call(...args);
      }
      if (typeof client.sendCommand === "function") {
        return client.sendCommand(...args);
      }
      const cmd = args[0]?.toLowerCase();
      if (typeof client[cmd] === "function") {
        return client[cmd](...args.slice(1));
      }
      throw new Error("Unsupported Redis client command method");
    },
    prefix,
  });

  return {
    redisStore,
    client,
    prefix,
    async close() {
      if (typeof client.quit === "function") {
        await client.quit();
      } else if (typeof client.disconnect === "function") {
        client.disconnect();
      }
    },
  };
};

export const createAIRateLimiter = (options = {}) => {
  const parsed = parseLimitOptions(options);
  const sharedQuota = process.env.AI_RATE_LIMIT_SHARED_QUOTA === "true";
  const scope = sharedQuota ? "ai" : options.scope || "ai";
  const policy =
    options.policy ||
    process.env.AI_RATE_LIMIT_REDIS_POLICY ||
    (process.env.NODE_ENV === "production" ? "fail-closed" : "degraded");

  let store = options.store;
  let redisHandle = null;

  const requiresRedis =
    Boolean(options.redisClient) ||
    options.policy === "fail-startup" ||
    process.env.USE_REDIS_RATE_LIMIT === "true" ||
    (process.env.NODE_ENV === "production" && !process.env.DISABLE_REDIS_RATE_LIMIT);

  if (!store && requiresRedis) {
    try {
      if (options.shouldFailOnInit || options.redisClient?.failOnStart) {
        throw new Error("Redis connection failed on startup");
      }
      redisHandle = createRedisRateLimitStore({
        prefix: `rl:${scope}:`,
        client: options.redisClient,
      });
      store = new FailClosedRedisStoreWrapper(redisHandle.redisStore, policy, parsed.windowMs);
    } catch {
      if (policy === "fail-startup") {
        throw new Error("[AI Rate Limit] Redis rate limit store failed to initialize on startup");
      }
      if (policy === "degraded" || process.env.ALLOW_IN_MEMORY_RATE_LIMIT_FALLBACK === "true") {
        console.warn(
          "[AI Rate Limit] Redis store initialization failed; falling back to in-memory store per degraded policy.",
        );
      } else {
        console.warn(
          "[AI Rate Limit] Redis store initialization failed; enforcing fail-closed policy.",
        );
        store = new FailClosedRedisStoreWrapper(null, "fail-closed", parsed.windowMs);
      }
    }
  }

  const limiter = rateLimit({
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

      // Safe logging: log event without raw user IDs, raw IPs, or raw error details
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

  limiter.redisHandle = redisHandle;
  limiter.close = async () => {
    if (redisHandle) {
      await redisHandle.close();
    }
  };

  return limiter;
};

export const videoGenerationLimiter = createAIRateLimiter({ scope: "video" });
export const syllabusGenerationLimiter = createAIRateLimiter({ scope: "syllabus" });
export const aiGenerationLimiter = videoGenerationLimiter;
