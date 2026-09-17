import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { db, secondaryAuth } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";
import "./Devotees.css";

function Devotees() {
  const { isAdministrator } = useAuth();
  const navigate = useNavigate();

  const [devotees, setDevotees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState("");

  const [updatingId, setUpdatingId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    department: "Temple",
    room: "",
    bed: "",
  });

  /*
   * Load devotees in real time.
   */
  useEffect(() => {
    if (!isAdministrator) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const devoteeRecords = snapshot.docs
          .map((userDoc) => ({
            uid: userDoc.id,
            ...userDoc.data(),
          }))
          .filter((user) => user.role === "devotee")
          .sort((a, b) => {
            const nameA = String(a.name || "").toLowerCase();
            const nameB = String(b.name || "").toLowerCase();

            return nameA.localeCompare(nameB);
          });

        setDevotees(devoteeRecords);
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Failed to load devotees:", snapshotError);

        setError(
          "Unable to load devotees. Please check your Firebase connection and permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  const departments = useMemo(() => {
    const values = devotees
      .map((devotee) => devotee.department)
      .filter(Boolean);

    return ["All", ...Array.from(new Set(values)).sort()];
  }, [devotees]);

  const formDepartments = useMemo(() => {
    const values = devotees
      .map((devotee) => devotee.department)
      .filter(Boolean);

    return Array.from(new Set(["Temple", ...values])).sort();
  }, [devotees]);

  const filteredDevotees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return devotees.filter((devotee) => {
      const name = String(devotee.name || "").toLowerCase();
      const email = String(devotee.email || "").toLowerCase();
      const uid = String(devotee.uid || "").toLowerCase();
      const phone = String(devotee.phone || "").toLowerCase();
      const department = String(devotee.department || "");

      const matchesSearch =
        !normalizedSearch ||
        name.includes(normalizedSearch) ||
        email.includes(normalizedSearch) ||
        uid.includes(normalizedSearch) ||
        phone.includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "All" ||
        getStatus(devotee) === statusFilter;

      const matchesDepartment =
        departmentFilter === "All" ||
        department === departmentFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesDepartment
      );
    });
  }, [
    devotees,
    search,
    statusFilter,
    departmentFilter,
  ]);

  const activeCount = useMemo(
    () =>
      devotees.filter(
        (devotee) => getStatus(devotee) === "Active"
      ).length,
    [devotees]
  );

  const inactiveCount = useMemo(
    () =>
      devotees.filter(
        (devotee) => getStatus(devotee) === "Inactive"
      ).length,
    [devotees]
  );

  const handleFormInput = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (registerError) {
      setRegisterError("");
    }
  };

  const resetRegisterForm = () => {
    setForm({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      department: "Temple",
      room: "",
      bed: "",
    });

    setRegisterError("");
  };

  const openRegisterModal = () => {
    resetRegisterForm();
    setShowRegisterModal(true);
  };

  const closeRegisterModal = () => {
    if (registerLoading) {
      return;
    }

    setShowRegisterModal(false);
    resetRegisterForm();
  };

  const handleRegisterDevotee = async (event) => {
    event.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const room = form.room.trim();
    const bed = form.bed.trim();

    if (!name) {
      setRegisterError("Please enter the devotee's full name.");
      return;
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setRegisterError("Please enter a valid email address.");
      return;
    }

    if (form.password.length < 6) {
      setRegisterError(
        "Password must contain at least 6 characters."
      );
      return;
    }

    if (form.password !== form.confirmPassword) {
      setRegisterError("Passwords do not match.");
      return;
    }

    try {
      setRegisterLoading(true);
      setRegisterError("");
      setError("");

      /*
       * Create the Firebase Authentication account using
       * the secondary Auth instance.
       *
       * This keeps the administrator signed in.
       */
      const credential =
        await createUserWithEmailAndPassword(
          secondaryAuth,
          email,
          form.password
        );

      const firebaseUser = credential.user;

      /*
       * Create the corresponding Firestore profile.
       *
       * The primary Firestore instance remains authenticated
       * as the administrator.
       */
      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        name,
        email,
        phone,
        department: form.department || "Temple",
        room: room || "",
        bed: bed || "",
        seva: "",
        rounds: 0,
        reading: 0,
        role: "devotee",
        status: "active",
        photoURL: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      /*
       * Sign out the temporary secondary account.
       */
      await signOut(secondaryAuth);

      setShowRegisterModal(false);
      resetRegisterForm();
    } catch (registrationError) {
      console.error(
        "Failed to register devotee:",
        registrationError
      );

      setRegisterError(
        getRegistrationErrorMessage(registrationError)
      );

      /*
       * Make sure the temporary secondary session is cleared
       * even when Firestore creation fails.
       */
      try {
        await signOut(secondaryAuth);
      } catch (signOutError) {
        console.error(
          "Failed to clear secondary auth:",
          signOutError
        );
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleToggleStatus = async (devotee) => {
    if (!devotee?.uid || updatingId) {
      return;
    }

    const currentStatus = getStatus(devotee);

    const nextStatus =
      currentStatus === "Active"
        ? "Inactive"
        : "Active";

    try {
      setUpdatingId(devotee.uid);
      setError("");

      await updateDoc(doc(db, "users", devotee.uid), {
        status: nextStatus.toLowerCase(),
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error(
        "Failed to update devotee status:",
        updateError
      );

      setError(
        "Unable to update the devotee status. Please try again."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleView = (devotee) => {
    if (!devotee?.uid) {
      return;
    }

    navigate(`/devotees/${devotee.uid}`);
  };

  if (!isAdministrator) {
    return (
      <section className="access-denied">
        <div className="access-denied-icon">!</div>

        <span className="page-eyebrow">
          ACCESS RESTRICTED
        </span>

        <h2>Administrator Access Required</h2>

        <p>
          You do not have permission to manage the devotee
          directory.
        </p>

        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("/dashboard")}
        >
          Return to Dashboard
        </button>
      </section>
    );
  }

  if (loading) {
    return <Loader text="Loading devotees..." />;
  }

  return (
    <div className="devotees-page">
      <header className="page-header">
        <div className="page-header-content">
          <span className="page-eyebrow">
            Community Management
          </span>

          <h1>Devotees</h1>

          <p>
            Manage temple residents and their information.
          </p>
        </div>

        <div className="header-actions">
          <div className="directory-count">
            <strong>{devotees.length}</strong>
            <span>Total devotees</span>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={openRegisterModal}
          >
            + Register Devotee
          </button>
        </div>
      </header>

      {error && (
        <div className="devotees-alert" role="alert">
          <span className="devotees-alert-icon">!</span>

          <div>
            <strong>Something went wrong</strong>
            <p>{error}</p>
          </div>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Close error"
          >
            ×
          </button>
        </div>
      )}

      <section className="directory-summary">
        <div className="summary-card">
          <span className="summary-icon total">
            ♙
          </span>

          <div>
            <span>Total Devotees</span>
            <strong>{devotees.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon active">
            ✓
          </span>

          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon inactive">
            ○
          </span>

          <div>
            <span>Inactive</span>
            <strong>{inactiveCount}</strong>
          </div>
        </div>
      </section>

      <section className="filter-card">
        <div className="search-box">
          <span className="search-icon">
            ⌕
          </span>

          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search by name, email, phone or UID..."
            aria-label="Search devotees"
          />

          {search && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <label className="filter-control">
          <span>Status</span>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>

        <label className="filter-control">
          <span>Department</span>

          <select
            value={departmentFilter}
            onChange={(event) =>
              setDepartmentFilter(event.target.value)
            }
          >
            {departments.map((department) => (
              <option
                key={department}
                value={department}
              >
                {department === "All"
                  ? "All departments"
                  : department}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="devotee-table-card">
        <div className="table-header">
          <div>
            <span className="section-eyebrow">
              TEMPLE DIRECTORY
            </span>

            <h2>Resident Directory</h2>

            <p>
              Showing {filteredDevotees.length} of{" "}
              {devotees.length} devotees
            </p>
          </div>

          <div className="live-indicator">
            <span />
            Live
          </div>
        </div>

        {filteredDevotees.length > 0 ? (
          <div className="table-wrapper">
            <table className="devotees-table">
              <thead>
                <tr>
                  <th>Devotee</th>
                  <th>Department</th>
                  <th>Room</th>
                  <th>Seva</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredDevotees.map((devotee) => {
                  const status = getStatus(devotee);
                  const isUpdating =
                    updatingId === devotee.uid;

                  return (
                    <tr key={devotee.uid}>
                      <td>
                        <div className="devotee-cell">
                          <div className="avatar">
                            {getInitials(devotee.name)}
                          </div>

                          <div className="devotee-information">
                            <strong>
                              {devotee.name ||
                                "Unnamed Devotee"}
                            </strong>

                            <span>
                              {devotee.email ||
                                "No email"}
                            </span>

                            <small>
                              UID: {devotee.uid}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="table-primary-text">
                          {devotee.department ||
                            "Temple"}
                        </span>
                      </td>

                      <td>
                        <span className="room-value">
                          {devotee.room ||
                            "Not assigned"}
                        </span>

                        {devotee.bed && (
                          <small className="table-secondary-text">
                            {devotee.bed}
                          </small>
                        )}
                      </td>

                      <td>
                        <span className="table-primary-text">
                          {devotee.seva ||
                            "Not assigned"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`status-badge ${status.toLowerCase()}`}
                        >
                          <span />
                          {status}
                        </span>
                      </td>

                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="view-button"
                            onClick={() =>
                              handleView(devotee)
                            }
                          >
                            View
                          </button>

                          <button
                            type="button"
                            className="status-button"
                            disabled={isUpdating}
                            onClick={() =>
                              handleToggleStatus(
                                devotee
                              )
                            }
                          >
                            {isUpdating
                              ? "Updating..."
                              : status === "Active"
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-table">
            <div className="empty-table-icon">
              ⌕
            </div>

            <h3>No devotees found</h3>

            <p>
              {devotees.length === 0
                ? "No devotee accounts have been registered yet."
                : "Try changing your search or filters."}
            </p>

            {(search ||
              statusFilter !== "All" ||
              departmentFilter !== "All") && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("All");
                  setDepartmentFilter("All");
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </section>

      <section className="directory-note">
        <div className="directory-note-icon">
          i
        </div>

        <div>
          <strong>Devotee account management</strong>

          <p>
            Administrators can register devotee accounts
            directly from this page. Each registration
            creates both a Firebase Authentication account
            and its corresponding devotee profile.
          </p>
        </div>
      </section>

      {showRegisterModal && (
        <div
          className="devotee-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRegisterModal();
            }
          }}
        >
          <div
            className="devotee-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-devotee-title"
          >
            <div className="modal-header">
              <div>
                <span className="section-eyebrow">
                  NEW ACCOUNT
                </span>

                <h2 id="register-devotee-title">
                  Register Devotee
                </h2>

                <p>
                  Create a temple devotee account and
                  resident profile.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeRegisterModal}
                disabled={registerLoading}
                aria-label="Close registration"
              >
                ×
              </button>
            </div>

            {registerError && (
              <div className="modal-error" role="alert">
                <span>!</span>
                <p>{registerError}</p>
              </div>
            )}

            <form
              className="register-devotee-form"
              onSubmit={handleRegisterDevotee}
            >
              <div className="form-section">
                <div className="form-section-title">
                  Personal Information
                </div>

                <div className="modal-form-grid">
                  <label className="form-field full-width">
                    <span>
                      Full Name <b>*</b>
                    </span>

                    <input
                      name="name"
                      value={form.name}
                      onChange={handleFormInput}
                      placeholder="Enter full name"
                      autoComplete="name"
                      disabled={registerLoading}
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Email <b>*</b>
                    </span>

                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleFormInput}
                      placeholder="devotee@example.com"
                      autoComplete="email"
                      disabled={registerLoading}
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>Phone</span>

                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleFormInput}
                      placeholder="Enter phone number"
                      autoComplete="tel"
                      disabled={registerLoading}
                    />
                  </label>
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">
                  Login Credentials
                </div>

                <div className="modal-form-grid">
                  <label className="form-field">
                    <span>
                      Password <b>*</b>
                    </span>

                    <input
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleFormInput}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      disabled={registerLoading}
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Confirm Password <b>*</b>
                    </span>

                    <input
                      type="password"
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleFormInput}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      disabled={registerLoading}
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">
                  Temple Assignment
                </div>

                <div className="modal-form-grid">
                  <label className="form-field">
                    <span>Department</span>

                    <select
                      name="department"
                      value={form.department}
                      onChange={handleFormInput}
                      disabled={registerLoading}
                    >
                      {formDepartments.map(
                        (department) => (
                          <option
                            key={department}
                            value={department}
                          >
                            {department}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Room</span>

                    <input
                      name="room"
                      value={form.room}
                      onChange={handleFormInput}
                      placeholder="Example: Room 206"
                      disabled={registerLoading}
                    />
                  </label>

                  <label className="form-field">
                    <span>Bed</span>

                    <input
                      name="bed"
                      value={form.bed}
                      onChange={handleFormInput}
                      placeholder="Example: Bed 2"
                      disabled={registerLoading}
                    />
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeRegisterModal}
                  disabled={registerLoading}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={registerLoading}
                >
                  {registerLoading ? (
                    <>
                      <span className="button-spinner" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Devotee Account"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatus(devotee) {
  const value = String(devotee?.status || "active")
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

function getRegistrationErrorMessage(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/weak-password":
      return "The password is too weak. Use at least 6 characters.";

    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";

    case "permission-denied":
      return "You do not have permission to create this devotee profile.";

    default:
      return (
        error?.message ||
        "Unable to create the devotee account. Please try again."
      );
  }
}

export default Devotees;