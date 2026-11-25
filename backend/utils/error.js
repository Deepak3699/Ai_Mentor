class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    details = [],
    internalMessage = null,
  ) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = Array.isArray(details)
      ? details
      : [details].filter((detail) => detail !== undefined);
    this.internalMessage = internalMessage;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", internalMessage = null) {
    super(message, 401, "UNAUTHORIZED", [], internalMessage);
  }
}

class BadRequestError extends AppError {
  constructor(message = "Bad Request", internalMessage = null, details = []) {
    super(message, 400, "BAD_REQUEST", details, internalMessage);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Forbidden", internalMessage = null) {
    super(message, 403, "FORBIDDEN", [], internalMessage);
  }
}

class ConflictError extends AppError {
  constructor(message = "Conflict", internalMessage = null) {
    super(message, 409, "CONFLICT", [], internalMessage);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Not found", internalMessage = null) {
    super(message, 404, "NOT_FOUND", [], internalMessage);
  }
}

class ValidationError extends AppError {
  constructor(details = [], message = "Request validation failed") {
    super(message, 400, "VALIDATION_ERROR", Array.isArray(details) ? details : [details]);
  }
}

const toErrorPayload = (err, fallbackMessage = "Internal Server Error") => {
  const error = err || {};
  const details = Array.isArray(error.details) ? error.details : [];
  const isOperational = error.isOperational === true;

  return {
    success: false,
    error: {
      code: isOperational && error.code ? error.code : "INTERNAL_SERVER_ERROR",
      message: isOperational && error.message ? error.message : fallbackMessage,
      details,
    },
    ...(error.requiresEnrollment === true ? { requiresEnrollment: true } : {}),
  };
};

const forwardError = (next, res, err) => {
  if (typeof next === "function") {
    return next(err);
  }

  if (res && typeof res.status === "function") {
    const statusCode = err?.statusCode || err?.status || 500;
    return res.status(statusCode).json(toErrorPayload(err, "Internal Server Error"));
  }

  throw err;
};

export {
  AppError,
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
  ValidationError,
  toErrorPayload,
  forwardError,
};
