import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/firebase";
import Loader from "../../components/Common/Loader";

import "./Settings.css";

/* =========================================================
   DEFAULT SETTINGS
   ========================================================= */

const DEFAULT_SETTINGS = {
  templeName: "Giri Govardhan BACE",

  morningProgram: "04:30",
  eveningProgram: "18:30",

  attendanceRequired: true,
  leaveApproval: true,
  notifications: true,

  // IMPORTANT:
  // Admin decides when Sadhana tracking begins.
  trackingStartDate: "",
};

/* =========================================================
   SETTINGS SECTIONS
   ========================================================= */

const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    shortLabel: "General",
  },
  {
    id: "schedule",
    label: "Daily Schedule",
    shortLabel: "Schedule",
  },
  {
    id: "sadhana",
    label: "Sadhana Tracking",
    shortLabel: "Sadhana",
  },
  {
    id: "operations",
    label: "System Rules",
    shortLabel: "Rules",
  },
  {
    id: "overview",
    label: "System Overview",
    shortLabel: "Overview",
  },
];

/* =========================================================
   HELPERS
   ========================================================= */

const getTodayDate = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const normalizeSettings = (value = {}) => ({
  templeName:
    typeof value.templeName === "string"
      ? value.templeName
      : DEFAULT_SETTINGS.templeName,

  morningProgram:
    typeof value.morningProgram === "string"
      ? value.morningProgram
      : DEFAULT_SETTINGS.morningProgram,

  eveningProgram:
    typeof value.eveningProgram === "string"
      ? value.eveningProgram
      : DEFAULT_SETTINGS.eveningProgram,

  attendanceRequired:
    typeof value.attendanceRequired === "boolean"
      ? value.attendanceRequired
      : DEFAULT_SETTINGS.attendanceRequired,

  leaveApproval:
    typeof value.leaveApproval === "boolean"
      ? value.leaveApproval
      : DEFAULT_SETTINGS.leaveApproval,

  notifications:
    typeof value.notifications === "boolean"
      ? value.notifications
      : DEFAULT_SETTINGS.notifications,

  trackingStartDate:
    typeof value.trackingStartDate === "string"
      ? value.trackingStartDate
      : DEFAULT_SETTINGS.trackingStartDate,
});

const formatTime = (time) => {
  if (!time) return "Not configured";

  const [hours, minutes] = time.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const formatDate = (dateValue) => {
  if (!dateValue) {
    return "Not configured";
  }

  const parts = dateValue.split("-");

  if (parts.length !== 3) {
    return dateValue;
  }

  const [year, month, day] = parts;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

/* =========================================================
   COMPONENT
   ========================================================= */

function Settings() {
  const { user, isAdministrator } = useAuth();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [activeSection, setActiveSection] = useState("general");

  const successTimerRef = useRef(null);

  /* =========================================================
     UNSAVED CHANGES
     ========================================================= */

  const hasUnsavedChanges = useMemo(
    () =>
      JSON.stringify(settings) !==
      JSON.stringify(savedSettings),
    [settings, savedSettings]
  );

  /* =========================================================
     MESSAGES
     ========================================================= */

  const clearMessages = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

  const showSuccess = useCallback((message) => {
    setSuccess(message);

    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }

    successTimerRef.current = setTimeout(() => {
      setSuccess("");
    }, 4000);
  }, []);

  /* =========================================================
     LOAD SETTINGS
     ========================================================= */

  const loadSettings = useCallback(
    async ({ silent = false } = {}) => {
      if (!isAdministrator) {
        setLoading(false);
        return;
      }

      if (silent) {
        setReloading(true);
      } else {
        setLoading(true);
      }

      setError("");

      if (!silent) {
        setSuccess("");
      }

      try {
        const settingsRef = doc(
          db,
          "settings",
          "general"
        );

        /*
         * ONE FIRESTORE READ
         *
         * No realtime listener is needed.
         */
        const snapshot = await getDoc(settingsRef);

        const loadedSettings = snapshot.exists()
          ? normalizeSettings(snapshot.data())
          : DEFAULT_SETTINGS;

        setSettings(loadedSettings);
        setSavedSettings(loadedSettings);

        if (silent) {
          showSuccess(
            snapshot.exists()
              ? "Latest settings loaded."
              : "No saved settings found. Default values are active."
          );
        }
      } catch (firebaseError) {
        console.error(
          "Failed to load settings:",
          firebaseError
        );

        setError(
          "Unable to load system settings. Please check your connection and try again."
        );
      } finally {
        setLoading(false);
        setReloading(false);
      }
    },
    [isAdministrator, showSuccess]
  );

  /* =========================================================
     INITIAL LOAD
     ========================================================= */

  useEffect(() => {
    loadSettings();

    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [loadSettings]);

  /* =========================================================
     WARN BEFORE BROWSER CLOSE
     ========================================================= */

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [hasUnsavedChanges]);

  /* =========================================================
     UPDATE SETTING
     ========================================================= */

  const updateSetting = (name, value) => {
    setSettings((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  /* =========================================================
     VALIDATION
     ========================================================= */

  const validateSettings = () => {
    const templeName = settings.templeName.trim();

    if (!templeName) {
      return "Organization Name is required.";
    }

    if (templeName.length < 2) {
      return "Organization Name must contain at least 2 characters.";
    }

    if (templeName.length > 100) {
      return "Organization Name must be 100 characters or fewer.";
    }

    const timePattern =
      /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timePattern.test(settings.morningProgram)) {
      return "Please enter a valid morning program time.";
    }

    if (!timePattern.test(settings.eveningProgram)) {
      return "Please enter a valid evening program time.";
    }

    /*
     * Sadhana tracking date is required for production.
     */
    if (!settings.trackingStartDate) {
      return "Please select the Sadhana tracking start date.";
    }

    const selectedDate = new Date(
      `${settings.trackingStartDate}T00:00:00`
    );

    const today = new Date(
      `${getTodayDate()}T00:00:00`
    );

    if (Number.isNaN(selectedDate.getTime())) {
      return "Please select a valid Sadhana tracking start date.";
    }

    if (selectedDate > today) {
      return "Sadhana tracking start date cannot be in the future.";
    }

    return "";
  };

  /* =========================================================
     SAVE SETTINGS
     ========================================================= */

  const saveSettings = async () => {
    if (!isAdministrator || !user?.uid) {
      setError("Administrator access is required.");
      return;
    }

    if (saving) {
      return;
    }

    const validationError = validateSettings();

    if (validationError) {
      setError(validationError);

      if (
        validationError.toLowerCase().includes("date")
      ) {
        setActiveSection("sadhana");
      } else if (
        validationError.toLowerCase().includes("time")
      ) {
        setActiveSection("schedule");
      } else {
        setActiveSection("general");
      }

      return;
    }

    if (!hasUnsavedChanges) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const settingsRef = doc(
        db,
        "settings",
        "general"
      );

      const settingsToSave = {
        templeName: settings.templeName.trim(),

        morningProgram:
          settings.morningProgram,

        eveningProgram:
          settings.eveningProgram,

        attendanceRequired:
          Boolean(settings.attendanceRequired),

        leaveApproval:
          Boolean(settings.leaveApproval),

        notifications:
          Boolean(settings.notifications),

        /*
         * IMPORTANT:
         * This is the date from which Sadhana
         * reporting should start.
         */
        trackingStartDate:
          settings.trackingStartDate,

        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      /*
       * ONE FIRESTORE WRITE
       */
      await setDoc(
        settingsRef,
        settingsToSave,
        { merge: true }
      );

      const normalizedSavedSettings =
        normalizeSettings(settingsToSave);

      setSettings(normalizedSavedSettings);
      setSavedSettings(normalizedSavedSettings);

      showSuccess(
        "Settings saved successfully."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to save settings:",
        firebaseError
      );

      setError(
        "Unable to save settings. Please check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     CTRL + S
     ========================================================= */

  useEffect(() => {
    const handleKeyboardSave = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        hasUnsavedChanges
      ) {
        event.preventDefault();
        saveSettings();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyboardSave
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboardSave
      );
    };
  }, [hasUnsavedChanges]);

  /* =========================================================
     RESET
     ========================================================= */

  const resetChanges = () => {
    if (!hasUnsavedChanges) {
      return;
    }

    const shouldReset = window.confirm(
      "Discard all unsaved changes and restore the last saved settings?"
    );

    if (!shouldReset) {
      return;
    }

    setSettings(savedSettings);
    clearMessages();
  };

  /* =========================================================
     RELOAD
     ========================================================= */

  const handleReload = async () => {
    if (saving || reloading) {
      return;
    }

    if (hasUnsavedChanges) {
      const shouldReload = window.confirm(
        "You have unsaved changes. Reloading will discard them. Continue?"
      );

      if (!shouldReload) {
        return;
      }
    }

    await loadSettings({
      silent: true,
    });
  };

  /* =========================================================
     SECTION NAVIGATION
     ========================================================= */

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);

    const element = document.getElementById(
      `settings-${sectionId}`
    );

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  /* =========================================================
     STATUS
     ========================================================= */

  const statusItems = useMemo(
    () => [
      {
        label: "Attendance",
        value: settings.attendanceRequired
          ? "Required"
          : "Disabled",
        enabled:
          settings.attendanceRequired,
      },
      {
        label: "Leave Approval",
        value: settings.leaveApproval
          ? "Administrator approval"
          : "Automatic",
        enabled:
          settings.leaveApproval,
      },
      {
        label: "Notifications",
        value: settings.notifications
          ? "Enabled"
          : "Disabled",
        enabled:
          settings.notifications,
      },
    ],
    [settings]
  );

  /* =========================================================
     ACCESS DENIED
     ========================================================= */

  if (!isAdministrator) {
    return (
      <div className="settings-page">
        <div className="settings-denied">
          <div
            className="settings-denied-icon"
            aria-hidden="true"
          >
            !
          </div>

          <span className="page-eyebrow">
            Restricted Area
          </span>

          <h2>
            Administrator Access Required
          </h2>

          <p>
            System settings are available only to
            administrators. Your current account does
            not have permission to change these controls.
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader text="Loading system settings..." />
      </div>
    );
  }

  /* =========================================================
     MAIN UI
     ========================================================= */

  return (
    <div className="settings-page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="settings-page-header">

        <div className="settings-title-area">

          <span className="page-eyebrow">
            BACE Administration
          </span>

          <h1>Settings</h1>

          <p>
            Configure the organization, daily schedule,
            Sadhana tracking period, and operational
            rules from one controlled admin workspace.
          </p>

        </div>

        <div className="settings-header-actions">

          {hasUnsavedChanges && (
            <span className="settings-unsaved">
              <span className="settings-status-dot" />
              Unsaved changes
            </span>
          )}

          <button
            type="button"
            className="settings-reload-button"
            onClick={handleReload}
            disabled={
              saving || reloading
            }
          >
            <span aria-hidden="true">
              {reloading ? "…" : "↻"}
            </span>

            {reloading
              ? "Refreshing"
              : "Refresh"}
          </button>

        </div>

      </header>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div
          className="settings-alert settings-alert-error"
          role="alert"
          aria-live="polite"
        >
          <span className="settings-alert-icon">
            !
          </span>

          <p>{error}</p>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* =====================================================
          SUCCESS
      ===================================================== */}

      {success && (
        <div
          className="settings-alert settings-alert-success"
          role="status"
          aria-live="polite"
        >
          <span className="settings-alert-icon">
            ✓
          </span>

          <p>{success}</p>

          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss success message"
          >
            ×
          </button>
        </div>
      )}

      {/* =====================================================
          MOBILE NAV
      ===================================================== */}

      <div
        className="settings-mobile-nav"
        aria-label="Settings sections"
      >
        <label htmlFor="settings-section-select">
          Jump to section
        </label>

        <select
          id="settings-section-select"
          value={activeSection}
          onChange={(event) =>
            scrollToSection(
              event.target.value
            )
          }
          disabled={saving}
        >
          {SETTINGS_SECTIONS.map(
            (section) => (
              <option
                key={section.id}
                value={section.id}
              >
                {section.label}
              </option>
            )
          )}
        </select>
      </div>

      {/* =====================================================
          LAYOUT
      ===================================================== */}

      <div className="settings-layout">

        {/* ===================================================
            SIDEBAR
        =================================================== */}

        <aside
          className="settings-menu"
          aria-label="Settings navigation"
        >

          <div className="settings-menu-heading">
            <span>
              Configuration
            </span>

            <small>
              Administrator
            </small>
          </div>

          <nav>
            {SETTINGS_SECTIONS.map(
              (section) => (
                <button
                  key={section.id}
                  type="button"
                  className={
                    activeSection ===
                    section.id
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    scrollToSection(
                      section.id
                    )
                  }
                  disabled={saving}
                >
                  <span>
                    {section.label}
                  </span>

                  <span aria-hidden="true">
                    ›
                  </span>
                </button>
              )
            )}
          </nav>

          <div className="settings-menu-tip">
            <strong>
              Keyboard shortcut
            </strong>

            <span>
              Press <kbd>Ctrl</kbd> +{" "}
              <kbd>S</kbd> to save changes.
            </span>
          </div>

        </aside>

        {/* ===================================================
            CONTENT
        =================================================== */}

        <main className="settings-content">

          {/* =================================================
              GENERAL
          ================================================= */}

          <section
            id="settings-general"
            className="settings-section settings-section-card"
          >

            <div className="settings-section-heading">

              <div>

                <span className="card-eyebrow">
                  01 · General
                </span>

                <h2>
                  Organization Identity
                </h2>

                <p>
                  This information is stored in the
                  shared system settings document and
                  can be used across the BACE application.
                </p>

              </div>

              <div className="settings-section-number">
                01
              </div>

            </div>

            <div className="settings-form-grid">

              <label className="settings-field settings-field-full">

                <span>
                  Organization Name
                </span>

                <input
                  type="text"
                  value={settings.templeName}
                  onChange={(event) =>
                    updateSetting(
                      "templeName",
                      event.target.value
                    )
                  }
                  placeholder="Enter organization name"
                  maxLength={100}
                  disabled={saving}
                />

                <small>
                  {settings.templeName.length}
                  /100 characters
                </small>

              </label>

            </div>

          </section>

          {/* =================================================
              SCHEDULE
          ================================================= */}

          <section
            id="settings-schedule"
            className="settings-section settings-section-card"
          >

            <div className="settings-section-heading">

              <div>

                <span className="card-eyebrow">
                  02 · Schedule
                </span>

                <h2>
                  Daily Program Schedule
                </h2>

                <p>
                  Set the regular program timings displayed
                  and used by BACE operational workflows.
                </p>

              </div>

              <div className="settings-section-number">
                02
              </div>

            </div>

            <div className="settings-form-grid">

              <label className="settings-field">

                <span>
                  Morning Program
                </span>

                <div className="settings-input-with-badge">

                  <input
                    type="time"
                    value={
                      settings.morningProgram
                    }
                    onChange={(event) =>
                      updateSetting(
                        "morningProgram",
                        event.target.value
                      )
                    }
                    disabled={saving}
                  />

                  <span>
                    {formatTime(
                      settings.morningProgram
                    )}
                  </span>

                </div>

                <small>
                  Default morning program start time.
                </small>

              </label>

              <label className="settings-field">

                <span>
                  Evening Program
                </span>

                <div className="settings-input-with-badge">

                  <input
                    type="time"
                    value={
                      settings.eveningProgram
                    }
                    onChange={(event) =>
                      updateSetting(
                        "eveningProgram",
                        event.target.value
                      )
                    }
                    disabled={saving}
                  />

                  <span>
                    {formatTime(
                      settings.eveningProgram
                    )}
                  </span>

                </div>

                <small>
                  Default evening program start time.
                </small>

              </label>

            </div>

            <div className="settings-schedule-preview">

              <div>
                <span>
                  Morning
                </span>

                <strong>
                  {formatTime(
                    settings.morningProgram
                  )}
                </strong>
              </div>

              <div
                className="settings-schedule-line"
                aria-hidden="true"
              />

              <div>
                <span>
                  Evening
                </span>

                <strong>
                  {formatTime(
                    settings.eveningProgram
                  )}
                </strong>
              </div>

            </div>

          </section>

          {/* =================================================
              SADHANA TRACKING
          ================================================= */}

          <section
            id="settings-sadhana"
            className="settings-section settings-section-card settings-sadhana-card"
          >

            <div className="settings-section-heading">

              <div>

                <span className="card-eyebrow">
                  03 · Sadhana
                </span>

                <h2>
                  Sadhana Tracking Start Date
                </h2>

                <p>
                  Choose the date from which the community
                  Sadhana system should officially start
                  counting records and completion.
                </p>

              </div>

              <div className="settings-section-number">
                03
              </div>

            </div>

            <div className="tracking-start-panel">

              <div className="tracking-start-info">

                <div className="tracking-start-icon">
                  ॐ
                </div>

                <div>

                  <strong>
                    Community tracking begins here
                  </strong>

                  <p>
                    Dates before this date are treated
                    as outside the active Sadhana
                    tracking period. They should not
                    contribute to monthly completion,
                    submitted totals, or reports.
                  </p>

                </div>

              </div>

              <label className="settings-field tracking-date-field">

                <span>
                  Tracking Start Date
                </span>

                <input
                  type="date"
                  value={
                    settings.trackingStartDate
                  }
                  max={getTodayDate()}
                  onChange={(event) =>
                    updateSetting(
                      "trackingStartDate",
                      event.target.value
                    )
                  }
                  disabled={saving}
                />

                <small>
                  Current setting:{" "}
                  <strong>
                    {formatDate(
                      settings.trackingStartDate
                    )}
                  </strong>
                </small>

              </label>

            </div>

            <div className="tracking-start-warning">

              <span
                className="tracking-warning-icon"
                aria-hidden="true"
              >
                i
              </span>

              <div>

                <strong>
                  Important
                </strong>

                <p>
                  Changing this date changes the reporting
                  boundary for Sadhana. Records before the
                  selected date should be ignored by the
                  reporting logic.
                </p>

              </div>

            </div>

          </section>

          {/* =================================================
              OPERATIONS
          ================================================= */}

          <section
            id="settings-operations"
            className="settings-section settings-section-card"
          >

            <div className="settings-section-heading">

              <div>

                <span className="card-eyebrow">
                  04 · Operations
                </span>

                <h2>
                  System Rules
                </h2>

                <p>
                  Enable or disable the operational controls
                  used by the BACE application.
                </p>

              </div>

              <div className="settings-section-number">
                04
              </div>

            </div>

            <div className="settings-rule-list">

              {/* Attendance */}

              <div className="settings-rule">

                <div
                  className="settings-rule-icon"
                  aria-hidden="true"
                >
                  A
                </div>

                <div className="settings-rule-copy">

                  <strong>
                    Attendance Required
                  </strong>

                  <span>
                    Track daily resident attendance as
                    part of the normal operational workflow.
                  </span>

                </div>

                <label className="settings-switch">

                  <input
                    type="checkbox"
                    checked={
                      settings.attendanceRequired
                    }
                    onChange={(event) =>
                      updateSetting(
                        "attendanceRequired",
                        event.target.checked
                      )
                    }
                    disabled={saving}
                  />

                  <span aria-hidden="true" />

                </label>

              </div>

              {/* Leave */}

              <div className="settings-rule">

                <div
                  className="settings-rule-icon"
                  aria-hidden="true"
                >
                  L
                </div>

                <div className="settings-rule-copy">

                  <strong>
                    Leave Approval
                  </strong>

                  <span>
                    Require administrator approval for
                    devotee leave requests.
                  </span>

                </div>

                <label className="settings-switch">

                  <input
                    type="checkbox"
                    checked={
                      settings.leaveApproval
                    }
                    onChange={(event) =>
                      updateSetting(
                        "leaveApproval",
                        event.target.checked
                      )
                    }
                    disabled={saving}
                  />

                  <span aria-hidden="true" />

                </label>

              </div>

              {/* Notifications */}

              <div className="settings-rule">

                <div
                  className="settings-rule-icon"
                  aria-hidden="true"
                >
                  N
                </div>

                <div className="settings-rule-copy">

                  <strong>
                    Notifications
                  </strong>

                  <span>
                    Allow application notifications and
                    system alerts to be used by the application.
                  </span>

                </div>

                <label className="settings-switch">

                  <input
                    type="checkbox"
                    checked={
                      settings.notifications
                    }
                    onChange={(event) =>
                      updateSetting(
                        "notifications",
                        event.target.checked
                      )
                    }
                    disabled={saving}
                  />

                  <span aria-hidden="true" />

                </label>

              </div>

            </div>

          </section>

          {/* =================================================
              OVERVIEW
          ================================================= */}

          <section
            id="settings-overview"
            className="settings-section settings-section-card"
          >

            <div className="settings-section-heading">

              <div>

                <span className="card-eyebrow">
                  05 · Overview
                </span>

                <h2>
                  Current System Status
                </h2>

                <p>
                  A read-only summary generated from the
                  settings currently loaded on this page.
                </p>

              </div>

              <div className="settings-section-number">
                05
              </div>

            </div>

            <div className="settings-overview-grid">

              <div className="settings-overview-card">

                <span>
                  Organization
                </span>

                <strong>
                  {settings.templeName ||
                    "Not configured"}
                </strong>

                <small>
                  Active system identity
                </small>

              </div>

              <div className="settings-overview-card">

                <span>
                  Sadhana Tracking
                </span>

                <strong>
                  {formatDate(
                    settings.trackingStartDate
                  )}
                </strong>

                <small>
                  Official tracking start
                </small>

              </div>

              <div className="settings-overview-card">

                <span>
                  Morning Program
                </span>

                <strong>
                  {formatTime(
                    settings.morningProgram
                  )}
                </strong>

                <small>
                  Configured schedule
                </small>

              </div>

              <div className="settings-overview-card">

                <span>
                  Evening Program
                </span>

                <strong>
                  {formatTime(
                    settings.eveningProgram
                  )}
                </strong>

                <small>
                  Configured schedule
                </small>

              </div>

            </div>

            <div className="settings-status-grid">

              {statusItems.map(
                (item) => (
                  <div
                    className="settings-status-item"
                    key={item.label}
                  >

                    <span
                      className={`settings-status-indicator ${
                        item.enabled
                          ? "is-on"
                          : "is-off"
                      }`}
                      aria-hidden="true"
                    />

                    <div>

                      <strong>
                        {item.label}
                      </strong>

                      <span>
                        {item.value}
                      </span>

                    </div>

                  </div>
                )
              )}

            </div>

          </section>

          {/* =================================================
              SAVE ACTIONS
          ================================================= */}

          <div className="settings-actions">

            <div className="settings-save-info">

              <span
                className={`settings-save-dot ${
                  hasUnsavedChanges
                    ? "is-dirty"
                    : ""
                }`}
              />

              {hasUnsavedChanges
                ? "You have unsaved changes."
                : "All settings are up to date."}

            </div>

            <div className="settings-action-buttons">

              <button
                type="button"
                className="secondary-button"
                onClick={resetChanges}
                disabled={
                  saving ||
                  !hasUnsavedChanges
                }
              >
                Discard Changes
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={saveSettings}
                disabled={
                  saving ||
                  !hasUnsavedChanges
                }
              >

                {saving ? (
                  <>
                    <span className="settings-button-spinner" />
                    Saving…
                  </>
                ) : (
                  "Save Settings"
                )}

              </button>

            </div>

          </div>

        </main>

      </div>

    </div>
  );
}

export default Settings;