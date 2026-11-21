import { sendServerError } from "../utils/apiError.js";
import fs from "fs";

const REQUEST_PARTS = ["params", "query", "body"];

const isZodSchema = (value) => typeof value?.safeParse === "function";

// Accepts one schema (checked against req.body) or { body, params, query }.
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
    const isSingleBodySchema = isZodSchema(schema);
    const schemasByRequestPart = isSingleBodySchema ? { body: schema } : schema;

    const validationIssues = [];
    const parsedData = {};

    for (const requestPart of REQUEST_PARTS) {
      const partSchema = schemasByRequestPart[requestPart];
      if (!partSchema) continue;

      // {} keeps a missing body from failing with a type error instead of field errors.
      const dataToCheck = isSingleBodySchema ? req.body : (req[requestPart] ?? {});
      const parseResult = partSchema.safeParse(dataToCheck);

      if (parseResult.success) {
        parsedData[requestPart] = parseResult.data;
      } else {
        for (const issue of parseResult.error.issues) {
          validationIssues.push({
            location: requestPart,
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          });
        }
      }
    }

    if (validationIssues.length > 0) {
      if (req.file?.path) {
        fs.unlink(req.file.path, () => {});
      }

      // Log field paths and codes only, never the request data.
      console.warn(
        JSON.stringify({
          level: "warn",
          requestId: req.id,
          context: "VALIDATION_FAILED",
          route: req.originalUrl?.split("?")[0],
          issues: validationIssues.map(({ location, path, code }) => ({ location, path, code })),
        }),
      );

      const details = validationIssues.map(({ location, path, message }) => ({
        location,
        path,
        message,
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

    // A single body schema leaves the request untouched so existing routes behave as before.
    if (!isSingleBodySchema) {
      if (parsedData.body !== undefined) req.body = parsedData.body;
      if (parsedData.params !== undefined) req.params = parsedData.params;
      // Express 5 does not allow assigning req.query.
      if (parsedData.query !== undefined) req.validatedQuery = parsedData.query;
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
