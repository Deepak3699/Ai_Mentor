import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createGracefulShutdown } from "../gracefulShutdown.js";

function createLogger() {
  return {
    messages: [],
    log(message) {
      this.messages.push({ level: "log", message });
    },
    error(message) {
      this.messages.push({ level: "error", message });
    },
  };
}

function createFakeTimers() {
  const state = { callback: null, cleared: false };

  return {
    state,
    timers: {
      setTimeout(callback) {
        state.callback = callback;
        return { unref() {} };
      },
      clearTimeout() {
        state.cleared = true;
      },
    },
  };
}

test("normal shutdown closes HTTP server and database", async () => {
  const events = [];
  const logger = createLogger();
  const { timers, state } = createFakeTimers();

  const server = {
    listening: true,
    close(callback) {
      events.push("server");
      callback();
    },
  };

  const database = {
    async close() {
      events.push("database");
    },
  };

  const shutdown = createGracefulShutdown({
    getServer: () => server,
    database,
    logger,
    timers,
    exit: (code) => events.push(`exit:${code}`),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(events, ["server", "database", "exit:0"]);
  assert.ok(logger.messages.some(({ message }) =>
    message.includes("completed"),
  ));
  assert.equal(state.cleared, true);
});

test("shutdown waits for an active HTTP request to finish", async () => {
  const events = [];
  const logger = createLogger();
  const { timers } = createFakeTimers();

  let markRequestStarted;

  const requestStarted = new Promise((resolve) => {
    markRequestStarted = resolve;
  });

  const server = http.createServer((_req, res) => {
    markRequestStarted();

    setTimeout(() => {
      res.end("finished");
    }, 60);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const responseFinished = new Promise((resolve, reject) => {
    http
      .get(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/",
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
          res.on("error", reject);
        },
      )
      .on("error", reject);
  });

  await requestStarted;

  const shutdown = createGracefulShutdown({
    getServer: () => server,
    database: {
      async close() {
        events.push("database");
      },
    },
    logger,
    timers,
    exit: (code) => events.push(`exit:${code}`),
  });

  const shutdownPromise = shutdown("SIGTERM");

  assert.deepEqual(events, []);

  await responseFinished;
  await shutdownPromise;

  assert.deepEqual(events, ["database", "exit:0"]);
  assert.equal(server.listening, false);
});

test("timeout fallback exits with status 1", async () => {
  const logger = createLogger();
  const { timers, state } = createFakeTimers();
  const events = [];

  const server = {
    listening: true,
    close() {
      // Simulate an HTTP server that never finishes closing.
    },
  };

  const shutdown = createGracefulShutdown({
    getServer: () => server,
    database: { async close() {} },
    logger,
    timers,
    exit: (code) => events.push(code),
  });

  const shutdownPromise = shutdown("SIGTERM");

  assert.equal(typeof state.callback, "function");

  state.callback();

  await shutdownPromise;

  assert.deepEqual(events, [1]);
  assert.ok(logger.messages.some(({ message }) =>
    message.includes("timed out"),
  ));
});

test("HTTP close failure exits with status 1", async () => {
  const logger = createLogger();
  const { timers } = createFakeTimers();
  const events = [];

  const server = {
    listening: true,
    close(callback) {
      callback(new Error("simulated HTTP close failure"));
    },
  };

  const database = {
    async close() {
      events.push("database");
    },
  };

  const shutdown = createGracefulShutdown({
    getServer: () => server,
    database,
    logger,
    timers,
    exit: (code) => events.push(`exit:${code}`),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(events, ["exit:1"]);
  assert.ok(logger.messages.some(({ message }) =>
    message.includes("failed"),
  ));

  assert.ok(
    logger.messages.every(({ message }) =>
      !message.includes("simulated HTTP close failure"),
    ),
  );
});

test("database close failure exits with status 1", async () => {
  const logger = createLogger();
  const { timers } = createFakeTimers();
  const events = [];

  const server = {
    listening: true,
    close(callback) {
      callback();
    },
  };

  const database = {
    async close() {
      throw new Error("simulated database close failure");
    },
  };

  const shutdown = createGracefulShutdown({
    getServer: () => server,
    database,
    logger,
    timers,
    exit: (code) => events.push(code),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(events, [1]);
  assert.ok(logger.messages.some(({ message }) =>
    message.includes("failed"),
  ));

  assert.ok(
    logger.messages.every(({ message }) =>
      !message.includes("simulated database close failure"),
    ),
  );
});

test("repeated shutdown signals do not close resources twice", async () => {
  const logger = createLogger();
  const { timers } = createFakeTimers();

  let closeCount = 0;
  let finishClose;

  const server = {
    listening: true,
    close(callback) {
      closeCount += 1;
      finishClose = callback;
    },
  };

  let databaseCloseCount = 0;
  const exitCodes = [];

  const shutdown = createGracefulShutdown({
    getServer: () => server,
    database: {
      async close() {
        databaseCloseCount += 1;
      },
    },
    logger,
    timers,
    exit: (code) => exitCodes.push(code),
  });

  const firstShutdown = shutdown("SIGTERM");
  const secondShutdown = shutdown("SIGINT");

  assert.strictEqual(firstShutdown, secondShutdown);
  assert.equal(closeCount, 1);

  finishClose();

  await firstShutdown;

  assert.equal(closeCount, 1);
  assert.equal(databaseCloseCount, 1);
  assert.deepEqual(exitCodes, [0]);
  assert.ok(logger.messages.some(({ message }) =>
    message.includes("already in progress"),
  ));
});

test("shutdown without a listening server still closes the database", async () => {
  const logger = createLogger();
  const { timers } = createFakeTimers();
  const events = [];

  const shutdown = createGracefulShutdown({
    getServer: () => null,
    database: {
      async close() {
        events.push("database");
      },
    },
    logger,
    timers,
    exit: (code) => events.push(`exit:${code}`),
  });

  await shutdown("SIGTERM");

  assert.deepEqual(events, ["database", "exit:0"]);
});