import { useEffect, useState } from "react";

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

const DEFAULT_SETTINGS = {
  templeName: "Temple Base Management",
  morningProgram: "04:30",
  eveningProgram: "18:30",
  attendanceRequired: true,
  leaveApproval: true,
  notifications: true,
};

function Settings() {
  const { user, isAdministrator } = useAuth();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isAdministrator) {
      setLoading(false);
      return;
    }

    loadSettings();
  }, [isAdministrator]);

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const settingsRef = doc(db, "settings", "general");
      const settingsSnapshot = await getDoc(settingsRef);

      if (settingsSnapshot.exists()) {
        const firestoreSettings = settingsSnapshot.data();

        const loadedSettings = {
          ...DEFAULT_SETTINGS,
          ...firestoreSettings,
        };

        setSettings(loadedSettings);
        setSavedSettings(loadedSettings);
      } else {
        setSettings(DEFAULT_SETTINGS);
        setSavedSettings(DEFAULT_SETTINGS);
      }
    } catch (firebaseError) {
      console.error("Failed to load settings:", firebaseError);

      setError(
        "Unable to load system settings. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (name, value) => {
    setSettings((previous) => ({
      ...previous,
      [name]: value,
    }));

    setSuccess("");
    setError("");
  };

  const hasUnsavedChanges =
    JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const saveSettings = async () => {
    if (!isAdministrator || !user?.uid) {
      setError("Administrator access is required.");
      return;
    }

    if (!settings.templeName.trim()) {
      setError("Temple / Organization Name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const settingsRef = doc(db, "settings", "general");

      const settingsToSave = {
        templeName: settings.templeName.trim(),
        morningProgram: settings.morningProgram,
        eveningProgram: settings.eveningProgram,
        attendanceRequired: Boolean(settings.attendanceRequired),
        leaveApproval: Boolean(settings.leaveApproval),
        notifications: Boolean(settings.notifications),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };

      await setDoc(settingsRef, settingsToSave, {
        merge: true,
      });

      const updatedSettings = {
        templeName: settings.templeName.trim(),
        morningProgram: settings.morningProgram,
        eveningProgram: settings.eveningProgram,
        attendanceRequired: Boolean(settings.attendanceRequired),
        leaveApproval: Boolean(settings.leaveApproval),
        notifications: Boolean(settings.notifications),
      };

      setSettings(updatedSettings);
      setSavedSettings(updatedSettings);

      setSuccess("Settings saved successfully.");
    } catch (firebaseError) {
      console.error("Failed to save settings:", firebaseError);

      setError(
        "Unable to save settings. Please check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setSettings(savedSettings);
    setError("");
    setSuccess("");
  };

  if (!isAdministrator) {
    return (
      <div className="settings-denied">
        <h2>Administrator Access Required</h2>
        <p>
          System settings are available only to administrators.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader text="Loading system settings..." />
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="page-header settings-page-header">
        <div>
          <span className="page-eyebrow">
            System Configuration
          </span>

          <h1>Settings</h1>

          <p>
            Manage temple operations, daily schedules, and
            system rules.
          </p>
        </div>

        {hasUnsavedChanges && (
          <span className="settings-unsaved">
            Unsaved changes
          </span>
        )}
      </div>

      {/* =====================================================
          ALERTS
      ====================================================== */}

      {error && (
        <div className="settings-alert settings-alert-error">
          <span>!</span>

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

      {success && (
        <div className="settings-alert settings-alert-success">
          <span>✓</span>

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
          SETTINGS LAYOUT
      ====================================================== */}

      <div className="settings-layout">
        {/* ===================================================
            MENU
        ==================================================== */}

        <aside className="settings-menu">
          <button
            type="button"
            className="active"
          >
            General
          </button>

          <button
            type="button"
            className="active"
          >
            Daily Schedule
          </button>

          <button
            type="button"
            className="active"
          >
            System Rules
          </button>
        </aside>

        {/* ===================================================
            CONTENT
        ==================================================== */}

        <section className="settings-content">
          {/* =================================================
              GENERAL
          ================================================== */}

          <div className="settings-section">
            <span className="card-eyebrow">
              General
            </span>

            <h2>General Settings</h2>

            <p>
              Basic information used throughout the temple
              management system.
            </p>

            <label>
              Temple / Organization Name

              <input
                type="text"
                value={settings.templeName}
                onChange={(event) =>
                  updateSetting(
                    "templeName",
                    event.target.value
                  )
                }
                placeholder="Enter temple name"
                disabled={saving}
              />
            </label>
          </div>

          {/* =================================================
              DAILY SCHEDULE
          ================================================== */}

          <div className="settings-section">
            <span className="card-eyebrow">
              Schedule
            </span>

            <h2>Daily Schedule</h2>

            <p>
              Configure the regular morning and evening
              program timings.
            </p>

            <div className="settings-two-column">
              <label>
                Morning Program

                <input
                  type="time"
                  value={settings.morningProgram}
                  onChange={(event) =>
                    updateSetting(
                      "morningProgram",
                      event.target.value
                    )
                  }
                  disabled={saving}
                />
              </label>

              <label>
                Evening Program

                <input
                  type="time"
                  value={settings.eveningProgram}
                  onChange={(event) =>
                    updateSetting(
                      "eveningProgram",
                      event.target.value
                    )
                  }
                  disabled={saving}
                />
              </label>
            </div>
          </div>

          {/* =================================================
              SYSTEM RULES
          ================================================== */}

          <div className="settings-section">
            <span className="card-eyebrow">
              Operations
            </span>

            <h2>System Rules</h2>

            <p>
              Control the operational rules used by the
              temple management system.
            </p>

            <div className="setting-toggle">
              <div>
                <strong>Attendance Required</strong>

                <span>
                  Track daily resident attendance.
                </span>
              </div>

              <input
                type="checkbox"
                checked={settings.attendanceRequired}
                onChange={(event) =>
                  updateSetting(
                    "attendanceRequired",
                    event.target.checked
                  )
                }
                disabled={saving}
              />
            </div>

            <div className="setting-toggle">
              <div>
                <strong>Leave Approval</strong>

                <span>
                  Require administrator approval for
                  devotee leave requests.
                </span>
              </div>

              <input
                type="checkbox"
                checked={settings.leaveApproval}
                onChange={(event) =>
                  updateSetting(
                    "leaveApproval",
                    event.target.checked
                  )
                }
                disabled={saving}
              />
            </div>

            <div className="setting-toggle">
              <div>
                <strong>Notifications</strong>

                <span>
                  Enable application notifications and
                  system alerts.
                </span>
              </div>

              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(event) =>
                  updateSetting(
                    "notifications",
                    event.target.checked
                  )
                }
                disabled={saving}
              />
            </div>
          </div>

          {/* =================================================
              SAVE AREA
          ================================================== */}

          <div className="settings-actions">
            <div className="settings-save-info">
              {hasUnsavedChanges
                ? "You have unsaved changes."
                : "All settings are up to date."}
            </div>

            <div className="settings-action-buttons">
              {hasUnsavedChanges && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetChanges}
                  disabled={saving}
                >
                  Reset Changes
                </button>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={saveSettings}
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Settings;