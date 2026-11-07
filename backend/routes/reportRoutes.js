import express from "express";
import { createReport } from "../controllers/reportController.js";
import { protect } from "../middleware/authMiddleware.js";
import validate from "../middleware/validate.js";
import { createReportSchema } from "../schemas/reportSchema.js";

const router = express.Router();

router.post("/", protect, validate(createReportSchema), createReport);

export default router;
