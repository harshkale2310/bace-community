import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../services/firebase";

import { useAuth } from "../../context/AuthContext";

import Loader from "../../components/Common/Loader";

import "./DevoteeProfile.css";

function DevoteeProfile() {
  const { id } = useParams();

  const navigate = useNavigate();

  const { user, isAdministrator, isDevotee } = useAuth();

  /*
   * Administrator:
   *   /devotees/:id
   *
   * Devotee:
   *   /devotee-profile
   *
   * A devotee's Firebase UID is the source of truth.
   */

  const requestedUid = isAdministrator ? id : user?.uid;

  const [devotee, setDevotee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    gender: "",
    age: "",
    department: "Giri Govardhan BACE",
    room: "",
    bed: "",
  });

  /*
   * Load the requested profile directly from Firestore.
   */

  useEffect(() => {
    if (!requestedUid) {
      setLoading(false);
      setDevotee(null);
      return undefined;
    }

    setLoading(true);
    setError("");

    const userRef = doc(db, "users", requestedUid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setDevotee(null);
          setLoading(false);
          return;
        }

        const profile = {
          uid: snapshot.id,
          ...snapshot.data(),
        };

        /*
         * This page is specifically for devotee profiles.
         * Never render an administrator account here.
         */

        if (profile.role !== "devotee") {
          setDevotee(null);
          setLoading(false);
          return;
        }

        setDevotee(profile);
        setLoading(false);
      },
      (snapshotError) => {
        console.error(
          "Failed to load devotee profile:",
          snapshotError
        );

        setError(
          "Unable to load this devotee profile. Please check your Firebase permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [requestedUid]);

  /*
   * Security/navigation check:
   *
   * A devotee is never allowed to inspect another UID through
   * /devotees/:id.
   */

  useEffect(() => {
    if (
      !loading &&
      isDevotee &&
      id &&
      id !== user?.uid
    ) {
      navigate("/devotee-profile", { replace: true });
    }
  }, [
    loading,
    isDevotee,
    id,
    user?.uid,
    navigate,
  ]);

  /*
   * Keep the form synchronized with the current Firestore
   * document when editing is not active.
   */

  useEffect(() => {
    if (!devotee || editing) {
      return;
    }

    setForm({
      name: devotee.name || "",
      email: devotee.email || "",
      phone: devotee.phone || "",
      gender: devotee.gender || "",
      age:
        devotee.age !== undefined &&
        devotee.age !== null
          ? String(devotee.age)
          : "",
      department:
        devotee.department || "Giri Govardhan BACE",
      room: devotee.room || "",
      bed: devotee.bed || "",
    });
  }, [devotee, editing]);

  const status = getStatus(devotee);

  const initials = useMemo(
    () => getInitials(devotee?.name),
    [devotee?.name]
  );

  const joinDate = formatDate(
    devotee?.joinDate || devotee?.createdAt
  );

  const rounds =
    devotee?.rounds !== undefined &&
    devotee?.rounds !== null
      ? devotee.rounds
      : 0;

  const reading =
    devotee?.reading !== undefined &&
    devotee?.reading !== null
      ? devotee.reading
      : 0;

  const handleBack = () => {
    if (isAdministrator) {
      navigate("/devotees");
    } else {
      navigate("/dashboard");
    }
  };

  const handleInput = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (saveError) {
      setSaveError("");
    }
  };

  const startEditing = () => {
    if (!devotee) {
      return;
    }

    setSaveError("");

    setForm({
      name: devotee.name || "",
      email: devotee.email || "",
      phone: devotee.phone || "",
      gender: devotee.gender || "",
      age:
        devotee.age !== undefined &&
        devotee.age !== null
          ? String(devotee.age)
          : "",
      department:
        devotee.department || "Giri Govardhan BACE",
      room: devotee.room || "",
      bed: devotee.bed || "",
    });

    setEditing(true);
  };

  const cancelEditing = () => {
    if (saving) {
      return;
    }

    setEditing(false);
    setSaveError("");
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!devotee?.uid) {
      return;
    }

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const gender = form.gender.trim();

    const department =
      form.department.trim() || "Giri Govardhan BACE";

    const room = form.room.trim();
    const bed = form.bed.trim();

    if (!name) {
      setSaveError("Full name is required.");
      return;
    }

    if (
      email &&
      !/\S+@\S+\.\S+/.test(email)
    ) {
      setSaveError("Please enter a valid email address.");
      return;
    }

    let age = null;

    if (form.age.trim()) {
      const parsedAge = Number(form.age);

      if (
        !Number.isInteger(parsedAge) ||
        parsedAge < 1 ||
        parsedAge > 120
      ) {
        setSaveError(
          "Age must be a valid number between 1 and 120."
        );

        return;
      }

      age = parsedAge;
    }

    /*
     * Security-sensitive fields are intentionally NOT included:
     *
     * uid
     * role
     * status
     * createdAt
     *
     * The profile page must never allow a user to promote
     * themselves or change their account identity.
     */

    const updates = {
      name,
      phone,
      gender,
      age,
      department,
      room,
      bed,
      updatedAt: serverTimestamp(),
    };

    /*
     * Email is stored in Firestore as profile information.
     *
     * This does NOT change Firebase Authentication email.
     * Authentication email changes should be handled separately.
     */

    if (email) {
      updates.email = email;
    }

    try {
      setSaving(true);
      setSaveError("");

      await updateDoc(
        doc(db, "users", devotee.uid),
        updates
      );

      setEditing(false);
    } catch (saveException) {
      console.error(
        "Failed to update devotee profile:",
        saveException
      );

      setSaveError(
        getSaveErrorMessage(saveException)
      );
    } finally {
      setSaving(false);
    }
  };

  if (
    isDevotee &&
    id &&
    id !== user?.uid
  ) {
    return (
      <div className="profile-access">
        <div className="profile-access-icon">!</div>

        <span className="profile-access-eyebrow">
          ACCESS RESTRICTED
        </span>

        <h2>Access Restricted</h2>

        <p>
          You can only view and manage your own profile.
        </p>

        <button
          type="button"
          onClick={() =>
            navigate("/devotee-profile", {
              replace: true,
            })
          }
        >
          Go to My Profile
        </button>
      </div>
    );
  }

  if (loading) {
    return <Loader text="Loading devotee profile..." />;
  }

  if (error) {
    return (
      <div className="profile-access">
        <div className="profile-access-icon">!</div>

        <span className="profile-access-eyebrow">
          PROFILE ERROR
        </span>

        <h2>Unable to Load Profile</h2>

        <p>{error}</p>

        <button
          type="button"
          onClick={handleBack}
        >
          {isAdministrator
            ? "Back to Devotees"
            : "Back to Dashboard"}
        </button>
      </div>
    );
  }

  if (!devotee) {
    return (
      <div className="profile-access">
        <div className="profile-access-icon">
          ?
        </div>

        <span className="profile-access-eyebrow">
          PROFILE NOT FOUND
        </span>

        <h2>Devotee Not Found</h2>

        <p>
          The requested devotee profile does not exist
          or is no longer available.
        </p>

        <button
          type="button"
          onClick={handleBack}
        >
          {isAdministrator
            ? "Back to Devotees"
            : "Back to Dashboard"}
        </button>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-topbar">
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
        >
          ← Back
        </button>

        <span className="profile-role">
          {isAdministrator
            ? "Administrator View"
            : "My Profile"}
        </span>
      </div>

      <section className="profile-hero">
        <div className="profile-avatar">
          {initials}
        </div>

        <div className="profile-main-info">
          <span className="profile-id">
            {isAdministrator
              ? `DEVOTEE · ${shortenUid(devotee.uid)}`
              : "MY DEVOTEE PROFILE"}
          </span>

          <h1>
            {devotee.name || "Unnamed Devotee"}
          </h1>

          <p>
            {devotee.department || "Giri Govardhan BACE"}
          </p>
        </div>

        <div className="profile-hero-actions">
          <span
            className={`large-status ${status.toLowerCase()}`}
          >
            <span />
            {status}
          </span>

          <button
            type="button"
            className="edit-profile-button"
            onClick={startEditing}
          >
            Edit Profile
          </button>
        </div>
      </section>

      {editing && (
        <form
          className="profile-edit-card"
          onSubmit={handleSave}
        >
          <div className="edit-card-header">
            <div>
              <span className="profile-section-eyebrow">
                PROFILE MANAGEMENT
              </span>

              <h2>Edit Profile</h2>

              <p>
                Update the devotee&apos;s profile information.
              </p>
            </div>
          </div>

          {saveError && (
            <div
              className="profile-form-error"
              role="alert"
            >
              <span>!</span>

              <p>{saveError}</p>
            </div>
          )}

          <div className="profile-edit-grid">
            <label className="profile-field full-width">
              <span>
                Full Name <b>*</b>
              </span>

              <input
                name="name"
                value={form.name}
                onChange={handleInput}
                disabled={saving}
                required
              />
            </label>

            <label className="profile-field">
              <span>Email</span>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleInput}
                disabled={saving}
              />

              <small>
                This changes the Firestore profile email,
                not Firebase Authentication credentials.
              </small>
            </label>

            <label className="profile-field">
              <span>Phone</span>

              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleInput}
                disabled={saving}
              />
            </label>

            <label className="profile-field">
              <span>Gender</span>

              <select
                name="gender"
                value={form.gender}
                onChange={handleInput}
                disabled={saving}
              >
                <option value="">
                  Not specified
                </option>

                <option value="Male">
                  Male
                </option>

                <option value="Female">
                  Female
                </option>

                <option value="Other">
                  Other
                </option>
              </select>
            </label>

            <label className="profile-field">
              <span>Age</span>

              <input
                type="number"
                name="age"
                value={form.age}
                onChange={handleInput}
                min="1"
                max="120"
                disabled={saving}
              />
            </label>

            <label className="profile-field">
              <span>Department</span>

              <input
                name="department"
                value={form.department}
                onChange={handleInput}
                disabled={saving}
              />
            </label>

            <label className="profile-field">
              <span>Room</span>

              <input
                name="room"
                value={form.room}
                onChange={handleInput}
                placeholder="Example: Room 206"
                disabled={saving}
              />
            </label>

            <label className="profile-field">
              <span>Bed</span>

              <input
                name="bed"
                value={form.bed}
                onChange={handleInput}
                placeholder="Example: Bed 2"
                disabled={saving}
              />
            </label>
          </div>

          <div className="profile-edit-footer">
            <button
              type="button"
              className="profile-cancel-button"
              onClick={cancelEditing}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="profile-save-button"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="profile-button-spinner" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      )}

      <div className="profile-grid">
        <section className="profile-card">
          <div className="profile-card-header">
            <div>
              <span className="profile-section-eyebrow">
                PERSONAL DETAILS
              </span>

              <h2>Personal Information</h2>
            </div>
          </div>

          <div className="info-grid">
            <ProfileInfo
              label="Full Name"
              value={devotee.name}
            />

            <ProfileInfo
              label="Email"
              value={devotee.email}
            />

            <ProfileInfo
              label="Phone"
              value={devotee.phone}
            />

            <ProfileInfo
              label="Gender"
              value={devotee.gender}
            />

            <ProfileInfo
              label="Age"
              value={devotee.age}
            />

            <ProfileInfo
              label="Joining Date"
              value={joinDate}
            />
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-header">
            <div>
              <span className="profile-section-eyebrow">
                BACE ASSIGNMENT
              </span>

              <h2>Residence</h2>
            </div>
          </div>

          <div className="info-grid">
            <ProfileInfo
              label="Room"
              value={devotee.room}
            />

            <ProfileInfo
              label="Bed"
              value={devotee.bed}
            />

            <ProfileInfo
              label="Department"
              value={devotee.department}
            />

            <ProfileInfo
              label="Current Seva"
              value={devotee.seva}
            />
          </div>
        </section>

        <section className="profile-card profile-wide">
          <div className="profile-card-header">
            <div>
              <span className="profile-section-eyebrow">
                SPIRITUAL PRACTICE
              </span>

              <h2>Spiritual Activity</h2>
            </div>
          </div>

          <div className="activity-stats">
            <ActivityStat
              value={rounds}
              label="Japa Rounds"
            />

            <ActivityStat
              value={reading}
              label="Reading Minutes"
            />

            <ActivityStat
              value={devotee.seva || "Not assigned"}
              label="Assigned Seva"
              textValue
            />
          </div>
        </section>

        <section className="profile-card profile-wide account-card">
          <div className="profile-card-header">
            <div>
              <span className="profile-section-eyebrow">
                ACCOUNT INFORMATION
              </span>

              <h2>Account Details</h2>
            </div>
          </div>

          <div className="account-information">
            <ProfileInfo
              label="Account Role"
              value="Devotee"
            />

            <ProfileInfo
              label="Account Status"
              value={status}
            />

            <ProfileInfo
              label="Firebase UID"
              value={devotee.uid}
              mono
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ProfileInfo({
  label,
  value,
  mono = false,
}) {
  const displayValue =
    value === undefined ||
    value === null ||
    value === ""
      ? "Not specified"
      : value;

  return (
    <div className="profile-info-item">
      <span>{label}</span>

      <strong className={mono ? "mono-value" : ""}>
        {displayValue}
      </strong>
    </div>
  );
}

function ActivityStat({
  value,
  label,
  textValue = false,
}) {
  return (
    <div className="activity-stat">
      <strong
        className={
          textValue ? "activity-text-value" : ""
        }
      >
        {value}
      </strong>

      <span>{label}</span>
    </div>
  );
}

function getStatus(devotee) {
  const value = String(
    devotee?.status || "active"
  )
    .trim()
    .toLowerCase();

  return value === "inactive"
    ? "Inactive"
    : "Active";
}

function getInitials(name) {
  const value = String(name || "").trim();

  if (!value) {
    return "D";
  }

  const parts = value.split(/\s+/);

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (
    parts[0].charAt(0) +
    parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

function formatDate(value) {
  if (!value) {
    return "Not specified";
  }

  if (
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }
      );
    }

    return value;
  }

  return "Not specified";
}

function shortenUid(uid) {
  if (!uid) {
    return "UNKNOWN";
  }

  if (uid.length <= 16) {
    return uid;
  }

  return `${uid.slice(0, 8)}...${uid.slice(-6)}`;
}

function getSaveErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "You do not have permission to update this profile.";
  }

  if (error?.code === "not-found") {
    return "This devotee profile no longer exists.";
  }

  if (error?.code === "unavailable") {
    return "Firebase is temporarily unavailable. Please try again.";
  }

  return (
    error?.message ||
    "Unable to save the profile. Please try again."
  );
}

export default DevoteeProfile;