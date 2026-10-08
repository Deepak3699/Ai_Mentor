import helmet from "helmet";

export const securityHeaders = () => {
  const enableHsts = process.env.NODE_ENV === "production";

  return helmet({
    // CSP is now ON (it was disabled before)
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },

    crossOriginResourcePolicy: { policy: "cross-origin" },

    hsts: enableHsts ? { maxAge: 15552000, includeSubDomains: true } : false,
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "no-referrer" },
  });
};