export const GENERIC_500_MESSAGE = "Internal server error";

// Only these values may ever appear as a log category
const CATEGORIES = new Set([
  "database",
  "database_connection",
  "dependency_unreachable",
  "dependency_failure",
  "validation",
  "auth_token",
  "programming",
  "unknown",
]);

const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

// Strict shapes per field. A value that does not match is dropped, never logged.
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,59}$/; // e.g. SequelizeDatabaseError
const SAFE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "11000",
  "AI_SERVICE_ERROR_PAYLOAD",
]);

const safeErrorCode = (value) => {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const code = String(value);
  return SAFE_ERROR_CODES.has(code) ? code : undefined;
};

const DB_CODE_RE = /^[A-Z0-9]{5}$/; // e.g. 42P01

const pick = (re, value) => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  return re.test(text) ? text : undefined;
};

export function classifyError(err) {
  if (CATEGORIES.has(err?.category)) return err.category;
  const name = typeof err?.name === "string" ? err.name : "";
  const code = err?.code ?? err?.cause?.code;
  if (CONNECTION_CODES.has(code)) return "dependency_unreachable";
  if (/^Sequelize(Connection|Host|AccessDenied)/.test(name)) return "database_connection";
  if (name.startsWith("Sequelize")) return "database";
  if (name === "ZodError") return "validation";
  if (name === "JsonWebTokenError" || name === "TokenExpiredError") return "auth_token";
  if (["TypeError", "ReferenceError", "RangeError", "SyntaxError"].includes(name))
    return "programming";
  return "unknown";
}

// File name and line only (no folders, no message text).
// The first lines of err.stack are the message, so they are skipped.
function errorOrigin(err) {
  if (typeof err?.stack !== "string") return undefined;
  const headerLines = `${err.name}: ${err.message}`.split("\n").length;
  const frame = err.stack
    .split("\n")
    .slice(headerLines)
    .find((l) => /^\s+at /.test(l) && !l.includes("node_modules") && !l.includes("node:"));
  const match = frame?.match(/([\w.-]{1,64}\.[cm]?js):(\d+):\d+\)?$/);
  return match ? `${match[1]}:${match[2]}` : undefined;
}

// Safe description of an error. Never includes message, stack text, sql or config.
export function describeError(err) {
  return {
    category: classifyError(err),
    errorName: pick(NAME_RE, err?.name),
    errorCode: safeErrorCode(err?.code),
    dbCode: pick(DB_CODE_RE, err?.parent?.code ?? err?.original?.code),
    upstreamStatus: Number.isInteger(err?.upstreamStatus) ? err.upstreamStatus : undefined,
    origin: errorOrigin(err),
  };
}

// For failures of another service (AI, Stripe): record the kind and status, never their text
export function dependencyFailure(code, upstreamStatus) {
  return Object.assign(new Error("dependency failure"), {
    name: "DependencyError",
    code,
    category: "dependency_failure",
    upstreamStatus,
  });
}

// What gets forwarded to Express when the response has already started.
// Express's default handler prints err.stack (unless NODE_ENV=test), so it must be harmless.
export function safeForwardError() {
  const e = new Error("Response failed after headers were sent");
  e.status = 500;
  e.sanitized = true; // already logged with full classification by the caller
  e.stack = e.message;
  return e;
}

// Log the route pattern, not the URL: URLs can contain tokens and user input
const routeOf = (req) =>
  typeof req.route?.path === "string" ? `${req.baseUrl || ""}${req.route.path}` : "[unmatched]";

export function logServerError(req, err, context) {
  try {
    console.error(
      JSON.stringify({
        level: "error",
        requestId: req.id,
        context: String(context)
          .replace(/[^\w.:-]/g, "_")
          .slice(0, 80),
        method: req.method,
        route: routeOf(req),
        userId: req.user?.id != null ? String(req.user.id).slice(0, 40) : undefined,
        ...describeError(err),
      }),
    );
  } catch {
    // Logging must never stop the response from being sent
    console.error('{"level":"error","message":"error logging failed"}');
  }
}

// Consistent body for intentional (non-5xx) errors
export function sendApiError(req, res, status, message) {
  return res.status(status).json({ success: false, message, requestId: req.id });
}

export function sendServerError(req, res, err, context, next) {
  logServerError(req, err, context);
  if (res.headersSent) {
    // Cannot send JSON any more: hand a safe error to Express (closes the connection)
    return typeof next === "function" ? next(safeForwardError()) : res.destroy();
  }
  return res.status(500).json({
    success: false,
    message: GENERIC_500_MESSAGE,
    error: GENERIC_500_MESSAGE, // deprecated mirror of `message` for existing clients (Option A)
    requestId: req.id,
  });
}
