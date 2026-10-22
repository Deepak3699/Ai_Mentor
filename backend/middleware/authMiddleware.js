import jwt from "jsonwebtoken";
import User from "../models/User.js";

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Not authorized, no token",
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret not configured",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Account suspended",
      });
    }

    if (user.passwordChangedAt) {
      const passwordChangedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);

      if (passwordChangedAt > decoded.iat) {
        return res.status(401).json({
          message: "Token revoked, Please Log in again",
        });
      }
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("AUTH ERROR:", error.message);
    return res.status(401).json({
      message: "Not authorized, token failed",
    });
  }
};

const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Not authorized, token failed",
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret not configured",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Account suspended" });
    }

    if (user.passwordChangedAt) {
      const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);

      if (changedAt > decoded.iat) {
        return res.status(401).json({
          message: "Token revoked, Please Log in again",
        });
      }
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("OPTIONAL AUTH ERROR:", error.message);
    return res.status(401).json({
      message: "Not authorized, token failed",
    });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }

  return res.status(403).json({
    message: "Not authorized, admin access required",
  });
};

export { protect, optionalProtect, admin };
