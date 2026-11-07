import jwt from "jsonwebtoken";
import User from "../models/User.js";

class AuthError extends Error {
  constructor(status, message, classification, code) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.classification = classification;
    this.code = code;
    this.isOperational = true;
  }
}

const logAuthFailure = (scope, classification, error = null) => {
  // Avoid logging tokens, credentials, or raw internal error messages.
  console.error(
    JSON.stringify({
      event: "auth_failure",
      scope,
      classification,
      ...(error && process.env.NODE_ENV !== "production" ? { internalMessage: error.message } : {}),
    }),
  );
};

const classifyJwtError = (error) => {
  if (error?.name === "TokenExpiredError") {
    return "token_expired";
  }
  return "token_invalid";
};

const toErrorEnvelope = (status, code, message, details = []) => ({
  success: false,
  error: {
    code,
    message,
    details: Array.isArray(details) ? details : [details].filter((detail) => detail !== undefined),
  },
});

const sendError = (res, status, code, message, details = []) => {
  return res.status(status).json(toErrorEnvelope(status, code, message, details));
};

// Shared by protect and optionalProtect.
// Expects an Authorization header beginning with "Bearer ".
const authenticate = async (authHeader) => {
  if (!process.env.JWT_SECRET) {
    throw new AuthError(
      503,
      "Authentication temporarily unavailable",
      "auth_config_missing",
      "INTERNAL_SERVER_ERROR",
    );
  }

  const token = authHeader.split(" ")[1];

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new AuthError(
      401,
      "Not authorized, token failed",
      classifyJwtError(error),
      "UNAUTHORIZED",
    );
  }

  // Database errors are intentionally not converted to authentication errors.
  const user = await User.findByPk(decoded.id, {
    attributes: { exclude: ["password"] },
  });

  if (!user) {
    throw new AuthError(401, "User not found", "user_not_found", "UNAUTHORIZED");
  }

  if (user.isBlocked) {
    throw new AuthError(403, "Account suspended", "user_blocked", "FORBIDDEN");
  }

  if (user.passwordChangedAt) {
    const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);

    if (changedAt > decoded.iat) {
      throw new AuthError(
        401,
        "Token revoked, Please Log in again",
        "token_revoked",
        "UNAUTHORIZED",
      );
    }
  }

  return user;
};

const respondWithAuthError = (res, error, scope) => {
  if (error instanceof AuthError) {
    logAuthFailure(scope, error.classification);
    return sendError(res, error.status, error.code, error.message);
  }

  logAuthFailure(scope, "auth_internal_error", error);
  return sendError(res, 500, "INTERNAL_SERVER_ERROR", "Internal Server Error");
};

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "UNAUTHORIZED", "Not authorized, no token");
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
    return sendError(res, 401, "UNAUTHORIZED", "Not authorized, token failed");
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

  return sendError(res, 403, "FORBIDDEN", "Not authorized, admin access required");
};

export { protect, optionalProtect, admin };
