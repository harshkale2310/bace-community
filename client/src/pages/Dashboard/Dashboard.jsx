import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { Link } from "react-router-dom";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Dashboard.css";

/* ==========================================================================
   HELPERS
   ========================================================================== */

function getTodayString() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getStatusClass(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getInitial(name, fallback = "D") {
  if (typeof name !== "string") {
    return fallback;
  }

  return (
    name.trim().charAt(0).toUpperCase() ||
    fallback
  );
}

function getDevoteeName(user) {
  return (
    user?.name ||
    user?.displayName ||
    user?.fullName ||
    user?.email ||
    "Devotee"
  );
}

function getJapaRounds(record) {
  if (!record) return 0;

  const rounds = Number(record.rounds);

  return Number.isFinite(rounds) && rounds >= 0
    ? rounds
    : 0;
}

function getDevoteeRooms(rooms, devoteeId) {
  if (!devoteeId) return [];

  return rooms.filter(
    (room) =>
      Array.isArray(room.occupants) &&
      room.occupants.includes(devoteeId)
  );
}

function getRoomIdentity(room) {
  if (!room) return "";

  const floor =
    room.floor !== undefined &&
    room.floor !== null
      ? `Floor ${room.floor}`
      : "Floor not assigned";

  const roomNumber = room.roomNumber
    ? `Room ${room.roomNumber}`
    : "Room number not assigned";

  const roomName =
    room.roomName || "Unnamed Room";

  return `${floor} · ${roomNumber} · ${roomName}`;
}

/* ==========================================================================
   ATTENDANCE LOGIC
   ========================================================================== */

/*
 * Morning attendance:
 *   - Mangal Arti
 *   - Morning Class
 *
 * Evening attendance:
 *   - Evening Class
 *
 * Japa rounds do NOT affect attendance.
 *
 * SESSION RULES:
 *
 *   Present + Present -> Present
 *   Present + Late    -> Late
 *   Late + Present    -> Late
 *   Late + Late       -> Late
 *   Absent + Absent   -> Absent
 *   Missing/mixture   -> Partial
 *   Nothing marked    -> Not Marked
 *
 * IMPORTANT:
 * "Late" is a valid attendance status.
 * It must NOT be treated as an unmarked/invalid value.
 */

function getSessionStatus(values) {
  const normalizedValues = values.map(
    normalizeStatus
  );

  const hasAnyValue = normalizedValues.some(
    Boolean
  );

  // Nothing has been entered for this session.
  if (!hasAnyValue) {
    return "Not Marked";
  }

  /*
   * We intentionally do NOT remove empty values here.
   *
   * Example:
   *   [Present, ""] -> Partial
   *
   * because Morning has two required programs:
   * Mangal Arti + Morning Class.
   */

  const validStatuses = [
    "present",
    "late",
    "absent",
  ];

  // If one required program is missing, the session is partial.
  if (
    normalizedValues.some(
      (status) => !status
    )
  ) {
    return "Partial";
  }

  // If an unexpected value exists, don't silently call it Present.
  if (
    normalizedValues.some(
      (status) =>
        !validStatuses.includes(status)
    )
  ) {
    return "Partial";
  }

  // All attended and nobody was late.
  if (
    normalizedValues.every(
      (status) => status === "present"
    )
  ) {
    return "Present";
  }

  // Everyone was absent.
  if (
    normalizedValues.every(
      (status) => status === "absent"
    )
  ) {
    return "Absent";
  }

  // Everyone attended, but at least one was late.
  if (
    normalizedValues.every((status) =>
      ["present", "late"].includes(status)
    )
  ) {
    return "Late";
  }

  // Example:
  // Present + Absent -> Partial
  // Late + Absent    -> Partial
  return "Partial";
}

function getMorningStatus(record) {
  if (!record) {
    return "Not Marked";
  }

  return getSessionStatus([
    record.mangalArti,
    record.morningClass,
  ]);
}

function getEveningStatus(record) {
  if (!record) {
    return "Not Marked";
  }

  return getSessionStatus([
    record.eveningClass,
  ]);
}

/*
 * OVERALL DAILY ATTENDANCE
 *
 * IMPORTANT BUSINESS RULE:
 *
 * Late counts as attendance.
 *
 * Therefore:
 *
 *   Present + Present -> Present
 *   Present + Late    -> Present
 *   Late + Present    -> Present
 *   Late + Late       -> Present
 *
 * We use "Late" only at the individual session level.
 *
 * If one session is missing or absent while another is attended,
 * the overall result is Partial.
 */

function getAttendanceStatus(
  morning,
  evening
) {
  const attendedStatuses = [
    "Present",
    "Late",
  ];

  // Nothing marked anywhere.
  if (
    morning === "Not Marked" &&
    evening === "Not Marked"
  ) {
    return "Not Marked";
  }

  // Both morning and evening were attended.
  // Late still counts as attended.
  if (
    attendedStatuses.includes(morning) &&
    attendedStatuses.includes(evening)
  ) {
    return "Present";
  }

  // Both sessions are absent.
  if (
    morning === "Absent" &&
    evening === "Absent"
  ) {
    return "Absent";
  }

  // Everything else is partial.
  return "Partial";
}

/* ==========================================================================
   DASHBOARD
   ========================================================================== */

function Dashboard() {
  const {
    user,
    isAdministrator,
    isDevotee,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [devotees, setDevotees] = useState([]);
  const [sadhanaRecords, setSadhanaRecords] =
    useState([]);
  const [rooms, setRooms] = useState([]);

  const [refreshKey, setRefreshKey] =
    useState(0);

  /* ------------------------------------------------------------------------
     TODAY
     ------------------------------------------------------------------------ */

  const today = useMemo(
    () => getTodayString(),
    []
  );

  const formattedToday = useMemo(
    () =>
      new Date(
        `${today}T12:00:00`
      ).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    [today]
  );

  /* ------------------------------------------------------------------------
     LOAD DASHBOARD DATA
     ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        /*
         * Clear previous data before loading.
         * This prevents stale admin/devotee data after role changes
         * or a retry.
         */
        setDevotees([]);
        setSadhanaRecords([]);
        setRooms([]);

        /* ================================================================
           ADMIN
           ================================================================ */

        if (isAdministrator) {
          /*
           * Query only by role.
           *
           * Filtering status client-side avoids requiring a Firestore
           * composite index on role + status.
           */
          const devoteesQuery = query(
            collection(db, "users"),
            where(
              "role",
              "==",
              "devotee"
            )
          );

          const sadhanaQuery = query(
            collection(db, "sadhana"),
            where(
              "date",
              "==",
              today
            )
          );

          const roomsQuery = collection(
            db,
            "rooms"
          );

          const [
            devoteesSnapshot,
            sadhanaSnapshot,
            roomsSnapshot,
          ] = await Promise.all([
            getDocs(devoteesQuery),
            getDocs(sadhanaQuery),
            getDocs(roomsQuery),
          ]);

          if (cancelled) return;

          const devoteeData =
            devoteesSnapshot.docs
              .map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }))
              .filter((devotee) => {
                /*
                 * Treat missing status as active for compatibility
                 * with existing user records.
                 */
                const status =
                  normalizeStatus(
                    devotee.status
                  );

                return (
                  !status ||
                  status === "active"
                );
              });

          const sadhanaData =
            sadhanaSnapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          const roomData =
            roomsSnapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          setDevotees(devoteeData);
          setSadhanaRecords(sadhanaData);
          setRooms(roomData);

          return;
        }

        /* ================================================================
           DEVOTEE
           ================================================================ */

        if (isDevotee) {
          const sadhanaQuery = query(
            collection(db, "sadhana"),
            where(
              "devoteeId",
              "==",
              user.uid
            )
          );

          const roomsQuery = query(
            collection(db, "rooms"),
            where(
              "occupants",
              "array-contains",
              user.uid
            )
          );

          const [
            sadhanaSnapshot,
            roomsSnapshot,
          ] = await Promise.all([
            getDocs(sadhanaQuery),
            getDocs(roomsQuery),
          ]);

          if (cancelled) return;

          const sadhanaData =
            sadhanaSnapshot.docs
              .map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }))
              .filter(
                (record) =>
                  record.date === today
              );

          const roomData =
            roomsSnapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );

          setSadhanaRecords(sadhanaData);
          setRooms(roomData);

          return;
        }
      } catch (err) {
        console.error(
          "Dashboard loading error:",
          err
        );

        if (!cancelled) {
          setError(
            "We couldn't load the latest dashboard information. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    isAdministrator,
    isDevotee,
    today,
    refreshKey,
  ]);

  /* ==========================================================================
     ADMIN ATTENDANCE
     ========================================================================== */

  const todayAttendance = useMemo(() => {
    if (!isAdministrator) {
      return [];
    }

    return devotees.map((devotee) => {
      /*
       * Sadhana document structure:
       *
       * sadhana/{uid}_{YYYY-MM-DD}
       *
       * Admin already loaded only today's records.
       * We still match by devoteeId + date for safety.
       */
      const record =
        sadhanaRecords.find(
          (item) =>
            item.devoteeId === devotee.id &&
            item.date === today
        ) || null;

      const devoteeRooms =
        getDevoteeRooms(
          rooms,
          devotee.id
        );

      const morning =
        getMorningStatus(record);

      const evening =
        getEveningStatus(record);

      const attendanceStatus =
        getAttendanceStatus(
          morning,
          evening
        );

      return {
        ...devotee,

        sadhanaRecord: record,

        morning,
        evening,

        attendanceStatus,

        japaRounds:
          getJapaRounds(record),

        mangalArti:
          record?.mangalArti || "",

        morningClass:
          record?.morningClass || "",

        eveningClass:
          record?.eveningClass || "",

        roomLabel:
          devoteeRooms.length > 0
            ? devoteeRooms
                .map(getRoomIdentity)
                .join(" • ")
            : "Residence not assigned",
      };
    });
  }, [
    devotees,
    sadhanaRecords,
    rooms,
    isAdministrator,
    today,
  ]);

  /* ==========================================================================
     ADMIN STATS
     ========================================================================== */

  const adminStats = useMemo(() => {
    const total =
      todayAttendance.length;

    /*
     * Overall Present means both Morning and Evening
     * are attended.
     *
     * Late counts as attended.
     */
    const present =
      todayAttendance.filter(
        (item) =>
          item.attendanceStatus ===
          "Present"
      ).length;

    const partial =
      todayAttendance.filter(
        (item) =>
          item.attendanceStatus ===
          "Partial"
      ).length;

    const absent =
      todayAttendance.filter(
        (item) =>
          item.attendanceStatus ===
          "Absent"
      ).length;

    /*
     * "Late" is a session-level statistic.
     *
     * Example:
     * Morning = Late
     * Evening = Present
     *
     * Overall = Present
     * Late count = 1
     */
    const late =
      todayAttendance.filter(
        (item) =>
          item.morning === "Late" ||
          item.evening === "Late"
      ).length;

    const notMarked =
      todayAttendance.filter(
        (item) =>
          item.attendanceStatus ===
          "Not Marked"
      ).length;

    const japaCompleted =
      todayAttendance.filter(
        (item) =>
          item.japaRounds > 0
      ).length;

    return {
      total,
      present,
      partial,
      absent,
      late,
      notMarked,
      japaCompleted,
      marked:
        total - notMarked,
    };
  }, [todayAttendance]);

  /* ==========================================================================
     DEVOTEE TODAY
     ========================================================================== */

  const devoteeTodayAttendance =
    useMemo(() => {
      if (!isDevotee) {
        return {
          record: null,
          status: "Not Marked",
          morning: "Not Marked",
          evening: "Not Marked",
          japaRounds: 0,
          mangalArti: "",
          morningClass: "",
          eveningClass: "",
        };
      }

      const record =
        sadhanaRecords.find(
          (item) =>
            item.date === today
        ) || null;

      const morning =
        getMorningStatus(record);

      const evening =
        getEveningStatus(record);

      return {
        record,

        status:
          getAttendanceStatus(
            morning,
            evening
          ),

        morning,
        evening,

        japaRounds:
          getJapaRounds(record),

        mangalArti:
          record?.mangalArti || "",

        morningClass:
          record?.morningClass || "",

        eveningClass:
          record?.eveningClass || "",
      };
    }, [
      sadhanaRecords,
      today,
      isDevotee,
    ]);

  /* ==========================================================================
     DEVOTEE ROOMS
     ========================================================================== */

  const currentDevoteeRooms =
    useMemo(() => {
      if (
        !isDevotee ||
        !user?.uid
      ) {
        return [];
      }

      return getDevoteeRooms(
        rooms,
        user.uid
      );
    }, [
      rooms,
      isDevotee,
      user?.uid,
    ]);

  /* ==========================================================================
     LOADING
     ========================================================================== */

  if (loading) {
    return <Loader />;
  }

  /* ==========================================================================
     RENDER
     ========================================================================== */

  return (
    <div className="dashboard-page">

      {/* ====================================================================
          HEADER
          ==================================================================== */}

      <header className="dashboard-header">
        <div className="dashboard-header-copy">

          <span className="dashboard-eyebrow">
            {isAdministrator
              ? "BACE ADMINISTRATION"
              : "MY BACE"}
          </span>

          <h1>
            {isAdministrator
              ? "Hare Krishna, Admin 🙏"
              : `Hare Krishna, ${
                  getDevoteeName(user).split(
                    " "
                  )[0]
                } 🙏`}
          </h1>

          <p>
            {isAdministrator
              ? "A clear view of today's Sadhana and community attendance."
              : "Your Sadhana, attendance and residence at a glance."}
          </p>

        </div>

        <div
          className="dashboard-date"
          aria-label={`Today is ${formattedToday}`}
        >
          <span>
            Today
          </span>

          <strong>
            {formattedToday}
          </strong>
        </div>
      </header>

      {/* ====================================================================
          ERROR
          ==================================================================== */}

      {error && (
        <div
          className="dashboard-error"
          role="alert"
        >
          <div>

            <strong>
              Dashboard unavailable
            </strong>

            <span>
              {error}
            </span>

          </div>

          <button
            type="button"
            className="dashboard-retry"
            onClick={() =>
              setRefreshKey(
                (value) =>
                  value + 1
              )
            }
          >
            Try again
          </button>
        </div>
      )}

      {/* ====================================================================
          ADMIN DASHBOARD
          ==================================================================== */}

      {isAdministrator && (
        <>

          {/* ----------------------------------------------------------------
              ADMIN SUMMARY
              ---------------------------------------------------------------- */}

          <section
            className="dashboard-stats"
            aria-label="Daily summary"
          >

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon devotees">
                D
              </div>

              <div>
                <span>
                  Active Devotees
                </span>

                <strong>
                  {adminStats.total}
                </strong>

                <small>
                  Currently active
                </small>
              </div>

            </div>

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon present">
                ✓
              </div>

              <div>
                <span>
                  Present Today
                </span>

                <strong>
                  {adminStats.present}
                </strong>

                <small>
                  Morning + evening
                </small>
              </div>

            </div>

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon partial">
                ◐
              </div>

              <div>
                <span>
                  Needs Attention
                </span>

                <strong>
                  {adminStats.partial +
                    adminStats.absent +
                    adminStats.notMarked}
                </strong>

                <small>
                  Partial, absent or not marked
                </small>
              </div>

            </div>

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon japa">
                J
              </div>

              <div>
                <span>
                  Japa Recorded
                </span>

                <strong>
                  {adminStats.japaCompleted}
                </strong>

                <small>
                  Devotees with rounds
                </small>
              </div>

            </div>

          </section>

          {/* ----------------------------------------------------------------
              ADMIN ATTENDANCE
              ---------------------------------------------------------------- */}

          <section className="dashboard-card dashboard-attendance-card">

            <div className="dashboard-card-header">

              <div>

                <span className="dashboard-section-label">
                  TODAY'S SADHANA
                </span>

                <h2>
                  Attendance overview
                </h2>

                <p>
                  Live attendance based directly on today's saved Sadhana records.
                </p>

              </div>

              <Link
                to="/sadhana"
                className="dashboard-view-all"
              >
                Open Sadhana →
              </Link>

            </div>

            {/* SUMMARY STRIP */}

            <div className="attendance-summary">

              <AttendanceSummaryItem
                type="present"
                count={adminStats.present}
                label="Present"
              />

              <AttendanceSummaryItem
                type="partial"
                count={adminStats.partial}
                label="Partial"
              />

              <AttendanceSummaryItem
                type="absent"
                count={adminStats.absent}
                label="Absent"
              />

              <AttendanceSummaryItem
                type="late"
                count={adminStats.late}
                label="Late"
              />

              <AttendanceSummaryItem
                type="not-marked"
                count={adminStats.notMarked}
                label="Not marked"
              />

            </div>

            {/* ============================================================== 
                DESKTOP TABLE
                ============================================================== */}

            <div className="dashboard-attendance-table-wrapper">

              <table className="dashboard-attendance-table">

                <thead>
                  <tr>

                    <th>
                      Devotee
                    </th>

                    <th>
                      Sadhana
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

                  {todayAttendance.length === 0 ? (
                    <tr>

                      <td
                        colSpan="5"
                        className="dashboard-table-empty"
                      >
                        No active devotees are registered yet.
                      </td>

                    </tr>
                  ) : (
                    todayAttendance.map(
                      (devotee) => (
                        <tr
                          key={devotee.id}
                        >

                          {/* DEVOTEE */}

                          <td>

                            <div className="dashboard-devotee-cell">

                              <div className="dashboard-devotee-avatar">
                                {getInitial(
                                  devotee.name
                                )}
                              </div>

                              <div>

                                <strong>
                                  {devotee.name ||
                                    "Unnamed Devotee"}
                                </strong>

                                <span>
                                  {devotee.roomLabel}
                                </span>

                              </div>

                            </div>

                          </td>

                          {/* SADHANA */}

                          <td>

                            <div className="dashboard-sadhana-cell">

                              <div className="japa-rounds">

                                <span>
                                  Japa
                                </span>

                                <strong>
                                  {
                                    devotee.japaRounds
                                  }
                                </strong>

                                <small>
                                  rounds
                                </small>

                              </div>

                              <SadhanaMiniStatus
                                label="M.A."
                                value={
                                  devotee.mangalArti
                                }
                              />

                              <SadhanaMiniStatus
                                label="M.Class"
                                value={
                                  devotee.morningClass
                                }
                              />

                              <SadhanaMiniStatus
                                label="E.Class"
                                value={
                                  devotee.eveningClass
                                }
                              />

                            </div>

                          </td>

                          {/* MORNING */}

                          <td>

                            <AttendancePill
                              status={
                                devotee.morning
                              }
                            />

                          </td>

                          {/* EVENING */}

                          <td>

                            <AttendancePill
                              status={
                                devotee.evening
                              }
                            />

                          </td>

                          {/* OVERALL */}

                          <td>

                            <AttendancePill
                              status={
                                devotee.attendanceStatus
                              }
                              overall
                            />

                          </td>

                        </tr>
                      )
                    )
                  )}

                </tbody>

              </table>

            </div>

            {/* ============================================================== 
                MOBILE
                ============================================================== */}

            <div className="dashboard-mobile-attendance">

              {todayAttendance.length === 0 ? (
                <div className="dashboard-mobile-empty">
                  No active devotees are registered yet.
                </div>
              ) : (
                todayAttendance.map(
                  (devotee) => (
                    <article
                      key={devotee.id}
                      className="dashboard-attendance-mobile-card"
                    >

                      <div className="dashboard-mobile-person">

                        <div className="dashboard-devotee-avatar">
                          {getInitial(
                            devotee.name
                          )}
                        </div>

                        <div>

                          <strong>
                            {devotee.name ||
                              "Unnamed Devotee"}
                          </strong>

                          <span>
                            {devotee.roomLabel}
                          </span>

                        </div>

                        <AttendancePill
                          status={
                            devotee.attendanceStatus
                          }
                          overall
                          mobile
                        />

                      </div>

                      <div className="dashboard-mobile-sadhana">

                        <MobileSadhanaItem
                          label="Japa"
                          value={`${devotee.japaRounds} rounds`}
                        />

                        <MobileSadhanaItem
                          label="M.A."
                          value={
                            devotee.mangalArti ||
                            "—"
                          }
                        />

                        <MobileSadhanaItem
                          label="M. Class"
                          value={
                            devotee.morningClass ||
                            "—"
                          }
                        />

                        <MobileSadhanaItem
                          label="E. Class"
                          value={
                            devotee.eveningClass ||
                            "—"
                          }
                        />

                      </div>

                      <div className="dashboard-mobile-status-grid">

                        <div>

                          <small>
                            Morning
                          </small>

                          <AttendancePill
                            status={
                              devotee.morning
                            }
                          />

                        </div>

                        <div>

                          <small>
                            Evening
                          </small>

                          <AttendancePill
                            status={
                              devotee.evening
                            }
                          />

                        </div>

                      </div>

                    </article>
                  )
                )
              )}

            </div>

          </section>

        </>
      )}

      {/* ====================================================================
          DEVOTEE DASHBOARD
          ==================================================================== */}

      {isDevotee && (
        <>

          {/* ----------------------------------------------------------------
              PERSONAL SUMMARY
              ---------------------------------------------------------------- */}

          <section
            className="dashboard-stats devotee-stats"
            aria-label="My Sadhana summary"
          >

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon present">
                ✓
              </div>

              <div>

                <span>
                  Today's Attendance
                </span>

                <strong className="stat-text">
                  {
                    devoteeTodayAttendance.status
                  }
                </strong>

                <small>
                  {
                    devoteeTodayAttendance.morning
                  }{" "}
                  ·{" "}
                  {
                    devoteeTodayAttendance.evening
                  }
                </small>

              </div>

            </div>

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon japa">
                J
              </div>

              <div>

                <span>
                  Japa Rounds
                </span>

                <strong>
                  {
                    devoteeTodayAttendance.japaRounds
                  }
                </strong>

                <small>
                  Today's saved rounds
                </small>

              </div>

            </div>

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon devotees">
                M
              </div>

              <div>

                <span>
                  Morning
                </span>

                <strong className="stat-text">
                  {
                    devoteeTodayAttendance.morning
                  }
                </strong>

                <small>
                  M.A. + Morning Class
                </small>

              </div>

            </div>

            <div className="dashboard-stat-card">

              <div className="dashboard-stat-icon partial">
                E
              </div>

              <div>

                <span>
                  Evening
                </span>

                <strong className="stat-text">
                  {
                    devoteeTodayAttendance.evening
                  }
                </strong>

                <small>
                  Evening Class
                </small>

              </div>

            </div>

          </section>

          {/* ----------------------------------------------------------------
              TODAY'S SADHANA
              ---------------------------------------------------------------- */}

          <section className="dashboard-card dashboard-personal-sadhana">

            <div className="dashboard-card-header">

              <div>

                <span className="dashboard-section-label">
                  TODAY'S SADHANA
                </span>

                <h2>
                  My Sadhana
                </h2>

                <p>
                  Your attendance and saved practice details for today.
                </p>

              </div>

              <Link
                to="/sadhana"
                className="dashboard-view-all"
              >
                Open Sadhana →
              </Link>

            </div>

            <div className="devotee-sadhana-grid">

              <DevoteeSadhanaItem
                label="JAPA ROUNDS"
                value={
                  devoteeTodayAttendance.japaRounds
                }
              />

              <DevoteeSadhanaItem
                label="MANGAL ARTI"
                value={
                  devoteeTodayAttendance.mangalArti ||
                  "Not Marked"
                }
              />

              <DevoteeSadhanaItem
                label="MORNING CLASS"
                value={
                  devoteeTodayAttendance.morningClass ||
                  "Not Marked"
                }
              />

              <DevoteeSadhanaItem
                label="EVENING CLASS"
                value={
                  devoteeTodayAttendance.eveningClass ||
                  "Not Marked"
                }
              />

            </div>

          </section>

          {/* ----------------------------------------------------------------
              RESIDENCE
              ---------------------------------------------------------------- */}

          {currentDevoteeRooms.length > 0 && (
            <section className="dashboard-card dashboard-residence-card">

              <div className="dashboard-card-header">

                <div>

                  <span className="dashboard-section-label">
                    MY RESIDENCE
                  </span>

                  <h2>
                    Current room
                  </h2>

                  <p>
                    Your current residence information from BACE records.
                  </p>

                </div>

                <Link
                  to="/my-room"
                  className="dashboard-view-all"
                >
                  View My Room →
                </Link>

              </div>

              <div className="dashboard-residence-list">

                {currentDevoteeRooms.map(
                  (room) => (
                    <div
                      key={room.id}
                      className="dashboard-residence-item"
                    >

                      <div className="dashboard-residence-item-icon">
                        R
                      </div>

                      <div>

                        <span>
                          RESIDENCE
                        </span>

                        <strong>
                          {room.roomName ||
                            "Unnamed Room"}
                        </strong>

                        <p>
                          {getRoomIdentity(
                            room
                          )}
                        </p>

                      </div>

                    </div>
                  )
                )}

              </div>

            </section>
          )}

          {/* ----------------------------------------------------------------
              QUICK ACTIONS
              ---------------------------------------------------------------- */}

          <section className="dashboard-card dashboard-actions-card">

            <div className="dashboard-card-header">

              <div>

                <span className="dashboard-section-label">
                  MY BACE
                </span>

                <h2>
                  Quick actions
                </h2>

                <p>
                  Access the areas you use regularly.
                </p>

              </div>

            </div>

            <div className="dashboard-action-grid">

              <DashboardLink
                to="/sadhana"
                icon="S"
                title="Sadhana"
                description="Complete today's practice"
              />

              <DashboardLink
                to="/devotee-profile"
                icon="D"
                title="My Profile"
                description="View your profile"
              />

              <DashboardLink
                to="/seva"
                icon="✦"
                title="My Seva"
                description="View your seva"
              />

              <DashboardLink
                to="/leave"
                icon="L"
                title="Leave"
                description="Manage your leave"
              />

            </div>

          </section>

        </>
      )}

    </div>
  );
}

/* ==========================================================================
   SMALL COMPONENTS
   ========================================================================== */

function AttendanceSummaryItem({
  type,
  count,
  label,
}) {
  return (
    <div
      className={`attendance-summary-item ${type}`}
    >
      <span className="summary-dot" />

      <div>

        <strong>
          {count}
        </strong>

        <small>
          {label}
        </small>

      </div>
    </div>
  );
}

function AttendancePill({
  status,
  overall = false,
  mobile = false,
}) {
  const safeStatus =
    status || "Not Marked";

  return (
    <span
      className={[
        "attendance-pill",
        overall ? "overall" : "",
        mobile ? "mobile-overall" : "",
        getStatusClass(safeStatus),
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {safeStatus}
    </span>
  );
}

function SadhanaMiniStatus({
  label,
  value,
}) {
  return (
    <div className="sadhana-mini-status">

      <span>
        {label}
      </span>

      <b
        className={getStatusClass(value)}
      >
        {value || "—"}
      </b>

    </div>
  );
}

function MobileSadhanaItem({
  label,
  value,
}) {
  return (
    <div>

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}

function DevoteeSadhanaItem({
  label,
  value,
}) {
  return (
    <div className="devotee-sadhana-item">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}

/* ==========================================================================
   DASHBOARD LINK
   ========================================================================== */

function DashboardLink({
  to,
  icon,
  title,
  description,
}) {
  return (
    <Link
      to={to}
      className="dashboard-management-item"
    >

      <span className="management-icon">
        {icon}
      </span>

      <div>

        <strong>
          {title}
        </strong>

        <small>
          {description}
        </small>

      </div>

      <span className="management-arrow">
        →
      </span>

    </Link>
  );
}

export default Dashboard;