import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const createLimiter = (max, windowMinutes, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    message,
  });

export const loginLimiter = createLimiter(10, 15, "Too many login attempts. Try later.");

export const registerLimiter = createLimiter(10, 60, "Too many accounts created. Try later.");

export const forgotLimiter = createLimiter(5, 60, "Too many reset requests. Try later.");
   const userKeyGenerator = (req) => {
     const userId = req.user?.id || req.user?._id;
     return userId ? `user:${userId}` : ipKeyGenerator(req.ip);
   };

   const createAiLimiter = ({ windowMs, max, message }) =>
     rateLimit({
       windowMs,
       limit: max,
       keyGenerator: userKeyGenerator,
       standardHeaders: true,
       legacyHeaders: false,
       handler: (req, res) => {
         res.status(429).json({ success: false, error: message });
       },
     });

   // 20 chat requests per minute per user
   export const aiChatLimiter = createAiLimiter({
     windowMs: 60 * 1000,
     max: 20,
     message:
       "Too many chat requests. You can send up to 20 messages per minute. Please wait and try again.",
   });

   // 3 video generations per 5 minutes per user
   export const aiVideoLimiter = createAiLimiter({
     windowMs: 5 * 60 * 1000,
     max: 3,
     message:
       "Video generation limit reached. You can generate up to 3 videos every 5 minutes. Please try again later.",
   });