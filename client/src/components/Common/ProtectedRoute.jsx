import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import Loader from "./Loader";

import "./ProtectedRoute.css";

function ProtectedRoute({ allowedRoles }) {
  const {
    user,
    isAuthenticated,
    authLoading,
  } = useAuth();

  const location = useLocation();

  /* =========================================================
     CHECK FIREBASE SESSION
  ========================================================= */

  if (authLoading) {
    return (
      <div className="protected-route-loading">
        <Loader text="Checking your account..." />
      </div>
    );
  }

  /* =========================================================
     AUTHENTICATION CHECK
  ========================================================= */

  if (!isAuthenticated || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }

  /* =========================================================
     ROLE AUTHORIZATION
  ========================================================= */

  if (
    allowedRoles &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(user.role)
  ) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  /* =========================================================
     AUTHORIZED
  ========================================================= */

  return <Outlet />;
}

export default ProtectedRoute;