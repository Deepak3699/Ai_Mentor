import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAdminAppTarget } from "../lib/adminApp";

const AdminRoute = () => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const allowedRoles = ["admin", "superadmin"];
  const isAllowedAdmin = !!user && allowedRoles.includes(user.role);

  useEffect(() => {
    if (isAuthenticated && isAllowedAdmin) {
      window.location.replace(getAdminAppTarget(location.pathname));
    }
  }, [isAuthenticated, isAllowedAdmin, location.pathname]);

  // Not logged in
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Wait until user loads
  if (!user) {
    return <div>Loading...</div>;
  }

  // Allow only admin & superadmin
  if (!isAllowedAdmin) {
    return <Navigate to="/" replace />;
  }

  return null;
};

export default AdminRoute;
