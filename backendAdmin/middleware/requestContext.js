import { randomUUID } from "crypto";

export default function requestContext(req, res, next) {
  // server-generated, never taken from the client
  req.id = randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
