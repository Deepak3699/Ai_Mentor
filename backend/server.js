// backend/server.js
import express from "express";
import http from "node:http";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import healthRoutes from "./routes/healthRoutes.js";

import { connectDB, sequelize } from "./config/db.js";

// ================= ROUTES =================
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/userRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import sidebarRoutes from "./routes/sidebarRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import communityRoutes from "./routes/communityRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import certificateRoutes from "./routes/certificateRoutes.js";
import paymentRoutes from "./routes/payment.js";
import razorpayRoutes from "./routes/razorpay.js";
import preferenceRoutes from "./routes/preferenceRoutes.js";
import contactUsRoutes from "./routes/contactus.js";
import reportRoutes from "./routes/reportRoutes.js";
import docsRoutes from "./routes/docsRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";
import CalendarTaskRoutes from "./routes/CalendarTaskRoutes.js";

// ================= MODELS =================
import "./models/CommunityPost.js";
import "./models/Notification.js";
import "./models/Report.js";
import "./models/modelAssociations.js";
import "./models/Contactmessage.js";

dotenv.config();

import { validateEnv } from "./env-validator.js";
import { securityHeaders } from "./config/securityHeaders.js";

validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ================= SECURE CORS =================
const envOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((origin) => origin.trim())
  : [];

const defaultDevOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultDevOrigins]));

app.use(securityHeaders());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin (Postman, mobile apps, curl)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any localhost/127.0.0.1 origin in development
      if (process.env.NODE_ENV !== "production") {
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }

      console.error(`❌ Blocked by CORS: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ================= MIDDLEWARE =================
app.use(express.json({ limit: "100kb" }));

// ================= STATIC FILES =================
app.use("/videos", express.static(path.join(__dirname, "videos")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("✅ API is running...");
});

app.use("/health", healthRoutes);

// ================= API ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/payment/razorpay", razorpayRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/sidebar", sidebarRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/certificate", certificateRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/contactus", contactUsRoutes);
app.use("/api/course-reports", reportRoutes);
app.use("/api/docs", docsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/calendar", CalendarTaskRoutes);

// ================= 404 HANDLER =================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

// ================= GLOBAL ERROR HANDLER =================
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Payload Too Large",
    });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON",
    });
  }

  console.error("🔥 Global Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ================= SERVER START =================
const PORT = process.env.PORT || 5000;

// Maximum time allowed for graceful shutdown
const SHUTDOWN_TIMEOUT = 10_000;

let server;
let isShuttingDown = false;

// ================= GRACEFUL SHUTDOWN =================
const shutdown = async (signal) => {
  if (isShuttingDown) {
    console.log("⚠️ Shutdown already in progress.");
    return;
  }

  isShuttingDown = true;

  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

  // Force exit if shutdown takes too long
  const forceShutdownTimer = setTimeout(() => {
    console.error(
      `❌ Graceful shutdown timed out after ${
        SHUTDOWN_TIMEOUT / 1000
      } seconds. Forcing exit.`
    );

    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  // Do not keep the process alive because of this timer
  forceShutdownTimer.unref();

  try {
    // Stop accepting new connections.
    // Existing requests are allowed to finish.
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            console.log("✅ HTTP server closed.");
            resolve();
          }
        });
      });
    }

    // Close Sequelize database connections.
    if (sequelize) {
      await sequelize.close();
      console.log("✅ Sequelize database connection closed.");
    }

    clearTimeout(forceShutdownTimer);

    console.log("✅ Graceful shutdown completed.");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceShutdownTimer);

    console.error("❌ Error during graceful shutdown:", error);
    process.exit(1);
  }
};

// ================= SIGNAL HANDLERS =================
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

const startServer = async () => {
  try {
    await connectDB();

    const isDevelopment = process.env.NODE_ENV !== "production";
    const syncOptions = isDevelopment ? { alter: true } : {};

    await sequelize.sync(syncOptions);

    console.log(
      isDevelopment
        ? "✅ Database models synced with schema auto-alter enabled (development)"
        : "✅ Database models synced"
    );

    // Retain the HTTP server instance for graceful shutdown.
    server = app.listen(PORT, () => {
    const server = http.createServer(app);

    server.requestTimeout = 120_000;
    server.headersTimeout = 65_000;
    server.keepAliveTimeout = 60_000;

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log("✅ Allowed Origins:", allowedOrigins);
    });
  } catch (error) {
    console.error("❌ Server failed:", error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
