import jwt from "jsonwebtoken";
import { Admin } from "../models/index.js";

// @desc    Protect routes - Verify JWT Token
// @access  Private
export const protectAdmin = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized to access this route" });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || "fallback_secret";
    const decoded = jwt.verify(token, jwtSecret);
    req.admin = await Admin.findByPk(decoded.id);

    if (!req.admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    if (req.admin.status === "on-hold") {
      return res.status(403).json({ message: "Your account has been suspended" });
    }

    if (req.admin.passwordChangedAt) {
      const passwordChangedAt = Math.floor(req.admin.passwordChangedAt.getTime() / 1000);
      if (passwordChangedAt > decoded.iat) {
        return res.status(401).json({ message: "Token revoked, please log in again" });
      }
    }

    next();
  } catch {
    res.status(401).json({ message: "Not authorized to access this route" });
  }
};

// @desc    Make sure admin is SuperAdmin
// @access  Private
export const superAdminOnly = (req, res, next) => {
  if (req.admin && req.admin.role === "superadmin") {
    next();
  } else {
    res.status(403).json({ message: "This action requires superadmin privileges" });
  }
};
