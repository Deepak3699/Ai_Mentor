import { sendServerError } from "../utils/apiError.js";
import fs from "fs";

const validate = (schema) => (req, res, next) => {
  if (!schema) {
    return sendServerError(
      req,
      res,
      new Error("validate middleware called without a schema"),
      "VALIDATE_NO_SCHEMA",
    );
  }
  try {
    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }
      const issues = validationResult.error.issues;

      // Log field paths and codes only, never the request body (may contain secrets)
      console.warn(
        JSON.stringify({
          level: "warn",
          requestId: req.id,
          context: "VALIDATION_FAILED",
          route: req.originalUrl?.split("?")[0],
          issues: issues.map((i) => ({ path: i.path.join("."), code: i.code })),
        }),
      );

      return res.status(400).json({
        message: "Validation failed",
        requestId: req.id,
        errors: issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    next();
  } catch (error) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    return sendServerError(req, res, error, "VALIDATE_MIDDLEWARE");
  }
};

export default validate;
