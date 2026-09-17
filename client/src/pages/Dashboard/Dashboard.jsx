import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
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
  const [error, setError] = useState("");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const loadDashboard = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError("");

        if (isAdministrator) {
          const devoteesQuery = query(
            collection(db, "users"),
            where("role", "==", "devotee")
          );

          const attendanceQuery = query(
            collection(db, "attendance"),
            where("date", "==", today)
          );

          const [devoteesSnapshot, attendanceSnapshot] = await Promise.all([
            getDocs(devoteesQuery),
            getDocs(attendanceQuery),
          ]);

          const devoteeData = devoteesSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          const attendanceData = attendanceSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          setDevotees(devoteeData);
          setAttendance(attendanceData);
        }

        if (isDevotee) {
          const attendanceQuery = query(
            collection(db, "attendance"),
            where("devoteeId", "==", user.uid)
          );

          const attendanceSnapshot = await getDocs(attendanceQuery);

          const attendanceData = attendanceSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          setAttendance(attendanceData);
        }
      } catch (err) {
        console.error("Dashboard loading error:", err);
        setError("Unable to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [user, isAdministrator, isDevotee, today]);

  /*
   * Attendance logic matches the Attendance page.
   *
   * Present:
   * morning = Present AND evening = Present
   *
   * Partial:
   * one program is marked Present / other is different
   *
   * Absent:
   * morning = Absent AND evening = Absent
   *
   * Leave:
   * morning = Leave AND evening = Leave
   */
  const getAttendanceStatus = (record) => {
    const morning = record?.morning || "Not Marked";
    const evening = record?.evening || "Not Marked";

    if (morning === "Present" && evening === "Present") {
      return "Present";
    }

    if (morning === "Absent" && evening === "Absent") {
      return "Absent";
    }

    if (morning === "Leave" && evening === "Leave") {
      return "Leave";
    }

    if (morning === "Not Marked" && evening === "Not Marked") {
      return "Not Marked";
    }

    return "Partial";
  };

  const todayAttendance = useMemo(() => {
    if (!isAdministrator) return [];

    return devotees.map((devotee) => {
      const record = attendance.find(
        (item) => item.devoteeId === devotee.id
      );

      return {
        ...devotee,
        attendanceRecord: record || null,
        attendanceStatus: getAttendanceStatus(record),
        morning: record?.morning || "Not Marked",
        evening: record?.evening || "Not Marked",
      };
    });
  }, [devotees, attendance, isAdministrator]);

  const adminStats = useMemo(() => {
    const total = devotees.length;

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
    };
  }, [devotees, todayAttendance]);

  const devoteeTodayAttendance = useMemo(() => {
    const record = attendance.find((item) => item.date === today);

    return {
      status: getAttendanceStatus(record),
      morning: record?.morning || "Not Marked",
      evening: record?.evening || "Not Marked",
    };
  }, [attendance, today]);

  if (loading) {
    return <Loader text="Loading dashboard..." />;
  }

  return (
    <div className="dashboard-page">

      {/* PAGE HEADER */}
      <div className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">
            {isAdministrator ? "BACE ADMINISTRATOR PANEL" : "DEVOTEE PANEL"}
          </span>

          <h1>
            {isAdministrator
              ? "Hare Krishna, Admin 🙏"
              : `Hare Krishna, ${user?.name?.split(" ")[0] || "Devotee"} 🙏`}
          </h1>

          <p>
            {isAdministrator
              ? "Manage and monitor Giri Govardhan BACE activities from one place."
              : "Here is your personal BACE activity overview."}
          </p>
        </div>

        <div className="dashboard-date">
          <span>Today</span>
          <strong>
            {new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </strong>
        </div>
      </div>

      {error && (
        <div className="dashboard-error">
          {error}
        </div>
      )}

      {/* ADMINISTRATOR DASHBOARD */}
      {isAdministrator && (
        <>
          {/* STAT CARDS */}
          <div className="dashboard-stats">

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon devotees">
                ♙
              </div>

              <div>
                <span>Total Devotees</span>
                <strong>{adminStats.total}</strong>
                <small>Registered devotees</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon present">
                ✓
              </div>

              <div>
                <span>Present Today</span>
                <strong>{adminStats.present}</strong>
                <small>Morning + Evening</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon partial">
                ◐
              </div>

              <div>
                <span>Partial Attendance</span>
                <strong>{adminStats.partial}</strong>
                <small>One session marked</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon absent">
                ×
              </div>

              <div>
                <span>Absent Today</span>
                <strong>{adminStats.absent}</strong>
                <small>Both sessions absent</small>
              </div>
            </div>

          </div>

          {/* ATTENDANCE SECTION */}
          <section className="dashboard-card dashboard-attendance-card">

            <div className="dashboard-card-header">
              <div>
                <span className="dashboard-section-label">
                  DAILY ATTENDANCE
                </span>

                <h2>Today&apos;s Attendance</h2>

                <p>
                  Attendance marking overview for all devotees.
                </p>
              </div>

              <Link
                to="/attendance"
                className="dashboard-view-all"
              >
                Mark Attendance →
              </Link>
            </div>

            <div className="attendance-summary">

              <div className="attendance-summary-item present">
                <span className="summary-dot"></span>
                <div>
                  <strong>{adminStats.present}</strong>
                  <small>Present</small>
                </div>
              </div>

              <div className="attendance-summary-item partial">
                <span className="summary-dot"></span>
                <div>
                  <strong>{adminStats.partial}</strong>
                  <small>Partial</small>
                </div>
              </div>

              <div className="attendance-summary-item absent">
                <span className="summary-dot"></span>
                <div>
                  <strong>{adminStats.absent}</strong>
                  <small>Absent</small>
                </div>
              </div>

              <div className="attendance-summary-item leave">
                <span className="summary-dot"></span>
                <div>
                  <strong>{adminStats.leave}</strong>
                  <small>Leave</small>
                </div>
              </div>

              <div className="attendance-summary-item not-marked">
                <span className="summary-dot"></span>
                <div>
                  <strong>{adminStats.notMarked}</strong>
                  <small>Not Marked</small>
                </div>
              </div>

            </div>

            {/* ATTENDANCE TABLE */}
            <div className="dashboard-attendance-table-wrapper">

              <table className="dashboard-attendance-table">

                <thead>
                  <tr>
                    <th>Devotee</th>
                    <th>Morning</th>
                    <th>Evening</th>
                    <th>Overall</th>
                  </tr>
                </thead>

                <tbody>
                  {todayAttendance.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="dashboard-table-empty"
                      >
                        No devotees registered yet.
                      </td>
                    </tr>
                  ) : (
                    todayAttendance.map((devotee) => (
                      <tr key={devotee.id}>

                        <td>
                          <div className="dashboard-devotee-cell">
                            <div className="dashboard-devotee-avatar">
                              {devotee.name
                                ?.charAt(0)
                                ?.toUpperCase() || "D"}
                            </div>

                            <div>
                              <strong>
                                {devotee.name || "Unnamed Devotee"}
                              </strong>

                              <span>
                                {devotee.email || ""}
                              </span>
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

          </section>

          {/* LOWER DASHBOARD CARDS */}
          <div className="dashboard-grid">

            <section className="dashboard-card dashboard-activity-card">

              <div className="dashboard-card-header">
                <div>
                  <span className="dashboard-section-label">
                    BACE ACTIVITIES
                  </span>

                  <h2>Giri Govardhan BACE</h2>

                  <p>
                    Access the main BACE activity sections.
                  </p>
                </div>
              </div>

              <div className="dashboard-management-grid">

                <Link
                  to="/devotees"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">♙</span>

                  <div>
                    <strong>Devotees</strong>
                    <small>Manage devotees</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/sadhana"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">ॐ</span>

                  <div>
                    <strong>Sadhana</strong>
                    <small>Track daily practice</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/seva"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">✦</span>

                  <div>
                    <strong>Seva</strong>
                    <small>Manage seva activities</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/leave"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">◷</span>

                  <div>
                    <strong>Leave</strong>
                    <small>Review leave requests</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

              </div>

            </section>

            <section className="dashboard-card dashboard-profile-card">

              <div className="dashboard-profile-top">
                <div className="dashboard-large-avatar">
                  {user?.name?.charAt(0)?.toUpperCase() || "A"}
                </div>

                <div>
                  <span>Signed in as</span>
                  <h3>{user?.name || "BACE Administrator"}</h3>
                  <p>{user?.email}</p>
                </div>
              </div>

              <div className="dashboard-profile-divider"></div>

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

      {/* DEVOTEE DASHBOARD */}
      {isDevotee && (
        <>
          <div className="dashboard-stats devotee-stats">

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon present">
                ✓
              </div>

              <div>
                <span>Today&apos;s Attendance</span>
                <strong className="stat-text">
                  {devoteeTodayAttendance.status}
                </strong>

                <small>
                  {devoteeTodayAttendance.morning} /{" "}
                  {devoteeTodayAttendance.evening}
                </small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon devotees">
                ◉
              </div>

              <div>
                <span>Morning</span>
                <strong className="stat-text">
                  {devoteeTodayAttendance.morning}
                </strong>

                <small>Morning attendance</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon partial">
                ◐
              </div>

              <div>
                <span>Evening</span>
                <strong className="stat-text">
                  {devoteeTodayAttendance.evening}
                </strong>

                <small>Evening attendance</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon absent">
                ◷
              </div>

              <div>
                <span>My Profile</span>
                <strong className="stat-text">
                  Active
                </strong>

                <small>Account status</small>
              </div>
            </div>

          </div>

          <div className="dashboard-grid devotee-dashboard-grid">

            <section className="dashboard-card dashboard-activity-card">

              <div className="dashboard-card-header">
                <div>
                  <span className="dashboard-section-label">
                    MY BACE ACTIVITY
                  </span>

                  <h2>Personal Dashboard</h2>

                  <p>
                    Manage your personal BACE activities.
                  </p>
                </div>
              </div>

              <div className="dashboard-management-grid">

                <Link
                  to="/devotee-profile"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">♙</span>

                  <div>
                    <strong>My Profile</strong>
                    <small>View your profile</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/attendance"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">✓</span>

                  <div>
                    <strong>Attendance</strong>
                    <small>View your attendance</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/sadhana"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">ॐ</span>

                  <div>
                    <strong>Sadhana</strong>
                    <small>Track your sadhana</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/seva"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">✦</span>

                  <div>
                    <strong>My Seva</strong>
                    <small>View assigned seva</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/leave"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">◷</span>

                  <div>
                    <strong>Leave</strong>
                    <small>Manage your leave</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

                <Link
                  to="/my-room"
                  className="dashboard-management-item"
                >
                  <span className="management-icon">▦</span>

                  <div>
                    <strong>My Room</strong>
                    <small>View room information</small>
                  </div>

                  <span className="management-arrow">→</span>
                </Link>

              </div>

            </section>

            <section className="dashboard-card dashboard-profile-card">

              <div className="dashboard-profile-top">
                <div className="dashboard-large-avatar">
                  {user?.name?.charAt(0)?.toUpperCase() || "D"}
                </div>

                <div>
                  <span>Signed in as</span>
                  <h3>{user?.name || "Devotee"}</h3>
                  <p>{user?.email}</p>
                </div>
              </div>

              <div className="dashboard-profile-divider"></div>

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

export default Dashboard;