import buildLogger from "../utils/logger.js";

// Use structured logger and redact sensitive fields before logging.
// prodRedactPaths lists keys (passwords, tokens) to redact from request bodies on validation failures.

const prodRedactPaths = [
  "*.newPassword",
  "*.password",
  "*.currentPassword",
  "*.oldPassword",
  "*.idToken",
];
const log = buildLogger("VALIDATE", prodRedactPaths);

const validate = (schema) => (req, res, next) => {
  if (!schema) {
    log.error("Validation Error: No schema provided to validate middleware");
    return res.status(500).json({ message: "Internal Server Error: No schema provided" });
  }
  try {
    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues;
      log.error({ req_body: req.body, issues }, "Validation Failed :");

      return res.status(400).json({
        message: "Validation failed",
        errors: issues.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        })),
      });
    }
    next();
  } catch (error) {
    log.error({ err: error }, "Validation Middleware Internal Error ");
    return res.status(500).json({
      message: "Internal Server Error during validation",
      details: error.message || "Unknown error",
    });
  }
};
export { prodRedactPaths };
export default validate;
