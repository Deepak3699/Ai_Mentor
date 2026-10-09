import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Get sidebar navigation items
// @route   GET /api/sidebar/navigation
// @access  Private
const getNavigationItems = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const sidebarPath = path.resolve(
      __dirname,
      "../../frontend/public/data/sidebar.json"
    );

    const sidebarData = await fs.readFile(sidebarPath, "utf8");

    let navigationItems;
    try {
      navigationItems = JSON.parse(sidebarData);
    } catch {
      return res.status(500).json({ message: "Invalid sidebar configuration" });
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
    res.status(500).json({ message: "Server Error" });
  }
};

export { getNavigationItems };
