import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { AppError, UnauthorizedError, forwardError } from "../utils/error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Get sidebar navigation items
// @route   GET /api/sidebar/navigation
// @access  Private
const getNavigationItems = async (req, res, next) => {
  try {
    if (!req.user) {
      return forwardError(next, res, new UnauthorizedError("Not authorized"));
    }

    const sidebarPath = path.resolve(__dirname, "../../frontend/public/data/sidebar.json");

    const sidebarData = await fs.readFile(sidebarPath, "utf8");

    let navigationItems;
    try {
      navigationItems = JSON.parse(sidebarData);
    } catch {
      return forwardError(
        next,
        res,
        new AppError(
          "Internal Server Error",
          500,
          "INTERNAL_SERVER_ERROR",
          [],
          "Invalid sidebar configuration",
        ),
      );
    }

    const userRole = req.user.role || "user";

    let filteredItems = navigationItems;

    const allowedAdminRoles = ["admin", "superadmin"];

    if (!allowedAdminRoles.includes(userRole)) {
      filteredItems = navigationItems.filter((item) => item.id !== "admin");
    }

    res.json(filteredItems);
  } catch (error) {
    console.error("SIDEBAR ERROR:", error);
    return forwardError(
      next,
      res,
      new AppError(
        "Internal Server Error",
        500,
        "INTERNAL_SERVER_ERROR",
        [],
        error?.message || "Sidebar navigation lookup failed",
      ),
    );
  }
};

export { getNavigationItems };
