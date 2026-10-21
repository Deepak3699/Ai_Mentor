export function logServerError(req, err, context) {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req.id,
      context,
      method: req.method,
      route: req.originalUrl.split("?")[0],
      adminId: req.admin?.id,
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
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    requestId: req.id,
  });
}
