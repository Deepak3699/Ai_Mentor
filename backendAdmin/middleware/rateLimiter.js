const loginAttempts = new Map();

export const adminLoginLimiter = (req, res, next) => {
  if (process.env.NODE_ENV === "test") return next();

  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;

  const record = loginAttempts.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count += 1;
  }

  loginAttempts.set(ip, record);

  if (record.count > maxAttempts) {
    return res.status(429).json({
      success: false,
      message: "Too many login attempts. Please try again after 15 minutes.",
    });
  }

  next();
};
