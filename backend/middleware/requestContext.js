import { randomUUID } from "node:crypto";

export default function requestContext(req, res, next) {
  req.id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
}