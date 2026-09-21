import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { useAuth } from "../../context/AuthContext";
import { useApp } from "../../context/AppContext";
import { db } from "../../services/firebase";

import "./Navbar.css";

function Navbar() {
  const navigate = useNavigate();

  const { user, logout } = useAuth();
  const { toggleSidebar } = useApp();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] =
    useState(false);

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] =
    useState(true);

  const profileRef = useRef(null);
  const notificationRef = useRef(null);

  /* =========================================================
     INITIALS
  ========================================================= */

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

  /* =========================================================
     DISPLAY NAME
  ========================================================= */

  const displayName =
    user?.role === "administrator"
      ? "BACE Administrator"
      : user?.name || "User";

  /* =========================================================
     ROLE
  ========================================================= */

  const isAdministrator =
    user?.role === "administrator";

  const displayRole = isAdministrator
    ? "Administrator"
    : "Devotee";

  const profileLabel = isAdministrator
    ? "Account Settings"
    : "My Profile";

  const initials = getInitials(displayName);

  /* =========================================================
     NOTIFICATION SUBSCRIPTION

     IMPORTANT:
     The Firestore query filters by recipientId directly.

     Do NOT load the complete notifications collection and
     filter it in JavaScript. Firestore security rules are
     evaluated before client-side filtering.
  ========================================================= */

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setNotificationsLoading(false);
      return undefined;
    }

    setNotificationsLoading(true);

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const currentNotifications = snapshot.docs
          .map((notificationDoc) => ({
            id: notificationDoc.id,
            ...notificationDoc.data(),
          }))
          .sort((a, b) => {
            const aTime =
              a.createdAt?.toMillis?.() ||
              (a.createdAt
                ? new Date(a.createdAt).getTime()
                : 0) ||
              0;

            const bTime =
              b.createdAt?.toMillis?.() ||
              (b.createdAt
                ? new Date(b.createdAt).getTime()
                : 0) ||
              0;

            return bTime - aTime;
          });

        setNotifications(currentNotifications);
        setNotificationsLoading(false);
      },
      (error) => {
        console.error(
          "Failed to load notifications:",
          error
        );

        setNotifications([]);
        setNotificationsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  /* =========================================================
     UNREAD COUNT
  ========================================================= */

  const unreadCount = notifications.filter(
    (notification) => notification.read !== true
  ).length;

  /* =========================================================
     NOTIFICATION DATE
  ========================================================= */

  const formatNotificationTime = (createdAt) => {
    if (!createdAt) {
      return "";
    }

    let date;

    if (typeof createdAt?.toDate === "function") {
      date = createdAt.toDate();
    } else if (createdAt instanceof Date) {
      date = createdAt;
    } else {
      date = new Date(createdAt);
    }

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();

    const difference =
      now.getTime() - date.getTime();

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (difference < minute) {
      return "Just now";
    }

    if (difference < hour) {
      const minutes = Math.floor(
        difference / minute
      );

      return `${minutes} ${
        minutes === 1 ? "minute" : "minutes"
      } ago`;
    }

    if (difference < day) {
      const hours = Math.floor(
        difference / hour
      );

      return `${hours} ${
        hours === 1 ? "hour" : "hours"
      } ago`;
    }

    if (difference < 7 * day) {
      const days = Math.floor(
        difference / day
      );

      return `${days} ${
        days === 1 ? "day" : "days"
      } ago`;
    }

    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /* =========================================================
     MARK SINGLE NOTIFICATION AS READ
  ========================================================= */

  const markNotificationAsRead = async (
    notification
  ) => {
    if (
      !notification?.id ||
      notification.read === true
    ) {
      return;
    }

    try {
      await updateDoc(
        doc(
          db,
          "notifications",
          notification.id
        ),
        {
          read: true,
        }
      );
    } catch (error) {
      console.error(
        "Failed to mark notification as read:",
        error
      );
    }
  };

  /* =========================================================
     DELETE SINGLE NOTIFICATION
  ========================================================= */

  const deleteNotification = async (
    notificationId
  ) => {
    if (!notificationId) {
      return;
    }

    try {
      await deleteDoc(
        doc(
          db,
          "notifications",
          notificationId
        )
      );
    } catch (error) {
      console.error(
        "Failed to delete notification:",
        error
      );
    }
  };

  /* =========================================================
     MARK ALL AS READ
  ========================================================= */

  const markAllNotificationsAsRead = async () => {
    const unreadNotifications =
      notifications.filter(
        (notification) =>
          notification.read !== true
      );

    if (unreadNotifications.length === 0) {
      return;
    }

    try {
      const batch = writeBatch(db);

      unreadNotifications.forEach(
        (notification) => {
          batch.update(
            doc(
              db,
              "notifications",
              notification.id
            ),
            {
              read: true,
            }
          );
        }
      );

      await batch.commit();
    } catch (error) {
      console.error(
        "Failed to mark notifications as read:",
        error
      );
    }
  };

  /* =========================================================
     NOTIFICATION CLICK
  ========================================================= */

  const handleNotificationClick = async (
    notification
  ) => {
    await markNotificationAsRead(notification);
  };

  /* =========================================================
     OUTSIDE CLICK + ESCAPE
  ========================================================= */

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }

      if (
        notificationRef.current &&
        !notificationRef.current.contains(
          event.target
        )
      ) {
        setNotificationsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, []);

  /* =========================================================
     TOGGLE NOTIFICATIONS
  ========================================================= */

  const handleNotificationToggle = () => {
    setNotificationsOpen(
      (previous) => !previous
    );

    setProfileOpen(false);
  };

  /* =========================================================
     TOGGLE PROFILE
  ========================================================= */

  const handleProfileToggle = () => {
    setProfileOpen(
      (previous) => !previous
    );

    setNotificationsOpen(false);
  };

  /* =========================================================
     LOGOUT
  ========================================================= */

  const handleLogout = async () => {
    setProfileOpen(false);
    setNotificationsOpen(false);

    try {
      await logout();

      navigate("/login", {
        replace: true,
      });
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );
    }
  };

  /* =========================================================
     PROFILE / SETTINGS
  ========================================================= */

  const handleProfileClick = () => {
    setProfileOpen(false);

    if (
      user?.role === "administrator"
    ) {
      navigate("/settings");
      return;
    }

    navigate("/devotee-profile");
  };

  return (
    <header className="navbar">
      {/* =====================================================
          LEFT SECTION
      ===================================================== */}

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
            <strong>
              Giri Govardhan BACE
            </strong>

            <small>
              Spiritual Community
            </small>
          </div>
        </div>
      </div>

      {/* =====================================================
          RIGHT SECTION
      ===================================================== */}

      <div className="navbar-right">
        {/* ===================================================
            NOTIFICATIONS
        =================================================== */}

        <div
          className="navbar-notification-wrapper"
          ref={notificationRef}
        >
          <button
            type="button"
            className={`navbar-notification ${
              notificationsOpen
                ? "active"
                : ""
            }`}
            onClick={
              handleNotificationToggle
            }
            aria-label={
              unreadCount > 0
                ? `${unreadCount} unread notifications`
                : "Notifications"
            }
            aria-expanded={
              notificationsOpen
            }
            aria-haspopup="true"
            title="Notifications"
          >
            <span
              className="notification-icon"
              aria-hidden="true"
            >
              ♢
            </span>

            {unreadCount > 0 && (
              <span
                className="notification-count"
                aria-hidden="true"
              >
                {unreadCount > 99
                  ? "99+"
                  : unreadCount}
              </span>
            )}
          </button>

          {/* =================================================
              NOTIFICATION PANEL
          ================================================= */}

          {notificationsOpen && (
            <div
              className="notification-panel"
              role="dialog"
              aria-label="Notifications"
            >
              <div className="notification-panel-header">
                <div>
                  <strong>
                    Notifications
                  </strong>

                  <small>
                    {unreadCount > 0
                      ? `${unreadCount} unread`
                      : "All caught up"}
                  </small>
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="notification-mark-all"
                    onClick={
                      markAllNotificationsAsRead
                    }
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div
                className="notification-panel-divider"
                aria-hidden="true"
              />

              <div className="notification-list">
                {notificationsLoading ? (
                  <div className="notification-empty">
                    <div className="notification-empty-icon">
                      •
                    </div>

                    <strong>
                      Loading notifications
                    </strong>

                    <span>
                      Please wait a moment.
                    </span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="notification-empty">
                    <div className="notification-empty-icon">
                      ✓
                    </div>

                    <strong>
                      No new notifications
                    </strong>

                    <span>
                      You are all caught up.
                    </span>
                  </div>
                ) : (
                  notifications.map(
                    (notification) => {
                      const isUnread =
                        notification.read !==
                        true;

                      return (
                        <article
                          key={
                            notification.id
                          }
                          className={`notification-item ${
                            isUnread
                              ? "unread"
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="notification-content"
                            onClick={() =>
                              handleNotificationClick(
                                notification
                              )
                            }
                          >
                            <span
                              className="notification-status-dot"
                              aria-hidden="true"
                            />

                            <span className="notification-content-main">
                              <strong>
                                {notification.title ||
                                  "Notification"}
                              </strong>

                              <span>
                                {notification.message ||
                                  ""}
                              </span>

                              <small>
                                {formatNotificationTime(
                                  notification.createdAt
                                )}
                              </small>
                            </span>
                          </button>

                          <button
                            type="button"
                            className="notification-delete"
                            onClick={() =>
                              deleteNotification(
                                notification.id
                              )
                            }
                            aria-label="Clear notification"
                            title="Clear notification"
                          >
                            ×
                          </button>
                        </article>
                      );
                    }
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===================================================
            PROFILE
        =================================================== */}

        <div
          className="navbar-profile"
          ref={profileRef}
        >
          <button
            type="button"
            className={`profile-trigger ${
              profileOpen
                ? "active"
                : ""
            }`}
            onClick={handleProfileToggle}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label={`Open profile menu for ${displayName}`}
          >
            <span
              className="profile-avatar"
              aria-hidden="true"
            >
              {initials}
            </span>

            <span className="profile-details">
              <strong>
                {displayName}
              </strong>

              <small>
                {displayRole}
              </small>
            </span>

            <span
              className={`profile-arrow ${
                profileOpen
                  ? "open"
                  : ""
              }`}
              aria-hidden="true"
            >
              ▾
            </span>
          </button>

          {/* =================================================
              PROFILE DROPDOWN
          ================================================= */}

          {profileOpen && (
            <div
              className="profile-menu"
              role="menu"
              aria-label="Profile menu"
            >
              <div className="profile-menu-header">
                <span
                  className="profile-avatar large"
                  aria-hidden="true"
                >
                  {initials}
                </span>

                <div className="profile-menu-user">
                  <strong>
                    {displayName}
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

              <button
                type="button"
                className="profile-menu-item"
                role="menuitem"
                onClick={
                  handleProfileClick
                }
              >
                <span
                  className="profile-menu-icon"
                  aria-hidden="true"
                >
                  👤
                </span>

                <span>
                  {profileLabel}
                </span>
              </button>

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

                <span>
                  Sign out
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;