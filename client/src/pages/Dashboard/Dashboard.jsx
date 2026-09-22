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

function Dashboard() {
  const { user, isAdministrator, isDevotee } = useAuth();

  const [loading, setLoading] = useState(true);
  const [devotees, setDevotees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const today = useMemo(() => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  }, []);

  const formattedToday = useMemo(
    () =>
      new Date(`${today}T12:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    [today]
  );

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const roomsQuery = isAdministrator
          ? query(collection(db, "rooms"))
          : query(
              collection(db, "rooms"),
              where("occupants", "array-contains", user.uid)
            );

        if (isAdministrator) {
          const devoteesQuery = query(
            collection(db, "users"),
            where("role", "==", "devotee"),
            where("status", "==", "active")
          );

          const attendanceQuery = query(
            collection(db, "attendance"),
            where("date", "==", today)
          );

          const [
            devoteesSnapshot,
            attendanceSnapshot,
            roomsSnapshot,
          ] = await Promise.all([
            getDocs(devoteesQuery),
            getDocs(attendanceQuery),
            getDocs(roomsQuery),
          ]);

          if (cancelled) return;

          const devoteeData = devoteesSnapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .filter(
              (devotee) =>
                devotee.role === "devotee" &&
                devotee.status === "active"
            );

          const attendanceData = attendanceSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          const roomData = roomsSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          setDevotees(devoteeData);
          setAttendance(attendanceData);
          setRooms(roomData);
        }

        if (isDevotee) {
          const attendanceQuery = query(
            collection(db, "attendance"),
            where("devoteeId", "==", user.uid)
          );

          const [attendanceSnapshot, roomsSnapshot] = await Promise.all([
            getDocs(attendanceQuery),
            getDocs(roomsQuery),
          ]);

          if (cancelled) return;

          setAttendance(
            attendanceSnapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }))
          );

          setRooms(
            roomsSnapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }))
          );
        }
      } catch (err) {
        console.error("Dashboard loading error:", err);

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
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [user, isAdministrator, isDevotee, today, refreshKey]);

  const getDevoteeRooms = (devoteeId) => {
    if (!devoteeId) return [];

    return rooms.filter((room) =>
      Array.isArray(room.occupants)
        ? room.occupants.includes(devoteeId)
        : false
    );
  };

  const getRoomIdentity = (room) => {
    if (!room) return "";

    const floor =
      room.floor !== undefined && room.floor !== null
        ? `Floor ${room.floor}`
        : "Floor not assigned";

    const roomNumber = room.roomNumber
      ? `Room ${room.roomNumber}`
      : "Room number not assigned";

    const roomName = room.roomName || "Unnamed Room";

    return `${floor} · ${roomNumber} · ${roomName}`;
  };

  const getAttendanceStatus = (record) => {
    const morning = record?.morning || "Not Marked";
    const evening = record?.evening || "Not Marked";

    if (morning === "Present" && evening === "Present") return "Present";
    if (morning === "Absent" && evening === "Absent") return "Absent";
    if (morning === "Leave" && evening === "Leave") return "Leave";
    if (morning === "Not Marked" && evening === "Not Marked") {
      return "Not Marked";
    }

    return "Partial";
  };

  const currentDevoteeRooms = useMemo(() => {
    if (!isDevotee || !user?.uid) return [];
    return getDevoteeRooms(user.uid);
  }, [rooms, isDevotee, user?.uid]);

  const todayAttendance = useMemo(() => {
    if (!isAdministrator) return [];

    return devotees.map((devotee) => {
      const record = attendance.find(
        (item) =>
          item.devoteeId === devotee.id &&
          item.date === today
      );

      const devoteeRooms = getDevoteeRooms(devotee.id);

      return {
        ...devotee,
        attendanceRecord: record || null,
        attendanceStatus: getAttendanceStatus(record),
        morning: record?.morning || "Not Marked",
        evening: record?.evening || "Not Marked",
        roomLabel:
          devoteeRooms.length > 0
            ? devoteeRooms.map(getRoomIdentity).join(" • ")
            : "Residence not assigned",
      };
    });
  }, [devotees, attendance, rooms, isAdministrator, today]);

  const adminStats = useMemo(() => {
    const total = todayAttendance.length;
    const present = todayAttendance.filter(
      (item) => item.attendanceStatus === "Present"
    ).length;
    const partial = todayAttendance.filter(
      (item) => item.attendanceStatus === "Partial"
    ).length;
    const absent = todayAttendance.filter(
      (item) => item.attendanceStatus === "Absent"
    ).length;
    const leave = todayAttendance.filter(
      (item) => item.attendanceStatus === "Leave"
    ).length;
    const notMarked = todayAttendance.filter(
      (item) => item.attendanceStatus === "Not Marked"
    ).length;

    return {
      total,
      present,
      partial,
      absent,
      leave,
      notMarked,
      marked: total - notMarked,
    };
  }, [todayAttendance]);

  const devoteeTodayAttendance = useMemo(() => {
    const record = attendance.find((item) => item.date === today);

    return {
      status: getAttendanceStatus(record),
      morning: record?.morning || "Not Marked",
      evening: record?.evening || "Not Marked",
    };
  }, [attendance, today]);

  const roomCount = rooms.length;
  const occupiedRoomCount = rooms.filter(
    (room) => Array.isArray(room.occupants) && room.occupants.length > 0
  ).length;

  const getInitial = (name, fallback = "D") =>
    name?.trim()?.charAt(0)?.toUpperCase() || fallback;

  if (loading) {
    return <Loader text="Loading dashboard..." />;
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-copy">
          <span className="dashboard-eyebrow">
            {isAdministrator ? "BACE ADMINISTRATION" : "MY BACE"}
          </span>

          <h1>
            {isAdministrator
              ? "Hare Krishna, Admin 🙏"
              : `Hare Krishna, ${
                  user?.name?.split(" ")[0] || "Devotee"
                } 🙏`}
          </h1>

          <p>
            {isAdministrator
              ? "A clear overview of today’s community activity, attendance and administration."
              : "Your personal overview of today’s attendance and BACE activities."}
          </p>
        </div>

        <div className="dashboard-date" aria-label={`Today is ${formattedToday}`}>
          <span>Today</span>
          <strong>{formattedToday}</strong>
        </div>
      </header>

      {error && (
        <div className="dashboard-error" role="alert">
          <div>
            <strong>Dashboard unavailable</strong>
            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="dashboard-retry"
          >
            Try again
          </button>
        </div>
      )}

      {isAdministrator && (
        <>
          <section className="dashboard-stats" aria-label="Daily summary">
            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon devotees">D</div>
              <div>
                <span>Active Devotees</span>
                <strong>{adminStats.total}</strong>
                <small>Currently active</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon present">✓</div>
              <div>
                <span>Present Today</span>
                <strong>{adminStats.present}</strong>
                <small>Morning and evening</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon partial">◐</div>
              <div>
                <span>Needs Attention</span>
                <strong>{adminStats.partial + adminStats.notMarked}</strong>
                <small>Partial or not marked</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon rooms">R</div>
              <div>
                <span>Occupied Rooms</span>
                <strong>{occupiedRoomCount}</strong>
                <small>{roomCount} rooms recorded</small>
              </div>
            </div>
          </section>

          <section className="dashboard-card dashboard-attendance-card">
            <div className="dashboard-card-header">
              <div>
                <span className="dashboard-section-label">TODAY</span>
                <h2>Attendance overview</h2>
                <p>
                  A quick view of attendance for all active devotees.
                </p>
              </div>

              <Link to="/attendance" className="dashboard-view-all">
                Open Attendance →
              </Link>
            </div>

            <div className="attendance-summary">
              <div className="attendance-summary-item present">
                <span className="summary-dot" />
                <div>
                  <strong>{adminStats.present}</strong>
                  <small>Present</small>
                </div>
              </div>

              <div className="attendance-summary-item partial">
                <span className="summary-dot" />
                <div>
                  <strong>{adminStats.partial}</strong>
                  <small>Partial</small>
                </div>
              </div>

              <div className="attendance-summary-item absent">
                <span className="summary-dot" />
                <div>
                  <strong>{adminStats.absent}</strong>
                  <small>Absent</small>
                </div>
              </div>

              <div className="attendance-summary-item leave">
                <span className="summary-dot" />
                <div>
                  <strong>{adminStats.leave}</strong>
                  <small>Leave</small>
                </div>
              </div>

              <div className="attendance-summary-item not-marked">
                <span className="summary-dot" />
                <div>
                  <strong>{adminStats.notMarked}</strong>
                  <small>Not marked</small>
                </div>
              </div>
            </div>

            <div className="dashboard-attendance-table-wrapper">
              <table className="dashboard-attendance-table">
                <thead>
                  <tr>
                    <th>Devotee</th>
                    <th>Residence</th>
                    <th>Morning</th>
                    <th>Evening</th>
                    <th>Overall</th>
                  </tr>
                </thead>

                <tbody>
                  {todayAttendance.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="dashboard-table-empty">
                        No active devotees are registered yet.
                      </td>
                    </tr>
                  ) : (
                    todayAttendance.map((devotee) => (
                      <tr key={devotee.id}>
                        <td>
                          <div className="dashboard-devotee-cell">
                            <div className="dashboard-devotee-avatar">
                              {getInitial(devotee.name)}
                            </div>
                            <div>
                              <strong>
                                {devotee.name || "Unnamed Devotee"}
                              </strong>
                              <span>
                                {devotee.department || "Active devotee"}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="dashboard-residence-cell">
                            <span className="dashboard-residence-icon">
                              R
                            </span>
                            <div>
                              <span className="dashboard-residence-label">
                                Residence
                              </span>
                              <strong>{devotee.roomLabel}</strong>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={`attendance-pill ${devotee.morning
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {devotee.morning}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`attendance-pill ${devotee.evening
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {devotee.evening}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`attendance-pill overall ${devotee.attendanceStatus
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {devotee.attendanceStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="dashboard-mobile-attendance">
              {todayAttendance.length === 0 ? (
                <div className="dashboard-mobile-empty">
                  No active devotees are registered yet.
                </div>
              ) : (
                todayAttendance.map((devotee) => (
                  <article
                    key={devotee.id}
                    className="dashboard-attendance-mobile-card"
                  >
                    <div className="dashboard-mobile-person">
                      <div className="dashboard-devotee-avatar">
                        {getInitial(devotee.name)}
                      </div>
                      <div>
                        <strong>
                          {devotee.name || "Unnamed Devotee"}
                        </strong>
                        <span>{devotee.roomLabel}</span>
                      </div>
                    </div>

                    <div className="dashboard-mobile-status-grid">
                      <div>
                        <small>Morning</small>
                        <span
                          className={`attendance-pill ${devotee.morning
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {devotee.morning}
                        </span>
                      </div>

                      <div>
                        <small>Evening</small>
                        <span
                          className={`attendance-pill ${devotee.evening
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {devotee.evening}
                        </span>
                      </div>

                      <div>
                        <small>Overall</small>
                        <span
                          className={`attendance-pill overall ${devotee.attendanceStatus
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {devotee.attendanceStatus}
                        </span>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="dashboard-card dashboard-activity-card">
              <div className="dashboard-card-header">
                <div>
                  <span className="dashboard-section-label">
                    QUICK ACCESS
                  </span>
                  <h2>Community management</h2>
                  <p>
                    Go directly to the areas you manage most often.
                  </p>
                </div>
              </div>

              <div className="dashboard-management-grid">
                <DashboardLink
                  to="/devotees"
                  icon="D"
                  title="Devotees"
                  description="Manage active and inactive devotees"
                />
                <DashboardLink
                  to="/attendance"
                  icon="✓"
                  title="Attendance"
                  description="Mark and review daily attendance"
                />
                <DashboardLink
                  to="/sadhana"
                  icon="S"
                  title="Sadhana"
                  description="Review daily practice records"
                />
                <DashboardLink
                  to="/seva"
                  icon="✦"
                  title="Seva"
                  description="Manage seva activities"
                />
                <DashboardLink
                  to="/leave"
                  icon="L"
                  title="Leave"
                  description="Review pending leave requests"
                />
                <DashboardLink
                  to="/rooms"
                  icon="R"
                  title="Rooms"
                  description="Manage residence allocation"
                />
              </div>
            </section>

            <section className="dashboard-card dashboard-profile-card">
              <div className="dashboard-profile-top">
                <div className="dashboard-large-avatar">
                  {getInitial(user?.name, "A")}
                </div>

                <div>
                  <span>Administrator</span>
                  <h3>{user?.name || "BACE Administrator"}</h3>
                  <p>{user?.email}</p>
                </div>
              </div>

              <div className="dashboard-profile-divider" />

              <div className="dashboard-profile-links">
                <Link to="/settings">
                  <span>⚙</span>
                  Settings
                  <b>→</b>
                </Link>

                <Link to="/reports">
                  <span>▤</span>
                  Reports
                  <b>→</b>
                </Link>
              </div>
            </section>
          </div>
        </>
      )}

      {isDevotee && (
        <>
          <section className="dashboard-stats devotee-stats">
            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon present">✓</div>
              <div>
                <span>Today’s Attendance</span>
                <strong className="stat-text">
                  {devoteeTodayAttendance.status}
                </strong>
                <small>
                  {devoteeTodayAttendance.morning} ·{" "}
                  {devoteeTodayAttendance.evening}
                </small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon devotees">M</div>
              <div>
                <span>Morning</span>
                <strong className="stat-text">
                  {devoteeTodayAttendance.morning}
                </strong>
                <small>Morning attendance</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon partial">E</div>
              <div>
                <span>Evening</span>
                <strong className="stat-text">
                  {devoteeTodayAttendance.evening}
                </strong>
                <small>Evening attendance</small>
              </div>
            </div>

            <div className="dashboard-stat-card dashboard-residence-stat">
              <div className="dashboard-stat-icon rooms">R</div>
              <div>
                <span>My Residence</span>
                <strong className="stat-text">
                  {currentDevoteeRooms.length > 0
                    ? currentDevoteeRooms.length === 1
                      ? `Room ${
                          currentDevoteeRooms[0].roomNumber || "—"
                        }`
                      : `${currentDevoteeRooms.length} Rooms`
                    : "Not Assigned"}
                </strong>
                <small>
                  {currentDevoteeRooms.length > 0
                    ? currentDevoteeRooms
                        .map(getRoomIdentity)
                        .join(" • ")
                    : "Residence not assigned"}
                </small>
              </div>
            </div>
          </section>

          {currentDevoteeRooms.length > 0 && (
            <section className="dashboard-card dashboard-residence-card">
              <div className="dashboard-card-header">
                <div>
                  <span className="dashboard-section-label">
                    MY RESIDENCE
                  </span>
                  <h2>Current room assignment</h2>
                  <p>
                    Your current residence information from BACE records.
                  </p>
                </div>

                <Link to="/my-room" className="dashboard-view-all">
                  View My Room →
                </Link>
              </div>

              <div className="dashboard-residence-list">
                {currentDevoteeRooms.map((room) => (
                  <div
                    key={room.id}
                    className="dashboard-residence-item"
                  >
                    <div className="dashboard-residence-item-icon">
                      R
                    </div>

                    <div>
                      <span>RESIDENCE</span>
                      <strong>{room.roomName || "Unnamed Room"}</strong>
                      <p>{getRoomIdentity(room)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="dashboard-grid devotee-dashboard-grid">
            <section className="dashboard-card dashboard-activity-card">
              <div className="dashboard-card-header">
                <div>
                  <span className="dashboard-section-label">
                    MY BACE
                  </span>
                  <h2>Personal activity</h2>
                  <p>
                    Keep your daily BACE activities in one place.
                  </p>
                </div>
              </div>

              <div className="dashboard-management-grid">
                <DashboardLink
                  to="/devotee-profile"
                  icon="D"
                  title="My Profile"
                  description="View and update your profile"
                />
                <DashboardLink
                  to="/attendance"
                  icon="✓"
                  title="Attendance"
                  description="View your attendance"
                />
                <DashboardLink
                  to="/sadhana"
                  icon="S"
                  title="Sadhana"
                  description="Complete your daily practice"
                />
                <DashboardLink
                  to="/seva"
                  icon="✦"
                  title="My Seva"
                  description="View your seva activities"
                />
                <DashboardLink
                  to="/leave"
                  icon="L"
                  title="Leave"
                  description="Submit and manage leave"
                />
                <DashboardLink
                  to="/my-room"
                  icon="R"
                  title="My Room"
                  description="View residence information"
                />
              </div>
            </section>

            <section className="dashboard-card dashboard-profile-card">
              <div className="dashboard-profile-top">
                <div className="dashboard-large-avatar">
                  {getInitial(user?.name, "D")}
                </div>

                <div>
                  <span>Devotee account</span>
                  <h3>{user?.name || "Devotee"}</h3>
                  <p>{user?.email}</p>
                </div>
              </div>

              <div className="dashboard-profile-divider" />

              <div className="dashboard-profile-links">
                <Link to="/devotee-profile">
                  <span>♙</span>
                  My Profile
                  <b>→</b>
                </Link>

                <Link to="/my-reports">
                  <span>▤</span>
                  My Reports
                  <b>→</b>
                </Link>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardLink({ to, icon, title, description }) {
  return (
    <Link to={to} className="dashboard-management-item">
      <span className="management-icon">{icon}</span>

      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>

      <span className="management-arrow">→</span>
    </Link>
  );
}

export default Dashboard;
