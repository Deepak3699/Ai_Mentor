// backend/middleware/adminAuthMiddleware.js
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

const protectAdmin = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const admin = await Admin.findByPk(decoded.id, {
        attributes: { exclude: ["password"] },
      });

      if (!admin) {
        return res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Admin not found", details: [] },
        });
      }

      if (admin.status === "on-hold") {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "Your account has been suspended", details: [] },
        });
      }

      req.admin = admin;
      next();
    } catch (error) {
      console.error("ADMIN AUTH ERROR:", error.message);
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authorized, token failed", details: [] },
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Not authorized, no token", details: [] },
    });
  }
};

const superAdminOnly = (req, res, next) => {
  if (req.admin && req.admin.role === "superAdmin") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Access denied, superAdmin only", details: [] },
    });
  }
};

const anyAdmin = (req, res, next) => {
  if (req.admin && (req.admin.role === "admin" || req.admin.role === "superAdmin")) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Access denied, admin access required", details: [] },
    });
  }
};

export { protectAdmin, superAdminOnly, anyAdmin };
