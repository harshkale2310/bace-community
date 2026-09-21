import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  deleteUser,
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
  const [rooms, setRooms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [showRegisterModal, setShowRegisterModal] =
    useState(false);

  const [registerLoading, setRegisterLoading] =
    useState(false);

  const [registerError, setRegisterError] =
    useState("");

  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    department: "Temple",
  });

  /*
   * ============================================================
   * LOAD DEVOTEES
   * ============================================================
   */

  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
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
          .filter(
            (user) =>
              user.role === "devotee" &&
              String(user.status || "active")
                .trim()
                .toLowerCase() !== "deleted"
          )
          .sort((a, b) => {
            const nameA = String(a.name || "").toLowerCase();
            const nameB = String(b.name || "").toLowerCase();

            return nameA.localeCompare(nameB);
          });

        setDevotees(devoteeRecords);
        setLoading(false);
      },
      (snapshotError) => {
        console.error(
          "Failed to load devotees:",
          snapshotError
        );

        setError(
          "Unable to load devotees. Please check your Firebase connection and permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
   * ============================================================
   * LOAD ROOMS
   *
   * Rooms are the source of truth for residence assignment.
   * ============================================================
   */

  useEffect(() => {
    if (!isAdministrator) {
      setRooms([]);
      setRoomsLoading(false);
      return undefined;
    }

    setRoomsLoading(true);

    const roomsRef = collection(db, "rooms");

    const unsubscribe = onSnapshot(
      roomsRef,
      (snapshot) => {
        const roomRecords = snapshot.docs
          .map((roomDoc) => ({
            id: roomDoc.id,
            ...roomDoc.data(),
          }))
          .sort((a, b) => {
            const floorA = Number(a.floor || 0);
            const floorB = Number(b.floor || 0);

            if (floorA !== floorB) {
              return floorA - floorB;
            }

            const numberA = String(a.roomNumber || "");
            const numberB = String(b.roomNumber || "");

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
          "Failed to load rooms:",
          snapshotError
        );

        setRooms([]);
        setRoomsLoading(false);

        setError((previousError) => {
          if (previousError) {
            return previousError;
          }

          return "Unable to load room information. Please check your Firebase connection and permissions.";
        });
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
   * ============================================================
   * ROOM IDENTITY
   * ============================================================
   */

  const roomsByDevotee = useMemo(() => {
    const map = new Map();

    rooms.forEach((room) => {
      const occupants = Array.isArray(room.occupants)
        ? room.occupants
        : [];

      occupants.forEach((occupantId) => {
        if (!occupantId) {
          return;
        }

        if (!map.has(occupantId)) {
          map.set(occupantId, []);
        }

        map.get(occupantId).push(room);
      });
    });

    return map;
  }, [rooms]);

  const getDevoteeRooms = (devotee) => {
    if (!devotee?.uid) {
      return [];
    }

    return roomsByDevotee.get(devotee.uid) || [];
  };

  const getRoomIdentity = (room) => {
    if (!room) {
      return "Not assigned";
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

    return parts.length > 0
      ? parts.join(" · ")
      : "Assigned room";
  };

  const getDevoteeRoomLabel = (devotee) => {
    const devoteeRooms = getDevoteeRooms(devotee);

    if (devoteeRooms.length === 0) {
      return "Not assigned";
    }

    return devoteeRooms
      .map((room) => getRoomIdentity(room))
      .join(" • ");
  };

  /*
   * ============================================================
   * FILTER OPTIONS
   * ============================================================
   */

  const departments = useMemo(() => {
    const values = devotees
      .map((devotee) =>
        String(devotee.department || "").trim()
      )
      .filter(Boolean);

    const uniqueDepartments = Array.from(
      new Set(values)
    ).sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: "base",
      })
    );

    return ["All", ...uniqueDepartments];
  }, [devotees]);

  const formDepartments = useMemo(() => {
    const values = devotees
      .map((devotee) =>
        String(devotee.department || "").trim()
      )
      .filter(Boolean);

    return Array.from(
      new Set(["Temple", ...values])
    ).sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: "base",
      })
    );
  }, [devotees]);

  /*
   * ============================================================
   * FILTER DEVOTEES
   * ============================================================
   */

  const filteredDevotees = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    const normalizedDepartmentFilter = String(
      departmentFilter || ""
    )
      .trim()
      .toLowerCase();

    return devotees.filter((devotee) => {
      const name = String(devotee.name || "")
        .trim()
        .toLowerCase();

      const email = String(devotee.email || "")
        .trim()
        .toLowerCase();

      const phone = String(devotee.phone || "")
        .trim()
        .toLowerCase();

      const department = String(
        devotee.department || ""
      )
        .trim()
        .toLowerCase();

      const roomLabel = getDevoteeRoomLabel(devotee)
        .trim()
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        name.includes(normalizedSearch) ||
        email.includes(normalizedSearch) ||
        phone.includes(normalizedSearch) ||
        department.includes(normalizedSearch) ||
        roomLabel.includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "All" ||
        getStatus(devotee) === statusFilter;

      const matchesDepartment =
        normalizedDepartmentFilter === "all" ||
        department === normalizedDepartmentFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesDepartment
      );
    });
  }, [
    devotees,
    roomsByDevotee,
    search,
    statusFilter,
    departmentFilter,
  ]);

  /*
   * ============================================================
   * SUMMARY
   * ============================================================
   */

  const activeCount = useMemo(
    () =>
      devotees.filter(
        (devotee) =>
          getStatus(devotee) === "Active"
      ).length,
    [devotees]
  );

  const inactiveCount = useMemo(
    () =>
      devotees.filter(
        (devotee) =>
          getStatus(devotee) === "Inactive"
      ).length,
    [devotees]
  );

  const assignedCount = useMemo(
    () =>
      devotees.filter(
        (devotee) =>
          getDevoteeRooms(devotee).length > 0
      ).length,
    [devotees, roomsByDevotee]
  );

  const unassignedCount =
    devotees.length - assignedCount;

  /*
   * ============================================================
   * FORM
   * ============================================================
   */

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

  /*
   * ============================================================
   * REGISTER DEVOTEE
   *
   * Uses secondaryAuth so administrator stays logged in.
   * ============================================================
   */

  const handleRegisterDevotee = async (event) => {
    event.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!name) {
      setRegisterError(
        "Please enter the devotee's full name."
      );
      return;
    }

    if (
      !email ||
      !/^\S+@\S+\.\S+$/.test(email)
    ) {
      setRegisterError(
        "Please enter a valid email address."
      );
      return;
    }

    if (form.password.length < 6) {
      setRegisterError(
        "Password must contain at least 6 characters."
      );
      return;
    }

    if (
      form.password !==
      form.confirmPassword
    ) {
      setRegisterError(
        "Passwords do not match."
      );
      return;
    }

    let createdFirebaseUser = null;

    try {
      setRegisterLoading(true);
      setRegisterError("");
      setError("");

      /*
       * Create the devotee in SECONDARY Firebase Auth.
       * Administrator remains logged in.
       */

      const credential =
        await createUserWithEmailAndPassword(
          secondaryAuth,
          email,
          form.password
        );

      createdFirebaseUser = credential.user;

      /*
       * Create Firestore profile.
       */

      await setDoc(
        doc(
          db,
          "users",
          createdFirebaseUser.uid
        ),
        {
          uid: createdFirebaseUser.uid,
          name,
          email,
          phone,
          department:
            form.department || "Temple",

          /*
           * Legacy compatibility fields.
           * Residence assignment is controlled by rooms.
           */

          room: "",
          bed: "",
          seva: "",
          rounds: 0,
          reading: 0,

          role: "devotee",
          status: "active",
          photoURL: null,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      /*
       * Sign out only the secondary authentication instance.
       */

      await signOut(secondaryAuth);

      setShowRegisterModal(false);
      resetRegisterForm();
    } catch (registrationError) {
      console.error(
        "Failed to register devotee:",
        registrationError
      );

      /*
       * If Firestore creation failed after Auth
       * account creation, remove the new Auth account.
       */

      if (createdFirebaseUser) {
        try {
          await deleteUser(
            createdFirebaseUser
          );
        } catch (cleanupError) {
          console.error(
            "Failed to clean up newly-created Firebase account:",
            cleanupError
          );

          try {
            await signOut(secondaryAuth);
          } catch (signOutError) {
            console.error(
              "Failed to clear secondary auth:",
              signOutError
            );
          }
        }
      }

      setRegisterError(
        getRegistrationErrorMessage(
          registrationError
        )
      );
    } finally {
      setRegisterLoading(false);
    }
  };

  /*
   * ============================================================
   * STATUS
   *
   * Active -> Inactive:
   * - profile remains
   * - history remains
   * - room assignment is removed
   *
   * Inactive -> Active:
   * - profile becomes active
   * - no old room is automatically restored
   * ============================================================
   */

  const handleToggleStatus = async (devotee) => {
    if (
      !devotee?.uid ||
      updatingId ||
      deletingId
    ) {
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

      /*
       * Update profile status first.
       */

      await updateDoc(
        doc(db, "users", devotee.uid),
        {
          status:
            nextStatus.toLowerCase(),
          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * When deactivated, immediately remove the
       * devotee from every room.
       *
       * Their historical Sadhana, Seva, Attendance
       * and Leave data are intentionally preserved.
       */

      if (nextStatus === "Inactive") {
        await removeDevoteeFromRooms(
          devotee.uid
        );
      }
    } catch (updateError) {
      console.error(
        "Failed to update devotee status:",
        updateError
      );

      setError(
        getStatusErrorMessage(updateError)
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /*
   * ============================================================
   * DELETE DEVOTEE
   *
   * Permanent application-data deletion:
   *
   * 1. Sadhana
   * 2. Seva
   * 3. Attendance
   * 4. Leave
   * 5. Leave Requests
   * 6. Room assignment
   * 7. users/{uid}
   *
   * Firebase Authentication account remains because
   * another user's Auth account cannot safely be deleted
   * from the normal client-side administrator page.
   * ============================================================
   */

  const handleDeleteDevotee = async (devotee) => {
    if (
      !devotee?.uid ||
      updatingId ||
      deletingId
    ) {
      return;
    }

    const devoteeName =
      devotee.name || "this devotee";

    const confirmed = window.confirm(
      `Delete ${devoteeName} permanently?\n\n` +
        "This will remove the devotee's BACE profile, " +
        "attendance, sadhana, seva, leave records, " +
        "and room assignment.\n\n" +
        "The Firebase Authentication login account will remain stored.\n\n" +
        "This action cannot be undone from this page."
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(devotee.uid);
      setError("");

      /*
       * Remove all application data.
       */

      await cleanupDevoteeData(
        devotee.uid
      );

      /*
       * Permanently remove Firestore profile.
       */

      await deleteDoc(
        doc(db, "users", devotee.uid)
      );

      /*
       * The users onSnapshot listener automatically
       * removes the devotee from the directory.
       */
    } catch (deleteError) {
      console.error(
        "Failed to delete devotee:",
        deleteError
      );

      setError(
        getDeleteErrorMessage(
          deleteError
        )
      );
    } finally {
      setDeletingId(null);
    }
  };

  /*
   * ============================================================
   * VIEW PROFILE
   * ============================================================
   */

  const handleView = (devotee) => {
    if (!devotee?.uid) {
      return;
    }

    navigate(
      `/devotees/${devotee.uid}`
    );
  };

  /*
   * ============================================================
   * ACCESS CONTROL
   * ============================================================
   */

  if (!isAdministrator) {
    return (
      <section className="access-denied">
        <div className="access-denied-icon">
          !
        </div>

        <span className="page-eyebrow">
          ACCESS RESTRICTED
        </span>

        <h2>
          Administrator Access Required
        </h2>

        <p>
          You do not have permission to manage
          the devotee directory.
        </p>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            navigate("/dashboard")
          }
        >
          Return to Dashboard
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <Loader text="Loading devotees..." />
    );
  }

  /*
   * ============================================================
   * PAGE
   * ============================================================
   */

  return (
    <div className="devotees-page">
      <header className="page-header">
        <div className="page-header-content">
          <span className="page-eyebrow">
            Community Services
          </span>

          <h1>Devotees</h1>

          <p>
            Manage devotees and their community
            information. Residence identity is linked
            to the live room directory.
          </p>
        </div>

        <div className="header-actions">
          <div className="directory-count">
            <strong>
              {devotees.length}
            </strong>

            <span>
              Total devotees
            </span>
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
        <div
          className="devotees-alert"
          role="alert"
        >
          <span className="devotees-alert-icon">
            !
          </span>

          <div>
            <strong>
              Something went wrong
            </strong>

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

            <strong>
              {devotees.length}
            </strong>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon active">
            ✓
          </span>

          <div>
            <span>Active</span>

            <strong>
              {activeCount}
            </strong>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon inactive">
            ○
          </span>

          <div>
            <span>Inactive</span>

            <strong>
              {inactiveCount}
            </strong>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon assigned">
            🏠
          </span>

          <div>
            <span>Room Assigned</span>

            <strong>
              {assignedCount}
            </strong>
          </div>
        </div>

        <div className="summary-card">
          <span className="summary-icon unassigned">
            —
          </span>

          <div>
            <span>Not Assigned</span>

            <strong>
              {unassignedCount}
            </strong>
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
              setSearch(
                event.target.value
              )
            }
            placeholder="Search by name, email, phone or room..."
            aria-label="Search devotees"
          />

          {search && (
            <button
              type="button"
              className="clear-search"
              onClick={() =>
                setSearch("")
              }
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
              setStatusFilter(
                event.target.value
              )
            }
          >
            <option value="All">
              All statuses
            </option>

            <option value="Active">
              Active
            </option>

            <option value="Inactive">
              Inactive
            </option>
          </select>
        </label>

        <label className="filter-control">
          <span>Department</span>

          <select
            value={departmentFilter}
            onChange={(event) =>
              setDepartmentFilter(
                event.target.value
              )
            }
          >
            {departments.map(
              (department) => (
                <option
                  key={department}
                  value={department}
                >
                  {department === "All"
                    ? "All departments"
                    : department}
                </option>
              )
            )}
          </select>
        </label>
      </section>

      <section className="devotee-table-card">
        <div className="table-header">
          <div>
            <span className="section-eyebrow">
              DEVOTEE DIRECTORY
            </span>

            <h2>
              Resident Directory
            </h2>

            <p>
              Showing{" "}
              {filteredDevotees.length}{" "}
              of{" "}
              {devotees.length}{" "}
              devotees
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
                  <th>
                    Residence Identity
                  </th>
                  <th>Seva</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredDevotees.map(
                  (devotee) => {
                    const status =
                      getStatus(devotee);

                    const isUpdating =
                      updatingId ===
                      devotee.uid;

                    const isDeleting =
                      deletingId ===
                      devotee.uid;

                    const devoteeRooms =
                      getDevoteeRooms(
                        devotee
                      );

                    const isBusy =
                      isUpdating ||
                      isDeleting;

                    return (
                      <tr
                        key={devotee.uid}
                      >
                        <td>
                          <div className="devotee-cell">
                            <div className="avatar">
                              {getInitials(
                                devotee.name
                              )}
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
                          {devoteeRooms.length >
                          0 ? (
                            <div className="room-identity-cell">
                              {devoteeRooms.map(
                                (room) => (
                                  <div
                                    className="room-identity"
                                    key={
                                      room.id
                                    }
                                  >
                                    <span className="room-identity-icon">
                                      🏠
                                    </span>

                                    <div>
                                      <strong>
                                        {room.roomNumber
                                          ? `Room ${room.roomNumber}`
                                          : "Assigned Room"}
                                      </strong>

                                      <span>
                                        {room.roomName ||
                                          "Residence"}
                                      </span>

                                      {room.floor && (
                                        <small>
                                          Floor{" "}
                                          {
                                            room.floor
                                          }
                                        </small>
                                      )}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            <div className="room-unassigned">
                              <span className="room-unassigned-icon">
                                —
                              </span>

                              <div>
                                <strong>
                                  Not assigned
                                </strong>

                                <span>
                                  No active room assignment
                                </span>
                              </div>
                            </div>
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
                                handleView(
                                  devotee
                                )
                              }
                              disabled={isBusy}
                            >
                              View
                            </button>

                            <button
                              type="button"
                              className="status-button"
                              disabled={isBusy}
                              onClick={() =>
                                handleToggleStatus(
                                  devotee
                                )
                              }
                            >
                              {isUpdating
                                ? "Updating..."
                                : status ===
                                    "Active"
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>

                            <button
                              type="button"
                              className="delete-button"
                              disabled={isBusy}
                              onClick={() =>
                                handleDeleteDevotee(
                                  devotee
                                )
                              }
                            >
                              {isDeleting
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-table">
            <div className="empty-table-icon">
              ⌕
            </div>

            <h3>
              No devotees found
            </h3>

            <p>
              {devotees.length === 0
                ? "No devotee accounts have been registered yet."
                : "Try changing your search or filters."}
            </p>

            {(search ||
              statusFilter !== "All" ||
              departmentFilter !==
                "All") && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("All");
                  setDepartmentFilter(
                    "All"
                  );
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
          <strong>
            Devotee account services
          </strong>

          <p>
            Administrators can register devotee
            accounts directly from this page. Room
            assignment is managed separately through
            the BACE room directory so residence
            information stays synchronized across
            the system.
          </p>
        </div>
      </section>

      {showRegisterModal && (
        <div
          className="devotee-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
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
                  Create a devotee account and
                  resident profile. Room assignment is
                  managed separately from the residence
                  directory.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeRegisterModal
                }
                disabled={
                  registerLoading
                }
                aria-label="Close registration"
              >
                ×
              </button>
            </div>

            {registerError && (
              <div
                className="modal-error"
                role="alert"
              >
                <span>!</span>

                <p>
                  {registerError}
                </p>
              </div>
            )}

            <form
              className="register-devotee-form"
              onSubmit={
                handleRegisterDevotee
              }
            >
              <div className="form-section">
                <div className="form-section-title">
                  Personal Information
                </div>

                <div className="modal-form-grid">
                  <label className="form-field full-width">
                    <span>
                      Full Name{" "}
                      <b>*</b>
                    </span>

                    <input
                      name="name"
                      value={form.name}
                      onChange={
                        handleFormInput
                      }
                      placeholder="Enter full name"
                      autoComplete="name"
                      disabled={
                        registerLoading
                      }
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
                      onChange={
                        handleFormInput
                      }
                      placeholder="devotee@example.com"
                      autoComplete="email"
                      disabled={
                        registerLoading
                      }
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Phone
                    </span>

                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={
                        handleFormInput
                      }
                      placeholder="Enter phone number"
                      autoComplete="tel"
                      disabled={
                        registerLoading
                      }
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
                      value={
                        form.password
                      }
                      onChange={
                        handleFormInput
                      }
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      disabled={
                        registerLoading
                      }
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Confirm Password{" "}
                      <b>*</b>
                    </span>

                    <input
                      type="password"
                      name="confirmPassword"
                      value={
                        form.confirmPassword
                      }
                      onChange={
                        handleFormInput
                      }
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      disabled={
                        registerLoading
                      }
                      required
                    />
                  </label>
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">
                  Community Assignment
                </div>

                <div className="modal-form-grid">
                  <label className="form-field">
                    <span>
                      Department
                    </span>

                    <select
                      name="department"
                      value={
                        form.department
                      }
                      onChange={
                        handleFormInput
                      }
                      disabled={
                        registerLoading
                      }
                    >
                      {formDepartments.map(
                        (department) => (
                          <option
                            key={
                              department
                            }
                            value={
                              department
                            }
                          >
                            {department}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <div className="assignment-information">
                    <span>
                      Residence
                    </span>

                    <strong>
                      Assign after registration
                    </strong>

                    <small>
                      Use Community Rooms to assign the
                      devotee to a room.
                    </small>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeRegisterModal
                  }
                  disabled={
                    registerLoading
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    registerLoading
                  }
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

/*
 * ============================================================
 * REMOVE DEVOTEE FROM ALL ROOMS
 * ============================================================
 *
 * Used when a devotee is deactivated.
 *
 * Their historical records remain untouched.
 * ============================================================
 */

async function removeDevoteeFromRooms(
  devoteeId
) {
  if (!devoteeId) {
    return;
  }

  const roomsQuery = query(
    collection(db, "rooms"),
    where(
      "occupants",
      "array-contains",
      devoteeId
    )
  );

  const roomsSnapshot =
    await getDocs(roomsQuery);

  if (roomsSnapshot.empty) {
    return;
  }

  let batch = writeBatch(db);
  let operationCount = 0;

  const commitBatchIfNeeded = async () => {
    if (operationCount === 0) {
      return;
    }

    await batch.commit();

    batch = writeBatch(db);
    operationCount = 0;
  };

  for (const roomDocument of roomsSnapshot.docs) {
    batch.update(
      roomDocument.ref,
      {
        occupants:
          arrayRemove(devoteeId),
        updatedAt:
          serverTimestamp(),
      }
    );

    operationCount += 1;

    if (operationCount >= 450) {
      await commitBatchIfNeeded();
    }
  }

  await commitBatchIfNeeded();
}

/*
 * ============================================================
 * DELETE APPLICATION DATA
 * ============================================================
 *
 * Looks for records using:
 *
 * - devoteeId
 * - userId
 * - uid
 *
 * Collections cleaned:
 *
 * - sadhana
 * - seva
 * - attendance
 * - leave
 * - leaveRequests
 *
 * Room assignments are removed separately.
 * ============================================================
 */

async function cleanupDevoteeData(
  devoteeId
) {
  if (!devoteeId) {
    throw new Error(
      "Invalid devotee account."
    );
  }

  /*
   * Include BOTH leave and leaveRequests.
   *
   * The current Leave page uses leaveRequests,
   * while older data/rules may still use leave.
   */

  const collectionsToClean = [
    "sadhana",
    "seva",
    "attendance",
    "leave",
    "leaveRequests",
  ];

  /*
   * Store document references in a Map.
   *
   * If an old record contains more than one
   * ownership field, it is deleted only once.
   */

  const recordsToDelete = new Map();

  for (const collectionName of collectionsToClean) {
    const collectionRef =
      collection(
        db,
        collectionName
      );

    /*
     * Current application ownership field.
     */

    const devoteeIdQuery = query(
      collectionRef,
      where(
        "devoteeId",
        "==",
        devoteeId
      )
    );

    const devoteeIdSnapshot =
      await getDocs(
        devoteeIdQuery
      );

    devoteeIdSnapshot.docs.forEach(
      (record) => {
        recordsToDelete.set(
          `${collectionName}/${record.id}`,
          record.ref
        );
      }
    );

    /*
     * Compatibility with older records.
     */

    const userIdQuery = query(
      collectionRef,
      where(
        "userId",
        "==",
        devoteeId
      )
    );

    const userIdSnapshot =
      await getDocs(
        userIdQuery
      );

    userIdSnapshot.docs.forEach(
      (record) => {
        recordsToDelete.set(
          `${collectionName}/${record.id}`,
          record.ref
        );
      }
    );

    /*
     * Compatibility with records that used uid.
     */

    const uidQuery = query(
      collectionRef,
      where(
        "uid",
        "==",
        devoteeId
      )
    );

    const uidSnapshot =
      await getDocs(uidQuery);

    uidSnapshot.docs.forEach(
      (record) => {
        recordsToDelete.set(
          `${collectionName}/${record.id}`,
          record.ref
        );
      }
    );
  }

  /*
   * ==========================================================
   * FIND ROOMS
   * ==========================================================
   */

  const roomsQuery = query(
    collection(db, "rooms"),
    where(
      "occupants",
      "array-contains",
      devoteeId
    )
  );

  const roomsSnapshot =
    await getDocs(roomsQuery);

  /*
   * ==========================================================
   * FIRESTORE BATCH CLEANUP
   * ==========================================================
   *
   * Firestore supports up to 500 writes per batch.
   * 450 is used as a safety margin.
   */

  let batch = writeBatch(db);
  let operationCount = 0;

  const commitBatchIfNeeded = async () => {
    if (operationCount === 0) {
      return;
    }

    await batch.commit();

    batch = writeBatch(db);
    operationCount = 0;
  };

  /*
   * Delete application records.
   */

  for (const recordRef of recordsToDelete.values()) {
    batch.delete(recordRef);

    operationCount += 1;

    if (operationCount >= 450) {
      await commitBatchIfNeeded();
    }
  }

  /*
   * Remove devotee from rooms.
   */

  for (const roomDocument of roomsSnapshot.docs) {
    batch.update(
      roomDocument.ref,
      {
        occupants:
          arrayRemove(devoteeId),
        updatedAt:
          serverTimestamp(),
      }
    );

    operationCount += 1;

    if (operationCount >= 450) {
      await commitBatchIfNeeded();
    }
  }

  /*
   * Commit remaining operations.
   */

  await commitBatchIfNeeded();
}

/*
 * ============================================================
 * HELPERS
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

function getInitials(name) {
  const value = String(
    name || ""
  ).trim();

  if (!value) {
    return "D";
  }

  const parts = value.split(
    /\s+/
  );

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

function getRegistrationErrorMessage(
  error
) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Use a different email or manage the existing Firebase account.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/weak-password":
      return "The password is too weak. Use at least 6 characters.";

    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";

    case "permission-denied":
    case "firestore/permission-denied":
      return "You do not have permission to create this devotee profile. Check your Firestore rules.";

    default:
      return (
        error?.message ||
        "Unable to create the devotee account. Please try again."
      );
  }
}

function getStatusErrorMessage(error) {
  if (
    error?.code ===
      "permission-denied" ||
    error?.code ===
      "firestore/permission-denied" ||
    error?.code ===
      "PERMISSION_DENIED"
  ) {
    return "You do not have permission to update this devotee.";
  }

  return (
    error?.message ||
    "Unable to update the devotee status. Please try again."
  );
}

function getDeleteErrorMessage(error) {
  if (
    error?.code ===
      "permission-denied" ||
    error?.code ===
      "firestore/permission-denied" ||
    error?.code ===
      "PERMISSION_DENIED"
  ) {
    return "Delete failed because Firestore denied access to one of the devotee records. Make sure the administrator has delete access to users, attendance, sadhana, seva, leave, leaveRequests, and room records.";
  }

  if (
    error?.code ===
    "failed-precondition"
  ) {
    return "The devotee could not be removed because Firebase reported a required index or database condition.";
  }

  if (
    error?.code ===
    "not-found"
  ) {
    return "The devotee profile was already removed from Firestore.";
  }

  return (
    error?.message ||
    "Unable to remove the devotee. Please try again."
  );
}

export default Devotees;