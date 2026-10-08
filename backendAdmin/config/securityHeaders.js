import helmet from "helmet";

// ================= SECURITY HEADERS =================
export const securityHeaders = () => {
    
  const enableHsts = process.env.NODE_ENV === "production";

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },

    hsts: enableHsts ? { maxAge: 15552000, includeSubDomains: true } : false,

    frameguard: { action: "deny" }, 
    noSniff: true, 
    referrerPolicy: { policy: "no-referrer" },
  });
};