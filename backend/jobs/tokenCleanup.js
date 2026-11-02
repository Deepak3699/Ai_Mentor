import cron from "node-cron";
import { Op } from "sequelize";
import User from "../models/User.js";

export const cleanupExpiredTokens = async () => {
  const [count] = await User.update(
    { resetPasswordToken: null, resetPasswordExpires: null },
    { where: { resetPasswordExpires: { [Op.lt]: new Date() } } },
  );
  console.log(`[token-cleanup] cleared ${count} expired reset tokens`);
  return count;
};

export const startTokenCleanup = () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      await cleanupExpiredTokens();
    } catch (err) {
      console.error("[token-cleanup] failed:", err);
    }
  });
  console.log("[token-cleanup] scheduler started");
};
