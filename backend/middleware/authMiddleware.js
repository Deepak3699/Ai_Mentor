import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Protect routes that require authentication
const protect = async (req, res, next) => {
  let token;

  // Check Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      // Ensure JWT secret exists
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({
          message: "JWT secret not configured",
        });
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user
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
        const passwordChangedAt = Math.floor(
          user.passwordChangedAt.getTime() / 1000
        );

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
  }

  return res.status(401).json({
    message: "Not authorized, no token",
  });
};


// Optional authentication
// No token = anonymous user
// Valid token = authenticated user
const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // No token → continue as anonymous
  if (!authHeader) {
    return next();
  }

  // Token provided but malformed
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Not authorized, token failed",
    });
  }

  try {
    const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret not configured",
      });
    }

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
      const passwordChangedAt = Math.floor(
        user.passwordChangedAt.getTime() / 1000
      );

      if (passwordChangedAt > decoded.iat) {
        return res.status(401).json({
          message: "Token revoked, Please Log in again",
        });
      }
    }

    // Identity comes from verified token
    req.user = user;

    return next();
  } catch (error) {
    console.error("OPTIONAL AUTH ERROR:", error.message);

    return res.status(401).json({
      message: "Not authorized, token failed",
    });
  }
};


// Admin middleware
const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }

  return res.status(403).json({
    message: "Not authorized, admin access required",
  });
};


export { protect, optionalProtect, admin };
