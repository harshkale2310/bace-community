import { Navigate, Route, Routes } from "react-router-dom";

import Landing from "../pages/Landing/Landing";
import Login from "../pages/Login/Login";
import Register from "../pages/Register/Register";
import Dashboard from "../pages/Dashboard/Dashboard";

import Devotees from "../pages/Devotees/Devotees";
import DevoteeProfile from "../pages/DevoteeProfile/DevoteeProfile";
import Sadhana from "../pages/Sadhana/Sadhana";
import Seva from "../pages/Seva/Seva";
import Leave from "../pages/Leave/Leave";
import Rooms from "../pages/Rooms/Rooms";
import Reports from "../pages/Reports/Reports";
import Settings from "../pages/Settings/Settings";

import ProtectedRoute from "../components/Common/ProtectedRoute";
import Layout from "../components/Layout/Layout";

function AppRoutes() {
  return (
    <Routes>
      {/* =========================================================
          PUBLIC ROUTES
      ========================================================= */}

      <Route path="/" element={<Landing />} />

      <Route path="/login" element={<Login />} />

      {/* Public registration creates DEVOTEE accounts only */}
      <Route path="/register" element={<Register />} />

      {/* =========================================================
          AUTHENTICATED APPLICATION
      ========================================================= */}

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>

          {/* =====================================================
              DASHBOARD
              Administrator + Devotee
          ===================================================== */}

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          {/* =====================================================
              ADMINISTRATOR ONLY
          ===================================================== */}

          <Route
            element={
              <ProtectedRoute
                allowedRoles={["administrator"]}
              />
            }
          >
            {/* Devotee management */}
            <Route
              path="/devotees"
              element={<Devotees />}
            />

            {/* Specific devotee profile */}
            <Route
              path="/devotees/:id"
              element={<DevoteeProfile />}
            />

            {/* Room management */}
            <Route
              path="/rooms"
              element={<Rooms />}
            />

            {/* System settings */}
            <Route
              path="/settings"
              element={<Settings />}
            />
          </Route>

          <Route
            path="/attendance"
            element={<Navigate to="/sadhana" replace />}
          />

          <Route
            path="/my-attendance"
            element={<Navigate to="/sadhana" replace />}
          />

          {/* =====================================================
              SADHANA
              Administrator + Devotee
              
              Component decides:
              Administrator -> manage/view devotees
              Devotee       -> own sadhana
          ===================================================== */}

          <Route
            path="/sadhana"
            element={<Sadhana />}
          />

          <Route
            path="/my-sadhana"
            element={<Sadhana />}
          />

          {/* =====================================================
              SEVA
              Administrator + Devotee
              
              Component decides:
              Administrator -> manage seva
              Devotee       -> assigned seva
          ===================================================== */}

          <Route
            path="/seva"
            element={<Seva />}
          />

          <Route
            path="/my-seva"
            element={<Seva />}
          />

          {/* =====================================================
              LEAVE
              Administrator + Devotee
              
              Component decides:
              Administrator -> approve/reject requests
              Devotee       -> own leave
          ===================================================== */}

          <Route
            path="/leave"
            element={<Leave />}
          />

          <Route
            path="/my-leave"
            element={<Leave />}
          />

          {/* =====================================================
              REPORTS
              Administrator + Devotee
              
              Component decides:
              Administrator -> temple reports
              Devotee       -> personal reports
          ===================================================== */}

          <Route
            path="/reports"
            element={<Reports />}
          />

          <Route
            path="/my-reports"
            element={<Reports />}
          />

          {/* =====================================================
              DEVOTEE PERSONAL PROFILE
              
              Both roles can technically reach this route.
              
              DevoteeProfile.jsx must enforce:
              - Devotee -> own profile
              - Administrator -> management profile when using
                /devotees/:id
          ===================================================== */}

          <Route
            path="/devotee-profile"
            element={<DevoteeProfile />}
          />

          {/* =====================================================
              DEVOTEE PERSONAL ROOM
              
              Same Rooms component:
              - /rooms     -> Administrator management
              - /my-room   -> Devotee own room
          ===================================================== */}

          <Route
            path="/my-room"
            element={<Rooms />}
          />

        </Route>
      </Route>

      {/* =========================================================
          UNKNOWN ROUTES
      ========================================================= */}

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

export default AppRoutes;