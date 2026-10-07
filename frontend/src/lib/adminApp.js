const ADMIN_APP_URL =
  import.meta.env.VITE_ADMIN_APP_URL || "http://localhost:5174";

const adminRouteMap = {
  "/admin": "/dashboard",
  "/admin/users": "/users",
  "/admin/courses": "/courses",
};

export const getAdminAppTarget = (pathname) => {
  const adminPath = adminRouteMap[pathname] || "/dashboard";
  return new URL(adminPath, ADMIN_APP_URL).toString();
};
