import fs from "fs";

import { AppError, ValidationError } from "../utils/error.js";

const validate = (schema) => (req, res, next) => {
  if (!schema) {
    console.error("❌ Validation Error: No schema provided to validate middleware");
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
      const issues = validationResult.error.issues;
      const errorPaths = issues.map((err) => err.path.join(".")).join(", ");
      console.error(
        `❌ Validation Failed for ${req.method} ${req.originalUrl || req.url}. Fields: ${errorPaths}`,
      );

      const details = issues.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));

      const error = new ValidationError(details, "Validation failed");
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

    console.error("❌ Validation Middleware Internal Error:", error);

    const appError = new AppError(
      "Internal Server Error during validation",
      500,
      "INTERNAL_SERVER_ERROR",
      process.env.NODE_ENV !== "production" ? [error?.message || "Unknown validation error"] : [],
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
