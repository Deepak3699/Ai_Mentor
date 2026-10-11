import express from "express";
import { sequelize } from "../config/db.js";

const router = express.Router();

router.get("/live", (req, res) => {
  res.status(200).json({ status: "alive" });
});

router.get("/ready", async (req, res) => {
  try {
    await sequelize.authenticate();

    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

export default router;