import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getChatContext, chatWithAssistant } from "../controllers/chatController.js";
import { aiChatLimiter } from "../middleware/rateLimiter.js";
import validate from "../middleware/validate.js";
import { chatSchema } from "../schemas/chatSchema.js";

const router = express.Router();

router.get("/context", protect, getChatContext);

router.post("/", protect, aiChatLimiter, validate(chatSchema), chatWithAssistant);

export default router;
