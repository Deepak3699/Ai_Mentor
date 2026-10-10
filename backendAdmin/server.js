// backendAdmin/server.js
import express from "express";
import http from "node:http";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import healthRoutes from "./routes/healthRoutes.js";

import { connectDB } from "./config/db.js";
import adminRoutes from "./routes/adminRoutes.js";
import { securityHeaders } from "./config/securityHeaders.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_ADMIN_URL || "http://localhost:5174",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:5173"]
    : []),
];

app.use(securityHeaders());

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
app.use((err, req, res, next) => {
  
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

const startServer = async () => {
  try {
    await connectDB();
    const server = http.createServer(app);

    server.requestTimeout = 120_000;
    server.headersTimeout = 65_000;
    server.keepAliveTimeout = 60_000;

    server.listen(PORT, () => {
      console.log(
        `✅ Backend Admin Server running on http://localhost:${PORT}`,
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;

