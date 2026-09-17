import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";

import "./Navbar.css";

function Navbar() {
  const navigate = useNavigate();

  const { user, logout } = useAuth();
  const { toggleSidebar } = useApp();

  const [profileOpen, setProfileOpen] = useState(false);

  const profileRef = useRef(null);

  /*
   * Generate initials from the user's name.
   */
  const getInitials = (name = "") => {
    const words = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return "U";
    }

    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  };

  /*
   * Close profile dropdown when clicking outside.
   */
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /*
   * Logout user.
   */
  const handleLogout = async () => {
    setProfileOpen(false);

    try {
      await logout();

      navigate("/login", {
        replace: true,
      });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  /*
   * Open administrator settings
   * or devotee profile.
   */
  const handleProfileClick = () => {
    setProfileOpen(false);

    if (user?.role === "administrator") {
      navigate("/settings");
      return;
    }

    navigate("/devotee-profile");
  };

  /*
   * Role display.
   */
  const isAdministrator = user?.role === "administrator";

  const displayRole = isAdministrator
    ? "Administrator"
    : "Devotee";

  const profileLabel = isAdministrator
    ? "Account Settings"
    : "My Profile";

  const initials = getInitials(user?.name);

  return (
    <header className="navbar">
      {/* =========================================
          LEFT SECTION
      ========================================= */}

      <div className="navbar-left">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label="Toggle navigation sidebar"
          title="Toggle navigation"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="navbar-page-title">
          <div
            className="navbar-title-icon"
            aria-hidden="true"
          >
            ॐ
          </div>

          <div className="navbar-title-text">
            <strong>Temple Base</strong>
            <small>Management System</small>
          </div>
        </div>
      </div>

      {/* =========================================
          RIGHT SECTION
      ========================================= */}

      <div className="navbar-right">
        {/* =====================================
            NOTIFICATIONS
        ===================================== */}

        <button
          type="button"
          className="navbar-notification"
          aria-label="Notifications"
          title="Notifications"
        >
          <span
            className="notification-icon"
            aria-hidden="true"
          >
            ♢
          </span>

          <span
            className="notification-dot"
            aria-hidden="true"
          />
        </button>

        {/* =====================================
            PROFILE
        ===================================== */}

        <div
          className="navbar-profile"
          ref={profileRef}
        >
          <button
            type="button"
            className={`profile-trigger ${
              profileOpen ? "active" : ""
            }`}
            onClick={() =>
              setProfileOpen((previous) => !previous)
            }
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label={`Open profile menu for ${
              user?.name || "User"
            }`}
          >
            {/* Avatar */}
            <span
              className="profile-avatar"
              aria-hidden="true"
            >
              {initials}
            </span>

            {/* User information */}
            <span className="profile-details">
              <strong>
                {user?.name || "User"}
              </strong>

              <small>{displayRole}</small>
            </span>

            {/* Dropdown arrow */}
            <span
              className={`profile-arrow ${
                profileOpen ? "open" : ""
              }`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>

          {/* ===================================
              PROFILE DROPDOWN
          =================================== */}

          {profileOpen && (
            <div
              className="profile-menu"
              role="menu"
              aria-label="Profile menu"
            >
              {/* Profile header */}
              <div className="profile-menu-header">
                <span
                  className="profile-avatar large"
                  aria-hidden="true"
                >
                  {initials}
                </span>

                <div className="profile-menu-user">
                  <strong>
                    {user?.name || "User"}
                  </strong>

                  <small>
                    {user?.email || ""}
                  </small>

                  <span className="profile-role-badge">
                    {displayRole}
                  </span>
                </div>
              </div>

              <div
                className="profile-menu-divider"
                aria-hidden="true"
              />

              {/* Profile / Settings */}
              <button
                type="button"
                className="profile-menu-item"
                role="menuitem"
                onClick={handleProfileClick}
              >
                <span
                  className="profile-menu-icon"
                  aria-hidden="true"
                >
                  👤
                </span>

                <span>{profileLabel}</span>
              </button>

              {/* Logout */}
              <button
                type="button"
                className="profile-menu-item logout-option"
                role="menuitem"
                onClick={handleLogout}
              >
                <span
                  className="profile-menu-icon"
                  aria-hidden="true"
                >
                  ↪
                </span>

                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;