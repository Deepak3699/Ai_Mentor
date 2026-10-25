const DEFAULT_TIMEOUT_MS = 10_000;

export function createGracefulShutdown({
  getServer,
  database,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console,
  exit = (code) => process.exit(code),
  timers = {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (timer) => clearTimeout(timer),
  },
}) {
  let shutdownPromise;

  return function shutdown(signal) {
    if (shutdownPromise) {
      logger.log("Shutdown already in progress.");
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      let timeoutHandle;
      let timedOut = false;

      logger.log(`${signal} received. Starting graceful shutdown.`);

      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = timers.setTimeout(() => {
          timedOut = true;
          reject(new Error("Shutdown timed out."));
        }, timeoutMs);

        timeoutHandle?.unref?.();
      });

      const closeResources = async () => {
        const server = getServer();

        if (server?.listening) {
          await new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          logger.log("HTTP server closed.");
        }

        if (database) {
          await database.close();
          logger.log("Database connection closed.");
        }
      };

      try {
        await Promise.race([closeResources(), timeoutPromise]);

        logger.log("Graceful shutdown completed.");
        exit(0);
      } catch {
        if (timedOut) {
          logger.error("Graceful shutdown timed out.");
        } else {
          logger.error("Graceful shutdown failed.");
        }

        exit(1);
      } finally {
        if (timeoutHandle !== undefined) {
          timers.clearTimeout(timeoutHandle);
        }
      }
    })();

    return shutdownPromise;
  };
}
