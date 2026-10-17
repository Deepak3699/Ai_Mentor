
const ADMIN_ROLES = new Set(["admin", "superadmin"]);

export const isAdmin = (user) =>
  Boolean(user && ADMIN_ROLES.has(user.role));

export const isSuperAdmin = (user) =>
  Boolean(user && user.role === "superadmin");
