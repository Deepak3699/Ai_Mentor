import { STATUS_CODES } from "node:http";
import {
  logServerError,
  sendServerError,
  sendApiError,
  safeForwardError,
} from "../utils/apiError.js";

export default function errorHandler(err, req, res, next) {
  try {
    if (res.headersSent) {
      // A safe error forwarded by sendServerError was already logged there
      if (!err?.sanitized) logServerError(req, err, "GLOBAL_ERROR_HANDLER_HEADERS_SENT");
      return next(safeForwardError());
    }

    if (err?.type === "entity.too.large") return sendApiError(req, res, 413, "Payload Too Large");
    if (err?.type === "entity.parse.failed") return sendApiError(req, res, 400, "Invalid JSON");

    const raw = err?.status ?? err?.statusCode;
    const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;

    // Unexpected failures: safe log + generic 500
    if (status >= 500) return sendServerError(req, res, err, "GLOBAL_ERROR_HANDLER", next);

    // Intentional 4xx errors (marked `expose`) keep their message. Anything else gets the
    // standard text for its status, so a library message can never reach the client.
    // Still log the safe fields so these are not invisible to operators.
    const isPublic =
      err?.expose === true && typeof err.message === "string" && err.message.length > 0;
    if (!isPublic) logServerError(req, err, "GLOBAL_ERROR_HANDLER_HIDDEN_4XX");
    return sendApiError(
      req,
      res,
      status,
      isPublic ? err.message : STATUS_CODES[status] || "Request failed",
    );
  } catch (handlerError) {
    // The handler itself failed: never let Express's default handler print a stack to the client
    return sendServerError(req, res, handlerError, "GLOBAL_ERROR_HANDLER_FAILURE", next);
  }
}
