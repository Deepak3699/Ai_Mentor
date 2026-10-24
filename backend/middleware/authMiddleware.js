import jwt from "jsonwebtoken";
import User from "../models/User.js";

class AuthError extends Error {
  constructor(status, message, classification) {
    super(message);
    this.status = status;
    this.classification = classification;
  }
}

const logAuthFailure = (scope, classification) => {
  console.error(JSON.stringify({ event: "auth_failure", scope, classification }));
};

const classifyJwtError = (error) => {
  if (error?.name === "TokenExpiredError") return "token_expired";
  return "token_invalid";
};

// Shared by protect and optionalProtect.
// Expects a header that already starts with "Bearer ".
const authenticate = async (authHeader) => {
  if (!process.env.JWT_SECRET) {
    throw new AuthError(503, "Authentication temporarily unavailable", "auth_config_missing");
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new AuthError(401, "Not authorized, token failed", classifyJwtError(error));
  }

  const user = await User.findByPk(decoded.id, {
    attributes: { exclude: ["password"] },
  });

  if (!user) {
    throw new AuthError(401, "User not found", "user_not_found");
  }

  if (user.isBlocked) {
    throw new AuthError(403, "Account suspended", "user_blocked");
  }

  if (user.passwordChangedAt) {
    const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (changedAt > decoded.iat) {
      throw new AuthError(401, "Token revoked, Please Log in again", "token_revoked");
    }
  }

  return user;
};

const respondWithAuthError = (res, error, scope) => {
  if (error instanceof AuthError) {
    logAuthFailure(scope, error.classification);
    return res.status(error.status).json({ message: error.message });
  }

  logAuthFailure(scope, "auth_internal_error");
  return res.status(401).json({ message: "Not authorized, token failed" });
};

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  try {
    req.user = await authenticate(authHeader);
    return next();
  } catch (error) {
    return respondWithAuthError(res, error, "protect");
  }
};

const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }

  try {
    req.user = await authenticate(authHeader);
    return next();
  } catch (error) {
    return respondWithAuthError(res, error, "optionalProtect");
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
