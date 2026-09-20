import { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from "firebase/firestore";

import { useAuth } from "../../context/AuthContext";
import { db } from "../../services/firebase";
import Loader from "../../components/Common/Loader";

import "./Seva.css";

const SEVA_DEPARTMENTS = [
  "Temple",
  "Kitchen",
  "Book Distribution",
  "Office",
  "Cleaning",
  "Deity Service",
  "Guest Service",
  "Garden",
  "Other",
];

const SEVA_STATUSES = [
  "Assigned",
  "Accepted",
  "In Progress",
  "Completed",
  "Cancelled",
];

function getToday() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ---------------------------------------------------------
   ROOM IDENTITY
--------------------------------------------------------- */

function getRoomIdentity(room) {
  if (!room) {
    return "Residence not assigned";
  }

  const floor = room.floor
    ? `Floor ${room.floor}`
    : "Floor not set";

  const roomNumber = room.roomNumber
    ? `Room ${room.roomNumber}`
    : "Room number not set";

  const roomName = room.roomName
    ? room.roomName
    : "Unnamed Room";

  return `${floor} · ${roomNumber} · ${roomName}`;
}

/* ---------------------------------------------------------
   SEVA
--------------------------------------------------------- */

function Seva() {
  const {
    user,
    isAdministrator,
    isDevotee,
  } = useAuth();

  const [assignments, setAssignments] = useState([]);
  const [devotees, setDevotees] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [devoteesLoading, setDevoteesLoading] =
    useState(false);
  const [roomsLoading, setRoomsLoading] =
    useState(false);

  const [error, setError] = useState("");

  const [showForm, setShowForm] =
    useState(false);

  const [selectedStatus, setSelectedStatus] =
    useState("All");

  const [selectedDate, setSelectedDate] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [form, setForm] = useState({
    devoteeId: "",
    title: "",
    department: "Temple",
    date: getToday(),
    time: "",
    notes: "",
  });

  /* ---------------------------------------------------------
     LOAD SEVA
  --------------------------------------------------------- */

  useEffect(() => {
    if (!user?.uid) {
      setAssignments([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    let sevaQuery;

    if (isAdministrator) {
      sevaQuery = query(
        collection(db, "seva"),
        orderBy("createdAt", "desc")
      );
    } else {
      sevaQuery = query(
        collection(db, "seva"),
        where(
          "devoteeId",
          "==",
          user.uid
        )
      );
    }

    const unsubscribe = onSnapshot(
      sevaQuery,
      (snapshot) => {
        const records = snapshot.docs.map(
          (document) => ({
            id: document.id,
            ...document.data(),
          })
        );

        if (isDevotee) {
          records.sort((a, b) => {
            const dateA =
              `${a.date || ""} ${a.time || ""}`;

            const dateB =
              `${b.date || ""} ${b.time || ""}`;

            return dateB.localeCompare(dateA);
          });
        }

        setAssignments(records);
        setLoading(false);
      },
      (snapshotError) => {
        console.error(
          "Failed to load seva:",
          snapshotError
        );

        setError(
          "Unable to load seva records. Please check your Firebase permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [
    user?.uid,
    isAdministrator,
    isDevotee,
  ]);

  /* ---------------------------------------------------------
     LOAD ACTIVE DEVOTEES

     IMPORTANT:
     Only currently existing + active devotee
     accounts are included.

     Therefore:
     - deleted devotee -> not included
     - inactive devotee -> not included
     - active devotee -> included
  --------------------------------------------------------- */

  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
      return undefined;
    }

    setDevoteesLoading(true);

    const devoteesQuery = query(
      collection(db, "users"),
      where("role", "==", "devotee")
    );

    const unsubscribe = onSnapshot(
      devoteesQuery,
      (snapshot) => {
        const records = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...document.data(),
          }))
          .filter(
            (devotee) =>
              devotee.status === "active" ||
              !devotee.status
          )
          .sort((a, b) =>
            String(a.name || "").localeCompare(
              String(b.name || ""),
              undefined,
              {
                sensitivity: "base",
              }
            )
          );

        setDevotees(records);
        setDevoteesLoading(false);

        setForm((previous) => {
          const currentDevoteeStillExists =
            records.some(
              (devotee) =>
                devotee.id ===
                previous.devoteeId
            );

          if (
            currentDevoteeStillExists
          ) {
            return previous;
          }

          return {
            ...previous,
            devoteeId:
              records[0]?.id || "",
          };
        });
      },
      (snapshotError) => {
        console.error(
          "Failed to load devotees:",
          snapshotError
        );

        setDevotees([]);
        setDevoteesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /* ---------------------------------------------------------
     LOAD ROOMS

     Rooms remain the source of truth for residence
     information.
  --------------------------------------------------------- */

  useEffect(() => {
    if (!user?.uid) {
      setRooms([]);
      setRoomsLoading(false);
      return undefined;
    }

    setRoomsLoading(true);

    const roomsQuery = query(
      collection(db, "rooms")
    );

    const unsubscribe = onSnapshot(
      roomsQuery,
      (snapshot) => {
        const records =
          snapshot.docs.map(
            (document) => ({
              id: document.id,
              ...document.data(),
            })
          );

        setRooms(records);
        setRoomsLoading(false);
      },
      (snapshotError) => {
        console.error(
          "Failed to load rooms:",
          snapshotError
        );

        setRooms([]);
        setRoomsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  /* ---------------------------------------------------------
     DEVOTEE LOOKUP
  --------------------------------------------------------- */

  const devoteeMap = useMemo(() => {
    const map = new Map();

    devotees.forEach((devotee) => {
      map.set(
        devotee.id,
        devotee
      );
    });

    return map;
  }, [devotees]);

  /* ---------------------------------------------------------
     ROOM LOOKUP

     Map:
     devotee UID -> rooms[]
  --------------------------------------------------------- */

  const roomMap = useMemo(() => {
    const map = new Map();

    rooms.forEach((room) => {
      const occupants =
        Array.isArray(room.occupants)
          ? room.occupants
          : [];

      occupants.forEach(
        (occupantId) => {
          if (!map.has(occupantId)) {
            map.set(
              occupantId,
              []
            );
          }

          map
            .get(occupantId)
            .push(room);
        }
      );
    });

    return map;
  }, [rooms]);

  const getDevoteeRooms = (
    devoteeId
  ) => {
    return (
      roomMap.get(devoteeId) || []
    );
  };

  /* ---------------------------------------------------------
     CURRENT VALID ASSIGNMENTS

     THIS IS THE IMPORTANT FIX.

     An old seva record may still exist in Firestore
     after its devotee account has been deleted.

     We DO NOT use the old stored devoteeName/email
     as proof that the devotee still exists.

     Admin:
       only show assignments whose devotee currently
       exists as an active devotee.

     Devotee:
       only show their own assignments.
  --------------------------------------------------------- */

  const validAssignments = useMemo(() => {
    if (isDevotee) {
      return assignments.filter(
        (assignment) =>
          assignment.devoteeId ===
          user?.uid
      );
    }

    if (isAdministrator) {
      return assignments.filter(
        (assignment) =>
          !!assignment.devoteeId &&
          devoteeMap.has(
            assignment.devoteeId
          )
      );
    }

    return [];
  }, [
    assignments,
    devoteeMap,
    isAdministrator,
    isDevotee,
    user?.uid,
  ]);

  /* ---------------------------------------------------------
     FILTERING
  --------------------------------------------------------- */

  const visibleAssignments =
    useMemo(() => {
      let result = [
        ...validAssignments,
      ];

      if (
        selectedStatus !==
        "All"
      ) {
        result =
          result.filter(
            (assignment) =>
              assignment.status ===
              selectedStatus
          );
      }

      if (selectedDate) {
        result =
          result.filter(
            (assignment) =>
              assignment.date ===
              selectedDate
          );
      }

      if (
        isAdministrator &&
        search.trim()
      ) {
        const searchValue =
          search
            .trim()
            .toLowerCase();

        result =
          result.filter(
            (assignment) => {
              const devotee =
                devoteeMap.get(
                  assignment.devoteeId
                );

              if (!devotee) {
                return false;
              }

              const devoteeRooms =
                getDevoteeRooms(
                  assignment.devoteeId
                );

              const roomSearchText =
                devoteeRooms
                  .map(
                    (room) =>
                      getRoomIdentity(
                        room
                      )
                  )
                  .join(" ")
                  .toLowerCase();

              return (
                String(
                  assignment.title ||
                    ""
                )
                  .toLowerCase()
                  .includes(
                    searchValue
                  ) ||
                String(
                  assignment.department ||
                    ""
                )
                  .toLowerCase()
                  .includes(
                    searchValue
                  ) ||
                String(
                  devotee.name ||
                    ""
                )
                  .toLowerCase()
                  .includes(
                    searchValue
                  ) ||
                String(
                  devotee.email ||
                    ""
                )
                  .toLowerCase()
                  .includes(
                    searchValue
                  ) ||
                roomSearchText.includes(
                  searchValue
                )
              );
            }
          );
      }

      return result;
    }, [
      validAssignments,
      selectedStatus,
      selectedDate,
      search,
      isAdministrator,
      devoteeMap,
      roomMap,
    ]);

  /* ---------------------------------------------------------
     SUMMARY
  --------------------------------------------------------- */

  const summary =
    useMemo(() => {
      return {
        total:
          validAssignments.length,

        assigned:
          validAssignments.filter(
            (item) =>
              item.status ===
              "Assigned"
          ).length,

        accepted:
          validAssignments.filter(
            (item) =>
              item.status ===
              "Accepted"
          ).length,

        inProgress:
          validAssignments.filter(
            (item) =>
              item.status ===
              "In Progress"
          ).length,

        completed:
          validAssignments.filter(
            (item) =>
              item.status ===
              "Completed"
          ).length,

        cancelled:
          validAssignments.filter(
            (item) =>
              item.status ===
              "Cancelled"
          ).length,
      };
    }, [
      validAssignments,
    ]);

  /* ---------------------------------------------------------
     FORM HANDLING
  --------------------------------------------------------- */

  const handleFormChange = (
    event
  ) => {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  };

  const resetForm = () => {
    setForm({
      devoteeId:
        devotees[0]?.id || "",
      title: "",
      department: "Temple",
      date: getToday(),
      time: "",
      notes: "",
    });
  };

  /* ---------------------------------------------------------
     CREATE SEVA
  --------------------------------------------------------- */

  const createSeva = async (
    event
  ) => {
    event.preventDefault();

    if (!isAdministrator) {
      return;
    }

    setError("");

    const title =
      form.title.trim();

    const time =
      form.time.trim();

    if (!form.devoteeId) {
      setError(
        "Please select a devotee."
      );
      return;
    }

    if (!title) {
      setError(
        "Please enter a seva title."
      );
      return;
    }

    if (!form.date) {
      setError(
        "Please select a seva date."
      );
      return;
    }

    if (!time) {
      setError(
        "Please enter the seva time."
      );
      return;
    }

    const selectedDevotee =
      devotees.find(
        (devotee) =>
          devotee.id ===
          form.devoteeId
      );

    if (!selectedDevotee) {
      setError(
        "Selected devotee is not available."
      );
      return;
    }

    try {
      await addDoc(
        collection(
          db,
          "seva"
        ),
        {
          devoteeId:
            selectedDevotee.id,

          devoteeName:
            selectedDevotee.name ||
            "",

          devoteeEmail:
            selectedDevotee.email ||
            "",

          title,
          department:
            form.department,
          date: form.date,
          time,

          notes:
            form.notes.trim(),

          status: "Assigned",

          createdBy:
            user.uid,

          createdByName:
            user.name ||
            user.email ||
            "",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      resetForm();
      setShowForm(false);
      setError("");
    } catch (createError) {
      console.error(
        "Failed to create seva:",
        createError
      );

      setError(
        "Unable to create seva assignment. Please check your Firebase permissions."
      );
    }
  };

  /* ---------------------------------------------------------
     STATUS UPDATE
  --------------------------------------------------------- */

  const updateStatus = async (
    assignment,
    nextStatus
  ) => {
    if (!user?.uid) {
      return;
    }

    /*
     * Additional safety:
     * Do not update an assignment for a deleted/
     * inactive devotee from the admin interface.
     */

    if (
      isAdministrator &&
      !devoteeMap.has(
        assignment.devoteeId
      )
    ) {
      setError(
        "This devotee account is no longer active."
      );
      return;
    }

    const currentStatus =
      assignment.status;

    if (isAdministrator) {
      if (
        !SEVA_STATUSES.includes(
          nextStatus
        )
      ) {
        return;
      }
    }

    if (isDevotee) {
      if (
        assignment.devoteeId !==
        user.uid
      ) {
        return;
      }

      const validDevoteeTransition =
        (currentStatus ===
          "Assigned" &&
          nextStatus ===
            "Accepted") ||
        (currentStatus ===
          "Accepted" &&
          nextStatus ===
            "In Progress") ||
        (currentStatus ===
          "In Progress" &&
          nextStatus ===
            "Completed");

      if (
        !validDevoteeTransition
      ) {
        return;
      }
    }

    try {
      await updateSevaDocument(
        assignment.id,
        {
          status:
            nextStatus,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            user.uid,

          updatedByName:
            user.name ||
            user.email ||
            "",
        }
      );
    } catch (statusError) {
      console.error(
        "Failed to update seva status:",
        statusError
      );

      setError(
        "Unable to update seva status. Please check your Firebase permissions."
      );
    }
  };

  /* ---------------------------------------------------------
     LOADING
  --------------------------------------------------------- */

  if (loading) {
    return (
      <Loader text="Loading seva records..." />
    );
  }

  /* ---------------------------------------------------------
     PAGE
  --------------------------------------------------------- */

  return (
    <div className="seva-page">

      {/* PAGE HEADER */}

      <header className="seva-page-header">
        <div>
          <span className="page-eyebrow">
            {isAdministrator
              ? "SERVICE ADMINISTRATION"
              : "MY SERVICE"}
          </span>

          <h1>
            {isAdministrator
              ? "Seva Administration"
              : "My Seva"}
          </h1>

          <p>
            {isAdministrator
              ? "Create, assign and monitor BACE service responsibilities."
              : "View and manage the service responsibilities assigned to you."}
          </p>
        </div>

        {isAdministrator && (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setError("");

              setShowForm(
                (previous) =>
                  !previous
              );
            }}
          >
            {showForm
              ? "Close Form"
              : "+ Assign Seva"}
          </button>
        )}
      </header>

      {/* ERROR */}

      {error && (
        <div
          className="seva-error"
          role="alert"
        >
          <span>!</span>

          <p>{error}</p>

          <button
            type="button"
            onClick={() =>
              setError("")
            }
            aria-label="Close error"
          >
            ×
          </button>
        </div>
      )}

      {/* ADMIN CREATE FORM */}

      {isAdministrator &&
        showForm && (
          <section className="seva-form-card">

            <div className="section-heading">
              <div>
                <span className="card-eyebrow">
                  ADMINISTRATOR
                </span>

                <h2>
                  Assign New Seva
                </h2>

                <p>
                  Assign a service responsibility to an active devotee.
                </p>
              </div>
            </div>

            <form
              onSubmit={
                createSeva
              }
            >
              <div className="seva-form-grid">

                <label>
                  Devotee

                  <select
                    name="devoteeId"
                    value={
                      form.devoteeId
                    }
                    onChange={
                      handleFormChange
                    }
                    disabled={
                      devoteesLoading
                    }
                  >
                    {devotees.length ===
                    0 ? (
                      <option value="">
                        No active devotees
                      </option>
                    ) : (
                      devotees.map(
                        (
                          devotee
                        ) => (
                          <option
                            key={
                              devotee.id
                            }
                            value={
                              devotee.id
                            }
                          >
                            {devotee.name ||
                              devotee.email}
                          </option>
                        )
                      )
                    )}
                  </select>
                </label>

                <label>
                  Seva Title

                  <input
                    type="text"
                    name="title"
                    value={
                      form.title
                    }
                    onChange={
                      handleFormChange
                    }
                    placeholder="Example: Kitchen Service"
                    maxLength={100}
                  />
                </label>

                <label>
                  Department

                  <select
                    name="department"
                    value={
                      form.department
                    }
                    onChange={
                      handleFormChange
                    }
                  >
                    {SEVA_DEPARTMENTS.map(
                      (
                        department
                      ) => (
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

                <label>
                  Date

                  <input
                    type="date"
                    name="date"
                    value={
                      form.date
                    }
                    onChange={
                      handleFormChange
                    }
                  />
                </label>

                <label>
                  Time

                  <input
                    type="text"
                    name="time"
                    value={
                      form.time
                    }
                    onChange={
                      handleFormChange
                    }
                    placeholder="08:00 AM - 10:00 AM"
                    maxLength={50}
                  />
                </label>

                <label className="seva-form-full">
                  Notes

                  <textarea
                    name="notes"
                    value={
                      form.notes
                    }
                    onChange={
                      handleFormChange
                    }
                    placeholder="Instructions or additional information..."
                    rows="4"
                    maxLength={500}
                  />
                </label>

              </div>

              <div className="form-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    resetForm();
                    setShowForm(
                      false
                    );
                    setError("");
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    devoteesLoading ||
                    devotees.length ===
                      0
                  }
                >
                  Create Assignment
                </button>

              </div>
            </form>
          </section>
        )}

      {/* ADMIN SUMMARY */}

      {isAdministrator && (
        <section className="seva-summary-grid">

          <SummaryCard
            label="Total"
            value={
              summary.total
            }
            type="total"
          />

          <SummaryCard
            label="Assigned"
            value={
              summary.assigned
            }
            type="assigned"
          />

          <SummaryCard
            label="Accepted"
            value={
              summary.accepted
            }
            type="accepted"
          />

          <SummaryCard
            label="In Progress"
            value={
              summary.inProgress
            }
            type="progress"
          />

          <SummaryCard
            label="Completed"
            value={
              summary.completed
            }
            type="completed"
          />

        </section>
      )}

      {/* DEVOTEE SUMMARY */}

      {isDevotee && (
        <section className="seva-summary-grid devotee-summary">

          <SummaryCard
            label="My Seva"
            value={
              summary.total
            }
            type="total"
          />

          <SummaryCard
            label="Assigned"
            value={
              summary.assigned
            }
            type="assigned"
          />

          <SummaryCard
            label="In Progress"
            value={
              summary.accepted +
              summary.inProgress
            }
            type="progress"
          />

          <SummaryCard
            label="Completed"
            value={
              summary.completed
            }
            type="completed"
          />

        </section>
      )}

      {/* FILTERS */}

      <section className="seva-filter-card">

        {isAdministrator && (
          <label className="seva-search-field">
            Search

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search devotee, seva or room..."
            />
          </label>
        )}

        <label>
          Status

          <select
            value={
              selectedStatus
            }
            onChange={(event) =>
              setSelectedStatus(
                event.target.value
              )
            }
          >
            <option value="All">
              All statuses
            </option>

            {SEVA_STATUSES.map(
              (status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Date

          <input
            type="date"
            value={
              selectedDate
            }
            onChange={(event) =>
              setSelectedDate(
                event.target.value
              )
            }
          />
        </label>

        {(selectedDate ||
          selectedStatus !==
            "All" ||
          search) && (
          <button
            type="button"
            className="clear-filter-button"
            onClick={() => {
              setSelectedDate("");
              setSelectedStatus(
                "All"
              );
              setSearch("");
            }}
          >
            Clear filters
          </button>
        )}

      </section>

      {/* DIRECTORY */}

      <section className="seva-directory-card">

        <div className="seva-directory-header">

          <div>
            <span className="card-eyebrow">
              {isAdministrator
                ? "BACE SERVICE DIRECTORY"
                : "MY ASSIGNMENTS"}
            </span>

            <h2>
              {isAdministrator
                ? "Seva Assignments"
                : "My Seva Assignments"}
            </h2>

            <p>
              {
                visibleAssignments.length
              }{" "}
              {visibleAssignments.length ===
              1
                ? "assignment"
                : "assignments"}{" "}
              shown
            </p>
          </div>

          <span className="live-indicator">
            <span></span>
            Live
          </span>

        </div>

        {visibleAssignments.length >
        0 ? (
          <div className="seva-list">

            {visibleAssignments.map(
              (assignment) => {
                /*
                 * Because validAssignments has
                 * already removed deleted/inactive
                 * devotees, this lookup is safe.
                 */

                const devotee =
                  devoteeMap.get(
                    assignment.devoteeId
                  );

                if (!devotee) {
                  return null;
                }

                const devoteeRooms =
                  getDevoteeRooms(
                    assignment.devoteeId
                  );

                return (
                  <SevaCard
                    key={
                      assignment.id
                    }
                    assignment={
                      assignment
                    }
                    devotee={
                      devotee
                    }
                    rooms={
                      devoteeRooms
                    }
                    isAdministrator={
                      isAdministrator
                    }
                    isDevotee={
                      isDevotee
                    }
                    roomsLoading={
                      roomsLoading
                    }
                    onStatusChange={
                      updateStatus
                    }
                  />
                );
              }
            )}

          </div>
        ) : (
          <div className="seva-empty">

            <div className="seva-empty-icon">
              ✦
            </div>

            <h3>
              {isDevotee
                ? "No seva assigned"
                : "No seva assignments found"}
            </h3>

            <p>
              {isDevotee
                ? "Your assigned service responsibilities will appear here."
                : "Try changing the filters or create a new assignment."}
            </p>

            {isAdministrator && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowForm(
                    true
                  )
                }
              >
                + Assign Seva
              </button>
            )}

          </div>
        )}

      </section>
    </div>
  );
}

/* ---------------------------------------------------------
   SUMMARY CARD
--------------------------------------------------------- */

function SummaryCard({
  label,
  value,
  type,
}) {
  return (
    <article className="seva-summary-card">

      <div
        className={`summary-icon ${type}`}
      >
        {type ===
        "completed"
          ? "✓"
          : type ===
              "assigned"
            ? "!"
            : type ===
                "progress"
              ? "→"
              : type ===
                  "accepted"
                ? "○"
                : "✦"}
      </div>

      <div>
        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>
      </div>

    </article>
  );
}

/* ---------------------------------------------------------
   SEVA CARD
--------------------------------------------------------- */

function SevaCard({
  assignment,
  devotee,
  rooms,
  isAdministrator,
  isDevotee,
  roomsLoading,
  onStatusChange,
}) {
  const statusClass =
    assignment.status
      ?.toLowerCase()
      .replace(
        /\s+/g,
        "-"
      );

  const canAccept =
    isDevotee &&
    assignment.status ===
      "Assigned";

  const canStart =
    isDevotee &&
    assignment.status ===
      "Accepted";

  const canComplete =
    isDevotee &&
    assignment.status ===
      "In Progress";

  return (
    <article className="seva-card">

      <div className="seva-card-main">

        <div className="seva-icon">
          🙏
        </div>

        <div className="seva-content">

          <div className="seva-title-row">

            <h3>
              {assignment.title}
            </h3>

            <span
              className={`seva-status ${statusClass}`}
            >
              <span></span>
              {
                assignment.status
              }
            </span>

          </div>

          <p className="seva-department">
            {
              assignment.department
            }
          </p>

          {isAdministrator && (
            <div className="assigned-person">

              <div className="mini-avatar">
                {(
                  devotee.name ||
                  "D"
                )
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div>

                <strong>
                  {
                    devotee.name ||
                    "Devotee"
                  }
                </strong>

                {devotee.email && (
                  <span>
                    {
                      devotee.email
                    }
                  </span>
                )}

              </div>

            </div>
          )}

          {/* RESIDENCE */}

          <div className="seva-residence">

            <span className="residence-icon">
              🏠
            </span>

            <div>

              <span className="residence-label">
                RESIDENCE
              </span>

              {roomsLoading ? (
                <strong>
                  Loading room...
                </strong>
              ) : rooms.length >
                0 ? (
                <div className="residence-list">

                  {rooms.map(
                    (room) => (
                      <strong
                        key={
                          room.id
                        }
                      >
                        {
                          getRoomIdentity(
                            room
                          )
                        }
                      </strong>
                    )
                  )}

                </div>
              ) : (
                <strong>
                  Residence not assigned
                </strong>
              )}

            </div>
          </div>

          {/* DATE/TIME */}

          <div className="seva-meta">

            <span>
              <b>📅</b>

              {assignment.date ||
                "Date not set"}
            </span>

            <span>
              <b>⏰</b>

              {assignment.time ||
                "Time not set"}
            </span>

          </div>

          {/* NOTES */}

          {assignment.notes && (
            <div className="seva-notes">

              <span>
                Instructions
              </span>

              <p>
                {
                  assignment.notes
                }
              </p>

            </div>
          )}

        </div>
      </div>

      {/* ACTIONS */}

      <div className="seva-card-actions">

        {/* DEVOTEE ACTIONS */}

        {isDevotee &&
          canAccept && (
            <button
              type="button"
              className="action-primary"
              onClick={() =>
                onStatusChange(
                  assignment,
                  "Accepted"
                )
              }
            >
              Accept Seva
            </button>
          )}

        {isDevotee &&
          canStart && (
            <button
              type="button"
              className="action-primary"
              onClick={() =>
                onStatusChange(
                  assignment,
                  "In Progress"
                )
              }
            >
              Start Seva
            </button>
          )}

        {isDevotee &&
          canComplete && (
            <button
              type="button"
              className="action-complete"
              onClick={() =>
                onStatusChange(
                  assignment,
                  "Completed"
                )
              }
            >
              ✓ Mark Complete
            </button>
          )}

        {isDevotee &&
          assignment.status ===
            "Completed" && (
            <span className="completed-label">
              ✓ Completed
            </span>
          )}

        {/* ADMIN ACTIONS */}

        {isAdministrator && (
          <div className="admin-status-actions">

            {assignment.status !==
              "Accepted" &&
              assignment.status !==
                "Completed" &&
              assignment.status !==
                "Cancelled" && (
                <button
                  type="button"
                  onClick={() =>
                    onStatusChange(
                      assignment,
                      "Accepted"
                    )
                  }
                >
                  Accepted
                </button>
              )}

            {assignment.status !==
              "In Progress" &&
              assignment.status !==
                "Completed" &&
              assignment.status !==
                "Cancelled" && (
                <button
                  type="button"
                  onClick={() =>
                    onStatusChange(
                      assignment,
                      "In Progress"
                    )
                  }
                >
                  In Progress
                </button>
              )}

            {assignment.status !==
              "Completed" &&
              assignment.status !==
                "Cancelled" && (
                <button
                  type="button"
                  className="admin-complete"
                  onClick={() =>
                    onStatusChange(
                      assignment,
                      "Completed"
                    )
                  }
                >
                  Complete
                </button>
              )}

            {assignment.status !==
              "Cancelled" &&
              assignment.status !==
                "Completed" && (
                <button
                  type="button"
                  className="admin-cancel"
                  onClick={() =>
                    onStatusChange(
                      assignment,
                      "Cancelled"
                    )
                  }
                >
                  Cancel
                </button>
              )}

          </div>
        )}

      </div>
    </article>
  );
}

/* ---------------------------------------------------------
   FIRESTORE UPDATE HELPER
--------------------------------------------------------- */

async function updateSevaDocument(
  documentId,
  data
) {
  const sevaRef = doc(
    db,
    "seva",
    documentId
  );

  await updateDoc(
    sevaRef,
    data
  );
}

export default Seva;