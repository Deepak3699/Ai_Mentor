import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const err = (e) => ({
  type: e?.type || e?.name || "Error",
  code: e?.code || e?.error?.code,
  statusCode: e?.statusCode || e?.status,
  ...(isProduction ? {} : { message: e?.message, stack: e?.stack }),
});
const buildLogger = (name = "LOG", prodRedactPaths = []) => {
  const paths = isProduction ? [...prodRedactPaths] : [];

  return pino({
    name: name,
    level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    redact: { paths, censor: "*******" },
    serializers: { err },
  });
};
export default buildLogger;
