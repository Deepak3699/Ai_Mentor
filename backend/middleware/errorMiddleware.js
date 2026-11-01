import { toErrorPayload } from "../utils/error.js";

function errorHandler(err, req, res, _next) {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Payload Too Large",
        details: [],
      },
    });
  }

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid JSON",
        details: [],
      },
    });
  }

  const statusCode = err?.statusCode || err?.status || 500;

  if (err && err.name && err.message) {
    console.error({
      name: err.name,
      message: err.message,
      internalMessage: err.internalMessage,
      stack: err.stack,
    });
  } else if (err) {
    console.error(err);
  }

  return res.status(statusCode).json(toErrorPayload(err, "Internal Server Error"));
}

function notFoundMiddleware(req, res) {
  return res.status(404).json({
    success: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `Route not found: ${req.originalUrl}`,
      details: [],
    },
  });
}

export { errorHandler, notFoundMiddleware };
