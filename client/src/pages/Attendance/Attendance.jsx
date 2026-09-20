import { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Attendance.css";

const ATTENDANCE_OPTIONS = [
  "Present",
  "Absent",
  "Leave",
  "Not Marked",
];

function getTodayDate() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(
    today.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    today.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateOverall(
  morning,
  evening
) {
  if (
    morning === "Not Marked" &&
    evening === "Not Marked"
  ) {
    return "Not Marked";
  }

  if (
    morning === "Leave" &&
    evening === "Leave"
  ) {
    return "Leave";
  }

  if (
    morning === "Absent" &&
    evening === "Absent"
  ) {
    return "Absent";
  }

  if (
    morning === "Present" &&
    evening === "Present"
  ) {
    return "Present";
  }

  return "Partial";
}

function getRoomIdentity(room) {
  if (!room) {
    return "Not assigned";
  }

  const floorNumber = Number(room.floor);

  const floorLabel = Number.isFinite(
    floorNumber
  )
    ? `Floor ${floorNumber}`
    : room.floor
      ? String(room.floor)
      : "Floor not assigned";

  const roomNumber =
    room.roomNumber ||
    room.number ||
    "Room not assigned";

  const roomName =
    room.roomName ||
    room.name ||
    "Unnamed Room";

  return `${floorLabel} · Room ${roomNumber} · ${roomName}`;
}

function buildRoomMap(rooms) {
  const map = {};

  rooms.forEach((room) => {
    const occupants = Array.isArray(
      room.occupants
    )
      ? room.occupants
      : [];

    occupants.forEach((occupantId) => {
      if (!occupantId) {
        return;
      }

      if (!map[occupantId]) {
        map[occupantId] = room;
      }
    });
  });

  return map;
}

function Attendance() {
  const {
    user,
    isAdministrator,
    isDevotee,
  } = useAuth();

  const [date, setDate] =
    useState(getTodayDate());

  const [devotees, setDevotees] =
    useState([]);

  const [attendanceRecords, setAttendanceRecords] =
    useState([]);

  const [rooms, setRooms] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [loading, setLoading] =
    useState(true);

  const [savingId, setSavingId] =
    useState(null);

  const [error, setError] =
    useState("");

  /*
   * ============================================================
   * LOAD DATA
   * ============================================================
   */

  useEffect(() => {
    loadAttendanceData();
  }, [
    date,
    user?.uid,
    isAdministrator,
    isDevotee,
  ]);

  const loadAttendanceData =
    async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        /*
         * --------------------------------------------------------
         * ADMINISTRATOR
         * --------------------------------------------------------
         *
         * IMPORTANT:
         * Only ACTIVE devotees are loaded.
         *
         * This means:
         *
         * status = active
         *      -> shown
         *
         * status = inactive
         *      -> hidden
         *
         * status = deleted
         *      -> hidden
         *
         * The attendance records themselves do not need
         * to be deleted for this page. We simply do not
         * show attendance for accounts that are no longer active.
         */
        if (isAdministrator) {
          const devoteesQuery =
            query(
              collection(db, "users"),
              where(
                "role",
                "==",
                "devotee"
              ),
              where(
                "status",
                "==",
                "active"
              )
            );

          const attendanceQuery =
            query(
              collection(
                db,
                "attendance"
              ),
              where(
                "date",
                "==",
                date
              )
            );

          const roomsQuery =
            collection(db, "rooms");

          const [
            devoteesSnapshot,
            attendanceSnapshot,
            roomsSnapshot,
          ] = await Promise.all([
            getDocs(devoteesQuery),
            getDocs(attendanceQuery),
            getDocs(roomsQuery),
          ]);

          /*
           * Extra client-side status protection.
           *
           * This makes sure that even if a stale/cached
           * result contains an inactive/deleted profile,
           * it will never enter the attendance table.
           */
          const devoteeList =
            devoteesSnapshot.docs
              .map((item) => ({
                uid: item.id,
                ...item.data(),
              }))
              .filter(
                (devotee) =>
                  devotee.role ===
                    "devotee" &&
                  devotee.status ===
                    "active"
              )
              .sort((a, b) =>
                (
                  a.name || ""
                ).localeCompare(
                  b.name || ""
                )
              );

          const attendanceList =
            attendanceSnapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          const roomList =
            roomsSnapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setDevotees(
            devoteeList
          );

          setAttendanceRecords(
            attendanceList
          );

          setRooms(roomList);
        }

        /*
         * --------------------------------------------------------
         * DEVOTEE
         * --------------------------------------------------------
         *
         * AuthContext already prevents inactive/deleted
         * users from entering the application.
         *
         * Therefore this query only runs for an active
         * authenticated devotee.
         */
        if (isDevotee) {
          const attendanceQuery =
            query(
              collection(
                db,
                "attendance"
              ),
              where(
                "devoteeId",
                "==",
                user.uid
              ),
              where(
                "date",
                "==",
                date
              )
            );

          const roomsQuery =
            query(
              collection(db, "rooms"),
              where(
                "occupants",
                "array-contains",
                user.uid
              )
            );

          const [
            attendanceSnapshot,
            roomsSnapshot,
          ] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(roomsQuery),
          ]);

          const attendanceList =
            attendanceSnapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          const roomList =
            roomsSnapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setAttendanceRecords(
            attendanceList
          );

          setRooms(roomList);
        }
      } catch (firebaseError) {
        console.error(
          "Attendance loading error:",
          firebaseError
        );

        setError(
          "Unable to load attendance records. Please check your Firebase connection and Firestore permissions."
        );
      } finally {
        setLoading(false);
      }
    };

  /*
   * ============================================================
   * ROOM LOOKUP
   * ============================================================
   */

  const roomMap = useMemo(
    () => buildRoomMap(rooms),
    [rooms]
  );

  const getDevoteeRoom = (
    devoteeId
  ) => {
    if (!devoteeId) {
      return null;
    }

    return (
      roomMap[devoteeId] || null
    );
  };

  /*
   * ============================================================
   * ADMIN ATTENDANCE DATA
   * ============================================================
   */

  const adminRecords = useMemo(() => {
    if (!isAdministrator) {
      return [];
    }

    return devotees
      /*
       * Extra protection:
       * Only active devotees can ever become
       * attendance rows.
       */
      .filter(
        (devotee) =>
          devotee.role ===
            "devotee" &&
          devotee.status ===
            "active"
      )
      .map((devotee) => {
        const record =
          attendanceRecords.find(
            (item) =>
              item.devoteeId ===
              devotee.uid
          );

        const room =
          getDevoteeRoom(
            devotee.uid
          );

        const roomIdentity =
          getRoomIdentity(room);

        return {
          id:
            record?.id ||
            `${devotee.uid}_${date}`,

          devoteeId:
            devotee.uid,

          name:
            devotee.name ||
            "Unnamed Devotee",

          email:
            devotee.email || "",

          department:
            devotee.department ||
            "Temple",

          room,

          roomIdentity,

          morning:
            record?.morning ||
            "Not Marked",

          evening:
            record?.evening ||
            "Not Marked",

          existingRecord:
            Boolean(record),
        };
      })
      .filter((record) => {
        const searchText =
          search
            .trim()
            .toLowerCase();

        const matchesSearch =
          !searchText ||
          record.name
            .toLowerCase()
            .includes(searchText) ||
          record.email
            .toLowerCase()
            .includes(searchText) ||
          record.roomIdentity
            .toLowerCase()
            .includes(searchText);

        const overall =
          calculateOverall(
            record.morning,
            record.evening
          );

        const matchesStatus =
          statusFilter ===
            "All" ||
          overall ===
            statusFilter ||
          record.morning ===
            statusFilter ||
          record.evening ===
            statusFilter;

        return (
          matchesSearch &&
          matchesStatus
        );
      });
  }, [
    devotees,
    attendanceRecords,
    date,
    search,
    statusFilter,
    isAdministrator,
    roomMap,
  ]);

  /*
   * ============================================================
   * DEVOTEE PERSONAL RECORD
   * ============================================================
   */

  const ownRecord = useMemo(() => {
    if (!isDevotee) {
      return null;
    }

    return (
      attendanceRecords.find(
        (record) =>
          record.devoteeId ===
          user?.uid
      ) || {
        morning:
          "Not Marked",

        evening:
          "Not Marked",
      }
    );
  }, [
    attendanceRecords,
    isDevotee,
    user?.uid,
  ]);

  /*
   * ============================================================
   * DEVOTEE CURRENT ROOM
   * ============================================================
   */

  const ownRoom = useMemo(() => {
    if (
      !isDevotee ||
      !user?.uid
    ) {
      return null;
    }

    return (
      roomMap[user.uid] ||
      null
    );
  }, [
    isDevotee,
    user?.uid,
    roomMap,
  ]);

  const ownRoomIdentity =
    getRoomIdentity(
      ownRoom
    );

  /*
   * ============================================================
   * ADMIN STATISTICS
   * ============================================================
   */

  const adminStats = useMemo(() => {
    const records =
      adminRecords;

    return {
      total: records.length,

      present:
        records.filter(
          (record) =>
            record.morning ===
              "Present" &&
            record.evening ===
              "Present"
        ).length,

      absent:
        records.filter(
          (record) =>
            record.morning ===
              "Absent" &&
            record.evening ===
              "Absent"
        ).length,

      leave:
        records.filter(
          (record) =>
            record.morning ===
              "Leave" &&
            record.evening ===
              "Leave"
        ).length,

      pending:
        records.filter(
          (record) =>
            record.morning ===
              "Not Marked" ||
            record.evening ===
              "Not Marked"
        ).length,
    };
  }, [adminRecords]);

  /*
   * ============================================================
   * ADMIN UPDATE ATTENDANCE
   * ============================================================
   */

  const updateAttendance = async (
    devoteeId,
    field,
    value
  ) => {
    if (
      !isAdministrator ||
      !devoteeId
    ) {
      return;
    }

    /*
     * Extra protection:
     * Never create/update attendance for an
     * inactive or deleted devotee.
     */
    const devotee =
      devotees.find(
        (item) =>
          item.uid ===
          devoteeId
      );

    if (
      !devotee ||
      devotee.status !==
        "active"
    ) {
      setError(
        "Attendance cannot be updated for an inactive or deleted devotee."
      );

      return;
    }

    const recordId =
      `${devoteeId}_${date}`;

    setSavingId(
      `${recordId}_${field}`
    );

    setError("");

    try {
      const attendanceRef =
        doc(
          db,
          "attendance",
          recordId
        );

      await setDoc(
        attendanceRef,
        {
          devoteeId,

          date,

          [field]: value,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            user.uid,
        },
        {
          merge: true,
        }
      );

      setAttendanceRecords(
        (previous) => {
          const existing =
            previous.find(
              (record) =>
                record.id ===
                recordId
            );

          if (existing) {
            return previous.map(
              (record) =>
                record.id ===
                recordId
                  ? {
                      ...record,
                      [field]:
                        value,
                    }
                  : record
            );
          }

          return [
            ...previous,
            {
              id: recordId,
              devoteeId,
              date,
              [field]: value,
            },
          ];
        }
      );
    } catch (firebaseError) {
      console.error(
        "Attendance update error:",
        firebaseError
      );

      setError(
        "Attendance could not be updated. Please try again."
      );
    } finally {
      setSavingId(null);
    }
  };

  /*
   * ============================================================
   * ROLE CHECK
   * ============================================================
   */

  if (
    !isAdministrator &&
    !isDevotee
  ) {
    return (
      <section className="attendance-access">
        <div className="attendance-access-icon">
          !
        </div>

        <h2>
          Attendance Access Unavailable
        </h2>

        <p>
          Your account role could not be
          verified. Please sign in again.
        </p>
      </section>
    );
  }

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading) {
    return (
      <Loader
        text={
          isAdministrator
            ? "Loading community attendance..."
            : "Loading your attendance..."
        }
      />
    );
  }

  /*
   * ============================================================
   * DEVOTEE VIEW
   * ============================================================
   */

  if (isDevotee) {
    const morning =
      ownRecord?.morning ||
      "Not Marked";

    const evening =
      ownRecord?.evening ||
      "Not Marked";

    const overall =
      calculateOverall(
        morning,
        evening
      );

    const markedCount = [
      morning,
      evening,
    ].filter(
      (status) =>
        status !==
        "Not Marked"
    ).length;

    return (
      <div className="attendance-page attendance-devotee-page">
        <header className="attendance-header">
          <div>
            <span className="page-eyebrow">
              MY RECORDS
            </span>

            <h1>
              My Attendance
            </h1>

            <p>
              View your personal attendance
              history and daily program status.
            </p>
          </div>

          <div className="attendance-date-box">
            <span>
              Selected Date
            </span>

            <strong>
              {formatDate(date)}
            </strong>
          </div>
        </header>

        {error && (
          <div className="attendance-error">
            <strong>
              Something went wrong
            </strong>

            <span>
              {error}
            </span>
          </div>
        )}

        <section className="attendance-personal-summary">
          <article className="personal-attendance-card">
            <span>
              Morning Program
            </span>

            <strong
              className={`summary-status ${getStatusClass(
                morning
              )}`}
            >
              {morning}
            </strong>
          </article>

          <article className="personal-attendance-card">
            <span>
              Evening Program
            </span>

            <strong
              className={`summary-status ${getStatusClass(
                evening
              )}`}
            >
              {evening}
            </strong>
          </article>

          <article className="personal-attendance-card featured">
            <span>
              Overall Attendance
            </span>

            <strong
              className={`summary-status ${getStatusClass(
                overall
              )}`}
            >
              {overall}
            </strong>
          </article>
        </section>

        <section className="attendance-personal-panel">
          <div className="personal-panel-header">
            <div>
              <span className="card-eyebrow">
                PERSONAL ATTENDANCE
              </span>

              <h2>
                Daily Record
              </h2>

              <p>
                Attendance recorded for{" "}
                {formatDate(date)}.
              </p>
            </div>

            <label className="personal-date-control">
              <span>
                Change Date
              </span>

              <input
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(
                    event.target.value
                  )
                }
              />
            </label>
          </div>

          <div className="personal-attendance-timeline">
            <AttendanceTimelineItem
              number="01"
              title="Morning Program"
              description="Morning community program attendance"
              status={morning}
            />

            <AttendanceTimelineItem
              number="02"
              title="Evening Program"
              description="Evening community program attendance"
              status={evening}
            />

            <AttendanceTimelineItem
              number="03"
              title="Daily Overall"
              description="Combined daily attendance status"
              status={overall}
              last
            />
          </div>

          <div className="personal-record-note">
            <span className="note-icon">
              i
            </span>

            <div>
              <strong>
                Attendance is managed by the
                BACE.
              </strong>

              <p>
                You can view your attendance
                records here, but only
                authorized administrators can
                update attendance.
              </p>
            </div>
          </div>
        </section>

        <section className="attendance-personal-footer">
          <div>
            <span>
              Programs Marked
            </span>

            <strong>
              {markedCount} / 2
            </strong>
          </div>

          <div>
            <span>
              Residence
            </span>

            <strong>
              {ownRoomIdentity}
            </strong>
          </div>

          <div>
            <span>
              Account
            </span>

            <strong>
              {user?.name ||
                "Devotee"}
            </strong>
          </div>
        </section>
      </div>
    );
  }

  /*
   * ============================================================
   * ADMINISTRATOR VIEW
   * ============================================================
   */

  return (
    <div className="attendance-page attendance-admin-page">
      <header className="attendance-header">
        <div>
          <span className="page-eyebrow">
            COMMUNITY MONITORING
          </span>

          <h1>
            Attendance
          </h1>

          <p>
            Monitor and manage community
            attendance across all residents.
          </p>
        </div>

        <div className="attendance-date-box">
          <span>
            Selected Date
          </span>

          <strong>
            {formatDate(date)}
          </strong>
        </div>
      </header>

      {error && (
        <div className="attendance-error">
          <strong>
            Something went wrong
          </strong>

          <span>
            {error}
          </span>

          <button
            onClick={
              loadAttendanceData
            }
          >
            Retry
          </button>
        </div>
      )}

      <section className="admin-attendance-stats">
        <AttendanceStat
          label="Total Devotees"
          value={adminStats.total}
          icon="♙"
          type="total"
        />

        <AttendanceStat
          label="Fully Present"
          value={adminStats.present}
          icon="✓"
          type="present"
        />

        <AttendanceStat
          label="Absent"
          value={adminStats.absent}
          icon="○"
          type="absent"
        />

        <AttendanceStat
          label="On Leave"
          value={adminStats.leave}
          icon="◷"
          type="leave"
        />

        <AttendanceStat
          label="Not Completed"
          value={adminStats.pending}
          icon="!"
          type="pending"
        />
      </section>

      <section className="attendance-admin-controls">
        <div className="attendance-control search-control">
          <label htmlFor="attendance-search">
            Search Devotee
          </label>

          <div className="attendance-search-box">
            <span>⌕</span>

            <input
              id="attendance-search"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Name, email or room..."
            />
          </div>
        </div>

        <div className="attendance-control">
          <label htmlFor="attendance-date">
            Date
          </label>

          <input
            id="attendance-date"
            type="date"
            value={date}
            onChange={(event) =>
              setDate(
                event.target.value
              )
            }
          />
        </div>

        <div className="attendance-control">
          <label htmlFor="attendance-status">
            Status
          </label>

          <select
            id="attendance-status"
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

            <option value="Present">
              Present
            </option>

            <option value="Absent">
              Absent
            </option>

            <option value="Leave">
              Leave
            </option>

            <option value="Partial">
              Partial
            </option>

            <option value="Not Marked">
              Not Marked
            </option>
          </select>
        </div>

        <button
          className="attendance-refresh-button"
          onClick={
            loadAttendanceData
          }
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </section>

      <section className="attendance-admin-card">
        <div className="attendance-admin-card-header">
          <div>
            <span className="card-eyebrow">
              DEVOTEE DIRECTORY
            </span>

            <h2>
              Daily Attendance
            </h2>

            <p>
              Showing{" "}
              {adminRecords.length} of{" "}
              {devotees.length} devotees
              for{" "}
              {formatDate(date)}.
            </p>
          </div>

          <span className="attendance-live-badge">
            <i />
            Live
          </span>
        </div>

        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>
                  Devotee
                </th>

                <th>
                  Department
                </th>

                <th>
                  Residence
                </th>

                <th>
                  Morning
                </th>

                <th>
                  Evening
                </th>

                <th>
                  Overall
                </th>
              </tr>
            </thead>

            <tbody>
              {adminRecords.map(
                (record) => {
                  const overall =
                    calculateOverall(
                      record.morning,
                      record.evening
                    );

                  const morningSaving =
                    savingId ===
                    `${record.id}_morning`;

                  const eveningSaving =
                    savingId ===
                    `${record.id}_evening`;

                  return (
                    <tr
                      key={
                        record.devoteeId
                      }
                    >
                      <td>
                        <div className="attendance-devotee-cell">
                          <div className="attendance-avatar">
                            {record.name
                              .charAt(
                                0
                              )
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {record.name}
                            </strong>

                            <span>
                              {record.email ||
                                "No email available"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="department-text">
                          {record.department}
                        </span>
                      </td>

                      <td>
                        <div className="attendance-room-cell">
                          <span className="room-icon">
                            🏠
                          </span>

                          <span className="room-text">
                            {
                              record.roomIdentity
                            }
                          </span>
                        </div>
                      </td>

                      <td>
                        <AttendanceEditor
                          value={
                            record.morning
                          }
                          saving={
                            morningSaving
                          }
                          onChange={(
                            value
                          ) =>
                            updateAttendance(
                              record.devoteeId,
                              "morning",
                              value
                            )
                          }
                        />
                      </td>

                      <td>
                        <AttendanceEditor
                          value={
                            record.evening
                          }
                          saving={
                            eveningSaving
                          }
                          onChange={(
                            value
                          ) =>
                            updateAttendance(
                              record.devoteeId,
                              "evening",
                              value
                            )
                          }
                        />
                      </td>

                      <td>
                        <span
                          className={`attendance-status ${getStatusClass(
                            overall
                          )}`}
                        >
                          {overall}
                        </span>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>

        {adminRecords.length ===
          0 && (
          <div className="attendance-empty">
            <div className="attendance-empty-icon">
              ⌕
            </div>

            <h3>
              No devotees found
            </h3>

            <p>
              Try changing the search,
              status filter, or selected
              date.
            </p>

            {(search ||
              statusFilter !==
                "All") && (
              <button
                onClick={() => {
                  setSearch("");
                  setStatusFilter(
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

      <div className="attendance-admin-note">
        <span>i</span>

        <div>
          <strong>
            Administrator attendance
            services
          </strong>

          <p>
            Changes are saved directly to
            the Firestore attendance record
            for the selected devotee and
            date. Residence information is
            read from the current room
            assignment.
          </p>
        </div>
      </div>
    </div>
  );
}

/*
 * ==============================================================
 * ADMIN STAT CARD
 * ==============================================================
 */

function AttendanceStat({
  label,
  value,
  icon,
  type,
}) {
  return (
    <article className="admin-attendance-stat">
      <div
        className={`attendance-stat-icon ${type}`}
      >
        {icon}
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

/*
 * ==============================================================
 * ADMIN ATTENDANCE EDITOR
 * ==============================================================
 */

function AttendanceEditor({
  value,
  saving,
  onChange,
}) {
  return (
    <div className="attendance-editor">
      <select
        value={value}
        disabled={saving}
        className={getStatusClass(
          value
        )}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      >
        {ATTENDANCE_OPTIONS.map(
          (option) => (
            <option
              key={option}
              value={option}
            >
              {option}
            </option>
          )
        )}
      </select>

      {saving && (
        <span className="attendance-saving">
          Saving...
        </span>
      )}
    </div>
  );
}

/*
 * ==============================================================
 * DEVOTEE TIMELINE ITEM
 * ==============================================================
 */

function AttendanceTimelineItem({
  number,
  title,
  description,
  status,
  last = false,
}) {
  return (
    <div
      className={`personal-timeline-item ${
        last ? "last" : ""
      }`}
    >
      <div className="timeline-number">
        {number}
      </div>

      <div className="timeline-content">
        <div>
          <strong>
            {title}
          </strong>

          <p>
            {description}
          </p>
        </div>

        <span
          className={`attendance-status ${getStatusClass(
            status
          )}`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

/*
 * ==============================================================
 * HELPERS
 * ==============================================================
 */

function getStatusClass(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(
    `${value}T00:00:00`
  );

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

export default Attendance;