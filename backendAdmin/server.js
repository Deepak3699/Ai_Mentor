// backendAdmin/server.js
import express from "express";
import http from "node:http";
import dotenv from "dotenv";
import cors from "cors";
import healthRoutes from "./routes/healthRoutes.js";

import { connectDB, closeDB, sequelize } from "./config/db.js";
import adminRoutes from "./routes/adminRoutes.js";
import { securityHeaders } from "./config/securityHeaders.js";
import requestContext from "./middleware/requestContext.js";

dotenv.config();

const app = express();
const shutdownController = new AbortController();
app.locals.shutdownSignal = shutdownController.signal;

const allowedOrigins = [
  process.env.FRONTEND_ADMIN_URL || "http://localhost:5174",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:5173"]
    : []),
];

app.use(securityHeaders());

app.use(requestContext);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// ================= MIDDLEWARE =================
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

// ================= ROUTES =================
app.use("/api/admin", adminRoutes);

// Health checks
app.get("/health", (req, res) => {
  res.status(200).json({ message: "Backend Admin Server is running" });
});

app.use("/health", healthRoutes);

// ================= 404 HANDLER =================
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ================= ERROR HANDLER =================
app.use((err, req, res, _next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Payload Too Large" });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON" });
  }

  console.error("ERROR:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

// ================= SERVER STARTUP =================
const PORT = process.env.PORT || 5001;
let server; // Keep reference to server globally for graceful shutdown handlers

const startServer = async () => {
  try {
    console.log("[STARTING] Admin backend startup");
    console.log("[CHECK] Connecting to admin database...");
    await connectDB();
    console.log("[OK] Admin database connected");

    server = http.createServer(app);

    server.requestTimeout = 120_000;
    server.headersTimeout = 65_000;
    server.keepAliveTimeout = 60_000;

    server.listen(PORT, () => {
      console.log(`[READY] Admin backend: http://localhost:${PORT}`);
    });

    const shutdown = () => {
      if (shutdownController.signal.aborted) return;
      shutdownController.abort();
      server.close(() => sequelize.close());
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    console.error("[FAILED] Admin backend startup failed:", error.message);
    process.exit(1);
  }
};

// ================= GRACEFUL SHUTDOWN (Issue #127) =================
let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[INFO] Received ${signal}. Starting graceful shutdown for admin server...`);

  // Force exit fallback timer (10 seconds)
  const forceExitTimeout = setTimeout(() => {
    console.error("[ERROR] Forced shutdown: Could not close admin connections in time.");
    process.exit(1);
  }, 10_000);

  if (!server) {
    console.log("[INFO] Admin server instance not initialized. Closing DB directly.");
    closeDB()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
    return;
  }

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error("[ERROR] Error closing admin HTTP server:", err);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }

    console.log("[OK] Admin HTTP server closed cleanly.");

    try {
      // Close database connection pool
      await closeDB();
      clearTimeout(forceExitTimeout);
      console.log("[OK] Admin graceful shutdown completed successfully.");
      process.exit(0);
    } catch (dbErr) {
      console.error("[ERROR] Error during admin database closure:", dbErr);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
