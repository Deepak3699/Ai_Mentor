
import buildLogger from "../utils/logger.js";
import fs from "fs";
import { AppError, ValidationError } from "../utils/error.js";

export const prodRedactPaths = [
  "*.newPassword",
  "*.password",
  "*.currentPassword",
  "*.oldPassword",
  "*.idToken",
];

const log = buildLogger("VALIDATE", prodRedactPaths);

const validate = (schema) => (req, res, next) => {
  if (!schema) {
    log.error("No schema provided to validate middleware");

    const error = new AppError(
      "Internal Server Error: No schema provided",
      500,
      "INTERNAL_SERVER_ERROR",
      [],
      "No schema provided to validate middleware",
    );

    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  try {
    const validationResult = schema.safeParse(req.body);

    if (!validationResult.success) {
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }

      const details = validationResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      log.error({ issues: details }, "Validation failed");

      const error = new ValidationError(
        details,
        "Validation failed",
      );

      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    return next();
  } catch (error) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    log.error({ err: error }, "Validation middleware internal error");

    const appError = new AppError(
      "Internal Server Error during validation",
      500,
      "INTERNAL_SERVER_ERROR",
      process.env.NODE_ENV !== "production"
        ? [error?.message || "Unknown validation error"]
        : [],
      error?.message || "Unknown validation error",
    );

    return res.status(appError.statusCode).json({
      success: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    });
  }
};

export default validate;
