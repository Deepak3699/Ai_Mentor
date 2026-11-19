import cron from "node-cron";
import { Op } from "sequelize";
import User from "../models/User.js";
import buildLogger from "../utils/logger.js";

const log = buildLogger("TOKEN_CLEANUP");

export const cleanupExpiredTokens = async () => {
  const [count] = await User.update(
    { resetPasswordToken: null, resetPasswordExpires: null },
    { where: { resetPasswordExpires: { [Op.lt]: new Date() } } },
  );
  log.info({ count }, `Cleared ${count} expired reset tokens`);
  return count;
};

export const startTokenCleanup = () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      await cleanupExpiredTokens();
    } catch (err) {
      log.error({ err }, "[token-cleanup] failed");
    }
  });
  log.info("Token cleanup scheduler started");
};
