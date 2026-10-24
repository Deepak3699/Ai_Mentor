import jwt from "jsonwebtoken";
import User from "../models/User.js";

const protect = async (req, res, next) => {
  let token;

  // 1️⃣ Check Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];

      // 2️⃣ Ensure JWT secret exists
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "JWT secret not configured",
            details: [],
          },
        });
      }

      // 3️⃣ Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 4️⃣ Fetch user using Sequelize findByPk (not MongoDB findById)
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ["password"] },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not found", details: [] },
        });
      }

      if (user.isBlocked) {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "Account suspended", details: [] },
        });
      }
      if (user.passwordChangedAt) {
        const passwordChangedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
        if (passwordChangedAt > decoded.iat) {
          return res.status(401).json({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Token revoked, Please Log in again",
              details: [],
            },
          });
        }
      }

      req.user = user;
      return next();
    } catch (error) {
      console.error("AUTH ERROR:", error.message);
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authorized, token failed", details: [] },
      });
    }
  }

  // 5️⃣ No token provided
  return res.status(401).json({
    success: false,
    error: { code: "UNAUTHORIZED", message: "Not authorized, no token", details: [] },
  });
};

export { protect };

const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: { code: "FORBIDDEN", message: "Not authorized, admin access required", details: [] },
  });
};

export { admin };
