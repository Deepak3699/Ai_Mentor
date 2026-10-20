import { sendServerError } from "../../backendAdmin/utils/apiError.js";

export default function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Payload Too Large" });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON" });
  }

  const status = err.status || err.statusCode || 500;

  // Unexpected failures: log details server-side, return the stable generic 500
  if (status >= 500) {
    return sendServerError(req, res, err, "GLOBAL_ERROR_HANDLER");
  }

  // Intentional 4xx errors keep their message (e.g. CORS 403)
  return res.status(status).json({
    success: false,
    message: err.message,
    requestId: req.id,
  });
}
