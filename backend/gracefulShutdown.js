export const createGracefulShutdown = ({ getServer, database, timeoutMs = 10_000, beforeClose }) => {
  let isShuttingDown = false;

  return async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[INFO] Received ${signal}. Starting graceful shutdown...`);

    if (beforeClose) {
      try {
        beforeClose();
      } catch (err) {
        console.error("[ERROR] Error in beforeClose hook:", err);
      }
    }

    const forceExitTimeout = setTimeout(() => {
      console.error("[ERROR] Forced shutdown: Could not close connections in time.");
      process.exit(1);
    }, timeoutMs);

    const server = getServer?.();

    if (!server) {
      console.log("[INFO] Server instance not initialized. Closing DB directly.");
      try {
        if (database?.close) await database.close();
        clearTimeout(forceExitTimeout);
        process.exit(0);
      } catch (dbErr) {
        console.error("[ERROR] Error during database closure:", dbErr);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
      return;
    }

    server.close(async (err) => {
      if (err) {
        console.error("[ERROR] Error closing HTTP server:", err);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }

      console.log("[OK] HTTP server closed cleanly.");

      try {
        if (database?.close) await database.close();
        clearTimeout(forceExitTimeout);
        console.log("[OK] Graceful shutdown completed successfully.");
        process.exit(0);
      } catch (dbErr) {
        console.error("[ERROR] Error during database closure:", dbErr);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
    });
  };
};