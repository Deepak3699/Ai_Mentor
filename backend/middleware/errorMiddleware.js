import { toErrorPayload } from "../utils/error.js";
import {
  GENERIC_500_MESSAGE,
  logServerError,
} from "../utils/apiError.js";

function errorHandler(err, req, res, next) {
  const requestId = req.id;

  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Payload Too Large",
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Payload Too Large",
        details: [],
      },
      requestId,
    });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON",
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON",
        details: [],
      },
      requestId,
    });
  }

  const statusCode = err?.statusCode || err?.status || 500;

  if (res.headersSent) {
    return next(err);
  }

  if (statusCode >= 500) {
    logServerError(req, err, "globalErrorHandler");

    return res.status(500).json({
      success: false,
      message: GENERIC_500_MESSAGE,
      error: GENERIC_500_MESSAGE,
      requestId,
    });
  }

  if (statusCode === 403 && err?.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Not allowed by CORS",
      requestId,
    });
  }

  const payload = toErrorPayload(err, "Request failed");

  return res.status(statusCode).json({
    ...payload,
    requestId,
  });
}

function notFoundMiddleware(req, res) {
  return res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
      details: [],
    },
    requestId: req.id,
  });
}

export { errorHandler, notFoundMiddleware };
