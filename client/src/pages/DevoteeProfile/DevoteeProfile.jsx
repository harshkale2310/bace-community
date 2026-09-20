import { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import {
  collection,
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
   * Firebase UID is used internally only.
   */

  const requestedUid = isAdministrator
    ? id
    : user?.uid;

  const [devotee, setDevotee] = useState(null);

  /*
   * Room information is loaded separately.
   *
   * The rooms collection is the ONLY source of truth
   * for residence information.
   */
  const [rooms, setRooms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);

  const [error, setError] = useState("");
  const [roomError, setRoomError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  /*
   * IMPORTANT:
   *
   * There is intentionally NO room or bed field here.
   *
   * Residence comes from:
   * rooms/{roomId}.occupants
   */

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    gender: "",
    age: "",
    department: "Giri Govardhan BACE",
  });

  /*
   * ============================================================
   * LOAD DEVOTEE PROFILE
   * ============================================================
   */

  useEffect(() => {
    if (!requestedUid) {
      setLoading(false);
      setDevotee(null);
      return undefined;
    }

    setLoading(true);
    setError("");

    const userRef = doc(
      db,
      "users",
      requestedUid
    );

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
   * ============================================================
   * LOAD ROOMS
   *
   * IMPORTANT:
   *
   * Residence identity comes ONLY from the rooms collection.
   *
   * We do NOT use:
   * devotee.room
   * devotee.bed
   *
   * This prevents stale/duplicate residence information.
   * ============================================================
   */

  useEffect(() => {
    if (!requestedUid) {
      setRooms([]);
      setRoomsLoading(false);
      return undefined;
    }

    setRoomsLoading(true);
    setRoomError("");

    const roomsRef = collection(db, "rooms");

    const unsubscribe = onSnapshot(
      roomsRef,
      (snapshot) => {
        const roomRecords = snapshot.docs
          .map((roomDoc) => ({
            id: roomDoc.id,
            ...roomDoc.data(),
          }))
          .filter((room) => {
            const occupants = Array.isArray(
              room.occupants
            )
              ? room.occupants
              : [];

            return occupants.includes(requestedUid);
          })
          .sort((a, b) => {
            const floorA = Number(a.floor || 0);
            const floorB = Number(b.floor || 0);

            if (floorA !== floorB) {
              return floorA - floorB;
            }

            const numberA = String(
              a.roomNumber || ""
            );

            const numberB = String(
              b.roomNumber || ""
            );

            return numberA.localeCompare(
              numberB,
              undefined,
              {
                numeric: true,
                sensitivity: "base",
              }
            );
          });

        setRooms(roomRecords);
        setRoomsLoading(false);
      },
      (snapshotError) => {
        console.error(
          "Failed to load devotee room:",
          snapshotError
        );

        setRooms([]);
        setRoomsLoading(false);

        setRoomError(
          "Unable to load current residence information."
        );
      }
    );

    return () => unsubscribe();
  }, [requestedUid]);

  /*
   * ============================================================
   * SECURITY / NAVIGATION CHECK
   * ============================================================
   */

  useEffect(() => {
    if (
      !loading &&
      isDevotee &&
      id &&
      id !== user?.uid
    ) {
      navigate("/devotee-profile", {
        replace: true,
      });
    }
  }, [
    loading,
    isDevotee,
    id,
    user?.uid,
    navigate,
  ]);

  /*
   * ============================================================
   * ROOM IDENTITY
   * ============================================================
   */

  const currentRoom = useMemo(() => {
    if (!rooms.length) {
      return null;
    }

    return rooms[0];
  }, [rooms]);

  const roomIdentity = useMemo(() => {
    if (!currentRoom) {
      return null;
    }

    return getRoomIdentity(currentRoom);
  }, [currentRoom]);

  /*
   * ============================================================
   * SYNCHRONIZE FORM WITH FIRESTORE
   *
   * Residence is intentionally NOT included.
   * ============================================================
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
        devotee.department ||
        "Giri Govardhan BACE",
    });
  }, [devotee, editing]);

  /*
   * ============================================================
   * DERIVED VALUES
   * ============================================================
   */

  const status = getStatus(devotee);

  const initials = useMemo(
    () => getInitials(devotee?.name),
    [devotee?.name]
  );

  const joinDate = formatDate(
    devotee?.joinDate ||
      devotee?.createdAt
  );

  /*
   * ============================================================
   * NAVIGATION
   * ============================================================
   */

  const handleBack = () => {
    if (isAdministrator) {
      navigate("/devotees");
    } else {
      navigate("/dashboard");
    }
  };

  /*
   * ============================================================
   * FORM INPUT
   * ============================================================
   */

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

  /*
   * ============================================================
   * START EDITING
   * ============================================================
   */

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
        devotee.department ||
        "Giri Govardhan BACE",
    });

    setEditing(true);
  };

  /*
   * ============================================================
   * CANCEL EDITING
   * ============================================================
   */

  const cancelEditing = () => {
    if (saving) {
      return;
    }

    setEditing(false);
    setSaveError("");
  };

  /*
   * ============================================================
   * SAVE PROFILE
   *
   * IMPORTANT:
   *
   * This function NEVER writes:
   *
   * room
   * bed
   *
   * Residence assignment is controlled only by Rooms.jsx.
   * ============================================================
   */

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
      form.department.trim() ||
      "Giri Govardhan BACE";

    if (!name) {
      setSaveError(
        "Full name is required."
      );
      return;
    }

    if (
      email &&
      !/\S+@\S+\.\S+/.test(email)
    ) {
      setSaveError(
        "Please enter a valid email address."
      );
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
     * Residence fields are ALSO intentionally NOT included:
     *
     * room
     * bed
     *
     * Rooms.jsx owns residence assignment.
     */

    const updates = {
      name,
      phone,
      gender,
      age,
      department,
      updatedAt: serverTimestamp(),
    };

    /*
     * Email is stored in Firestore as profile information.
     *
     * This does NOT change Firebase Authentication email.
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

  /*
   * ============================================================
   * EXTRA SECURITY BEFORE RENDERING
   * ============================================================
   */

  if (
    isDevotee &&
    id &&
    id !== user?.uid
  ) {
    return (
      <div className="profile-access">
        <div className="profile-access-icon">
          !
        </div>

        <span className="profile-access-eyebrow">
          ACCESS RESTRICTED
        </span>

        <h2>Access Restricted</h2>

        <p>
          You can only view and manage your own
          profile.
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
    return (
      <Loader text="Loading devotee profile..." />
    );
  }

  if (error) {
    return (
      <div className="profile-access">
        <div className="profile-access-icon">
          !
        </div>

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
          The requested devotee profile does not
          exist or is no longer available.
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

  /*
   * ============================================================
   * PAGE
   * ============================================================
   */

  return (
    <div className="profile-page">
      {/* =====================================================
          TOP BAR
          ===================================================== */}

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

      {/* =====================================================
          PROFILE HERO
          ===================================================== */}

      <section className="profile-hero">
        <div className="profile-avatar">
          {initials}
        </div>

        <div className="profile-main-info">
          <span className="profile-id">
            {isAdministrator
              ? "DEVOTEE PROFILE"
              : "MY DEVOTEE PROFILE"}
          </span>

          <h1>
            {devotee.name ||
              "Unnamed Devotee"}
          </h1>

          <p>
            {devotee.department ||
              "Giri Govardhan BACE"}
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

      {/* =====================================================
          EDIT PROFILE
          ===================================================== */}

      {editing && (
        <form
          className="profile-edit-card"
          onSubmit={handleSave}
        >
          <div className="edit-card-header">
            <div>
              <span className="profile-section-eyebrow">
                PROFILE SERVICES
              </span>

              <h2>Edit Profile</h2>

              <p>
                Update the devotee&apos;s profile
                information.
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
                autoComplete="name"
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
                autoComplete="email"
              />

              <small>
                This changes the Firestore profile
                email, not Firebase Authentication
                credentials.
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
                autoComplete="tel"
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
                inputMode="numeric"
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

      {/* =====================================================
          PROFILE INFORMATION
          ===================================================== */}

      <div className="profile-grid">
        {/* Personal Information */}

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

        {/* Residence */}

        <section className="profile-card">
          <div className="profile-card-header">
            <div>
              <span className="profile-section-eyebrow">
                BACE ASSIGNMENT
              </span>

              <h2>Residence</h2>
            </div>
          </div>

          {roomError ? (
            <div className="profile-form-error">
              <span>!</span>
              <p>{roomError}</p>
            </div>
          ) : roomsLoading ? (
            <div className="profile-room-loading">
              Loading residence...
            </div>
          ) : currentRoom ? (
            <div className="profile-residence">
              <div className="profile-residence-icon">
                🏠
              </div>

              <div className="profile-residence-content">
                <span className="profile-residence-label">
                  CURRENT RESIDENCE
                </span>

                <strong>
                  {currentRoom.roomNumber
                    ? `Room ${currentRoom.roomNumber}`
                    : "Assigned Room"}
                </strong>

                <span>
                  {currentRoom.roomName ||
                    "Residence"}
                </span>

                {currentRoom.floor && (
                  <small>
                    Floor {currentRoom.floor}
                  </small>
                )}

                <p>
                  Residence information is managed
                  through the BACE room directory.
                </p>
              </div>
            </div>
          ) : (
            <div className="profile-residence profile-residence-empty">
              <div className="profile-residence-icon">
                —
              </div>

              <div className="profile-residence-content">
                <span className="profile-residence-label">
                  CURRENT RESIDENCE
                </span>

                <strong>
                  Not assigned
                </strong>

                <span>
                  No active room assignment
                </span>

                <p>
                  Room assignment is managed through
                  the BACE room directory.
                </p>
              </div>
            </div>
          )}

          <div className="info-grid">
            <ProfileInfo
              label="Department"
              value={devotee.department}
            />

            <ProfileInfo
              label="Current Seva"
              value={devotee.seva}
            />

            <ProfileInfo
              label="Room"
              value={roomIdentity}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/*
 * ============================================================
 * PROFILE INFO
 * ============================================================
 */

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

      <strong
        className={
          mono ? "mono-value" : ""
        }
      >
        {displayValue}
      </strong>
    </div>
  );
}

/*
 * ============================================================
 * ROOM IDENTITY
 *
 * Residence identity is derived ONLY from Rooms.
 * ============================================================
 */

function getRoomIdentity(room) {
  if (!room) {
    return null;
  }

  const roomNumber = String(
    room.roomNumber || ""
  ).trim();

  const roomName = String(
    room.roomName || ""
  ).trim();

  const floor = String(
    room.floor || ""
  ).trim();

  const parts = [];

  if (roomNumber) {
    parts.push(`Room ${roomNumber}`);
  }

  if (roomName) {
    parts.push(roomName);
  }

  if (floor) {
    parts.push(`Floor ${floor}`);
  }

  return parts.length
    ? parts.join(" · ")
    : "Assigned Room";
}

/*
 * ============================================================
 * STATUS
 * ============================================================
 */

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

/*
 * ============================================================
 * INITIALS
 * ============================================================
 */

function getInitials(name) {
  const value = String(name || "").trim();

  if (!value) {
    return "D";
  }

  const parts = value.split(/\s+/);

  if (parts.length === 1) {
    return parts[0]
      .charAt(0)
      .toUpperCase();
  }

  return (
    parts[0].charAt(0) +
    parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

/*
 * ============================================================
 * DATE
 * ============================================================
 */

function formatDate(value) {
  if (!value) {
    return "Not specified";
  }

  if (
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    return value
      .toDate()
      .toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
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

/*
 * ============================================================
 * SAVE ERROR
 * ============================================================
 */

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