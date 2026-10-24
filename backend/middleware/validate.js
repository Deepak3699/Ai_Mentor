import fs from "fs";

const validate = (schema) => (req, res, next) => {
  if (!schema) {
    console.error("❌ Validation Error: No schema provided to validate middleware");
    return res.status(500).json({ message: "Internal Server Error: No schema provided" });
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
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    console.error("❌ Validation Middleware Internal Error:", error.message || error);
    const response = {
      message: "Internal Server Error during validation",
    };
    if (process.env.NODE_ENV !== "production") {
      response.details = error.message || "Unknown error";
    }
    return res.status(500).json(response);
  }
};

export default validate;
