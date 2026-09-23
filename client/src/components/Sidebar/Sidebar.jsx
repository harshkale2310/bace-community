import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";

import iskconLogo from "../../assets/iskcon-logo.png";

import "./Sidebar.css";

/* ==========================================================================
   ADMINISTRATOR MENU
========================================================================== */

const adminMenu = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: "⌂",
  },
  {
    label: "Devotees",
    path: "/devotees",
    icon: "♙",
  },
  {
    label: "Attendance",
    path: "/attendance",
    icon: "✓",
  },
  {
    label: "Sadhana",
    path: "/sadhana",
    icon: "ॐ",
  },
  {
    label: "Seva",
    path: "/seva",
    icon: "✦",
  },
  {
    label: "Leave",
    path: "/leave",
    icon: "◷",
  },
  {
    label: "Rooms",
    path: "/rooms",
    icon: "▦",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: "▤",
  },
];

/* ==========================================================================
   DEVOTEE MENU
========================================================================== */

const devoteeMenu = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: "⌂",
  },
  {
    label: "My Profile",
    path: "/devotee-profile",
    icon: "♙",
  },
  {
    label: "Attendance",
    path: "/attendance",
    icon: "✓",
  },
  {
    label: "Sadhana",
    path: "/sadhana",
    icon: "ॐ",
  },
  {
    label: "Seva",
    path: "/seva",
    icon: "✦",
  },
  {
    label: "Leave",
    path: "/leave",
    icon: "◷",
  },
  {
    label: "My Room",
    path: "/my-room",
    icon: "▦",
  },
  {
    label: "My Reports",
    path: "/my-reports",
    icon: "▤",
  },
];

/* ==========================================================================
   SIDEBAR
========================================================================== */

function Sidebar() {
  const navigate = useNavigate();

  const { user, isAdministrator, isDevotee } = useAuth();

  const { sidebarOpen, closeSidebar } = useApp();

  /* ==========================================================================
     MENU BASED ON USER ROLE
  ========================================================================== */

  const menuItems = isAdministrator ? adminMenu : devoteeMenu;

  /* ==========================================================================
     INITIALS
  ========================================================================== */

  const getInitials = (name = "") => {
    const cleanName = name.trim();

    if (!cleanName) {
      return "BA";
    }

    return cleanName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  };

  /* ==========================================================================
     ROLE LABEL
  ========================================================================== */

  const getRoleLabel = () => {
    if (isAdministrator) {
      return "Administrator";
    }

    if (isDevotee) {
      return "Devotee";
    }

    return "User";
  };

  /* ==========================================================================
     DISPLAY NAME
  ========================================================================== */

  const getDisplayName = () => {
    if (isAdministrator) {
      return "BACE Administrator";
    }

    return user?.name || "Devotee";
  };

  /* ==========================================================================
     MOBILE SIDEBAR
  ========================================================================== */

  const closeSidebarOnMobile = () => {
    if (window.innerWidth <= 900) {
      closeSidebar();
    }
  };

  /* ==========================================================================
     NAVIGATION
  ========================================================================== */

  const handleNavigation = () => {
    closeSidebarOnMobile();
  };

  /* ==========================================================================
     BRAND CLICK
  ========================================================================== */

  const handleBrandClick = () => {
    navigate("/dashboard");
    closeSidebarOnMobile();
  };

  /* ==========================================================================
     CURRENT USER
  ========================================================================== */

  const displayName = getDisplayName();
  const initials = isAdministrator ? "BA" : getInitials(user?.name);
  const roleLabel = getRoleLabel();

  return (
    <>
      {/* ======================================================================
          SIDEBAR
      ====================================================================== */}

      <aside
        className={`sidebar ${sidebarOpen ? "open" : "closed"}`}
        aria-label="Main navigation"
      >
        {/* ====================================================================
            BRAND
        ==================================================================== */}

        <div className="sidebar-brand">
          <button
            type="button"
            className="sidebar-brand-mark sidebar-brand-logo"
            onClick={handleBrandClick}
            aria-label="Go to dashboard"
            title="Dashboard"
          >
            <img src={iskconLogo} alt="" />
          </button>

          <button
            type="button"
            className="sidebar-brand-text"
            onClick={handleBrandClick}
            aria-label="Giri Govardhan BACE dashboard"
          >
            <strong>Giri Govardhan BACE</strong>

            <span>Spiritual Community</span>
          </button>
        </div>

        {/* ====================================================================
            CURRENT USER
        ==================================================================== */}

        <div
          className="sidebar-user"
          title={displayName}
        >
          <div
            className="sidebar-user-avatar"
            aria-hidden="true"
          >
            {initials}
          </div>

          <div className="sidebar-user-info">
            <strong>{displayName}</strong>

            <span>{roleLabel}</span>
          </div>
        </div>

        {/* ====================================================================
            NAVIGATION
        ==================================================================== */}

        <nav
          className="sidebar-navigation"
          aria-label="Primary navigation"
        >
          <p className="sidebar-section-title">
            MAIN MENU
          </p>

          <div className="sidebar-menu">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavigation}
                title={!sidebarOpen ? item.label : undefined}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
              >
                <span
                  className="sidebar-link-icon"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <span className="sidebar-link-label">
                  {item.label}
                </span>
              </NavLink>
            ))}
          </div>

          {/* ==================================================================
              ADMINISTRATOR SYSTEM MENU
          ================================================================== */}

          {isAdministrator && (
            <>
              <p className="sidebar-section-title second">
                SYSTEM
              </p>

              <NavLink
                to="/settings"
                onClick={handleNavigation}
                title={!sidebarOpen ? "Settings" : undefined}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
              >
                <span
                  className="sidebar-link-icon"
                  aria-hidden="true"
                >
                  ⚙
                </span>

                <span className="sidebar-link-label">
                  Settings
                </span>
              </NavLink>
            </>
          )}
        </nav>

        {/* ====================================================================
            SIDEBAR FOOTER
        ==================================================================== */}

        <div className="sidebar-footer">
          <div
            className="sidebar-footer-symbol sidebar-footer-logo"
            aria-hidden="true"
          >
            <img src={iskconLogo} alt="" />
          </div>

          <div className="sidebar-footer-content">
            <strong>Hare Krishna</strong>

            <span>Serve • Learn • Grow</span>
          </div>
        </div>
      </aside>

      {/* ======================================================================
          MOBILE OVERLAY
      ====================================================================== */}

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={closeSidebar}
          aria-label="Close navigation"
        />
      )}
    </>
  );
}

export default Sidebar;