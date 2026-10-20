// Keep in sync with backendAdmin/utils/apiErrors.js
export const GENERIC_500_MESSAGE = "Internal server error";

export function logServerError(req, err, context) {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req.id,
      context,
      method: req.method,
      route: req.originalUrl?.split("?")[0],
      userId: req.user?.id,
      errorName: err?.name,
      errorCode: err?.code,
      dbCode: err?.parent?.code,
      message: err?.message,
      stack: err?.stack,
    }),
  );
}

export function sendServerError(req, res, err, context) {
  logServerError(req, err, context);
  if (res.headersSent) return;
  return res.status(500).json({
    success: false,
    message: GENERIC_500_MESSAGE,
    requestId: req.id,
  });
}
