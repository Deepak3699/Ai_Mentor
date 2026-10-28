import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { chatWithAssistant, getChatContext } from "../controllers/chatController.js";
import { aiChatLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/chat", protect, aiChatLimiter, chatWithAssistant);
router.get("/context", protect, getChatContext);

export default router;
