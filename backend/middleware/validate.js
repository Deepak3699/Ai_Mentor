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

      // Log field paths and codes only, never the request body.
      console.warn(
        JSON.stringify({
          level: "warn",
          requestId: req.id,
          context: "VALIDATION_FAILED",
          route: req.originalUrl?.split("?")[0],
          issues: issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
          })),
        }),
      );

      const details = issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details,
        },
        requestId: req.id,
      });
    }

    return next();
  } catch (error) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    return sendServerError(req, res, error, "VALIDATE_MIDDLEWARE", next);
  }
};

export default validate;
