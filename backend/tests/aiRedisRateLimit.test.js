import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import {
  createAIRateLimiter,
  createRedisRateLimitStore,
  FailClosedRedisStoreWrapper,
} from "../middleware/aiRateLimiter.js";

/**
 * Creates an in-memory simulated Redis client implementing Redis protocol commands
 * required by rate-limit-redis (SCRIPT LOAD, EVALSHA, DEL, etc.) backed by a shared Map.
 */
const createSimulatedRedisClient = (sharedState = new Map()) => {
  let isClosed = false;
  return {
    isClosed: () => isClosed,
    call: async (cmd, ...args) => {
      if (isClosed) {
        throw new Error("Connection is closed");
      }
      const command = cmd.toUpperCase();
      if (command === "SCRIPT" && args[0]?.toUpperCase() === "LOAD") {
        return "mock-sha-rate-limit-v6";
      }
      if (command === "EVALSHA") {
        const key = args[2];
        const windowMs = Number(args[3] || 60000);
        const now = Date.now();
        const existing = sharedState.get(key) || { count: 0, expiresAt: now + windowMs };
        existing.count += 1;
        sharedState.set(key, existing);
        const pttl = Math.max(0, existing.expiresAt - now);
        return [existing.count, pttl];
      }
      if (command === "DEL") {
        args.forEach((k) => sharedState.delete(k));
        return 1;
      }
      return null;
    },
    quit: async () => {
      isClosed = true;
    },
    disconnect: () => {
      isClosed = true;
    },
  };
};

test("counters are shared across multiple backend instances via Redis store", async () => {
  const sharedRedisMemory = new Map();
  const redisClient1 = createSimulatedRedisClient(sharedRedisMemory);
  const redisClient2 = createSimulatedRedisClient(sharedRedisMemory);

  const handle1 = createRedisRateLimitStore({ client: redisClient1, prefix: "rl:video:" });
  const handle2 = createRedisRateLimitStore({ client: redisClient2, prefix: "rl:video:" });

  handle1.redisStore.init({ windowMs: 1000 });
  handle2.redisStore.init({ windowMs: 1000 });

  // Instance 1 records 1 request
  const hit1 = await handle1.redisStore.increment("user:42");
  assert.equal(hit1.totalHits, 1);

  // Instance 2 sees the shared counter and increments to 2
  const hit2 = await handle2.redisStore.increment("user:42");
  assert.equal(hit2.totalHits, 2);

  // Both instances read from the same Redis key
  assert.ok(sharedRedisMemory.has("rl:video:user:42"));

  await handle1.close();
  await handle2.close();
});

test("counters survive backend instance restart", async () => {
  const sharedRedisMemory = new Map();

  // Instance A starts, increments counter to 3, and shuts down
  const clientA = createSimulatedRedisClient(sharedRedisMemory);
  const handleA = createRedisRateLimitStore({ client: clientA, prefix: "rl:video:" });
  handleA.redisStore.init({ windowMs: 1000 });

  await handleA.redisStore.increment("user:99");
  await handleA.redisStore.increment("user:99");
  const hitA3 = await handleA.redisStore.increment("user:99");
  assert.equal(hitA3.totalHits, 3);

  // Instance A closes cleanly
  await handleA.close();
  assert.equal(clientA.isClosed(), true);

  // New Instance B boots up with same Redis store
  const clientB = createSimulatedRedisClient(sharedRedisMemory);
  const handleB = createRedisRateLimitStore({ client: clientB, prefix: "rl:video:" });
  handleB.redisStore.init({ windowMs: 1000 });

  // Counter survived the restart!
  const hitB4 = await handleB.redisStore.increment("user:99");
  assert.equal(hitB4.totalHits, 4);

  await handleB.close();
});

test("rate limiters use correct quota prefixes for scoping", async () => {
  const sharedRedisMemory = new Map();
  const client = createSimulatedRedisClient(sharedRedisMemory);

  const videoHandle = createRedisRateLimitStore({ client, prefix: "rl:video:" });
  const syllabusHandle = createRedisRateLimitStore({ client, prefix: "rl:syllabus:" });
  const sharedHandle = createRedisRateLimitStore({ client, prefix: "rl:ai:" });

  videoHandle.redisStore.init({ windowMs: 1000 });
  syllabusHandle.redisStore.init({ windowMs: 1000 });
  sharedHandle.redisStore.init({ windowMs: 1000 });

  await videoHandle.redisStore.increment("user:1");
  await syllabusHandle.redisStore.increment("user:1");
  await sharedHandle.redisStore.increment("user:1");

  const keys = Array.from(sharedRedisMemory.keys());

  assert.ok(keys.includes("rl:video:user:1"), "Expected rl:video: prefix");
  assert.ok(keys.includes("rl:syllabus:user:1"), "Expected rl:syllabus: prefix");
  assert.ok(keys.includes("rl:ai:user:1"), "Expected rl:ai: prefix");

  await videoHandle.close();
  await syllabusHandle.close();
  await sharedHandle.close();
});

test("deterministic failure handling: fail-closed policy rejects requests when Redis fails", async () => {
  const brokenRedisClient = {
    call: async () => {
      throw new Error("Redis cluster connection timeout");
    },
  };

  const handle = createRedisRateLimitStore({ client: brokenRedisClient, prefix: "rl:video:" });
  const failClosedStore = new FailClosedRedisStoreWrapper(handle.redisStore, "fail-closed", 500);

  // When Redis errors, fail-closed policy increments to MAX_SAFE_INTEGER
  const res = await failClosedStore.increment("user:1");
  assert.equal(res.totalHits, Number.MAX_SAFE_INTEGER);

  // Setup express endpoint using failClosedStore
  const app = express();
  app.use(express.json());
  const limiter = createAIRateLimiter({
    store: failClosedStore,
    windowMs: 500,
    max: 2,
  });

  app.post(
    "/test-fail-closed",
    (req, _res, next) => {
      req.user = { id: 1 };
      next();
    },
    limiter,
    (_req, res) => res.json({ allowed: true }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${server.address().port}/test-fail-closed`;

  try {
    const response = await fetch(url, { method: "POST" });
    assert.equal(response.status, 429);
    assert.ok(response.headers.get("retry-after"));
    const body = await response.json();
    assert.equal(body.error, "Too Many Requests");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("deterministic failure handling: fail-startup policy throws immediately on boot", async () => {
  assert.throws(
    () => {
      createAIRateLimiter({
        policy: "fail-startup",
        redisClient: {
          failOnStart: true,
          call: () => {
            throw new Error("ECONNREFUSED");
          },
        },
        store: null,
      });
    },
    (err) => {
      return (
        err instanceof Error &&
        err.message.includes(
          "[AI Rate Limit] Redis rate limit store failed to initialize on startup",
        )
      );
    },
  );
});

test("deterministic failure handling: degraded mode policy explicitly allows in-memory fallback", async () => {
  const brokenRedisStore = {
    increment: async () => {
      throw new Error("Redis down");
    },
  };

  const degradedStore = new FailClosedRedisStoreWrapper(brokenRedisStore, "degraded", 500);

  // Under degraded policy, local fallback counts smoothly
  const r1 = await degradedStore.increment("user:10");
  assert.equal(r1.totalHits, 1);
  const r2 = await degradedStore.increment("user:10");
  assert.equal(r2.totalHits, 2);
});

test("clean resource closure: close() releases Redis client without leaking handles", async () => {
  const sharedState = new Map();
  const client = createSimulatedRedisClient(sharedState);
  let disconnectCalled = false;
  client.disconnect = () => {
    disconnectCalled = true;
  };

  const handle = createRedisRateLimitStore({ client, prefix: "rl:video:" });
  await handle.close();

  assert.equal(disconnectCalled || client.isClosed(), true);
});
