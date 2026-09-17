import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Reports.css";

/*
|--------------------------------------------------------------------------
| Local Date Helper
|--------------------------------------------------------------------------
| Avoids UTC date problems.
*/
function getToday() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/*
|--------------------------------------------------------------------------
| Reports
|--------------------------------------------------------------------------
*/
function Reports() {
  const {
    user,
    isAdministrator,
    isDevotee,
  } = useAuth();

  const [selectedDate, setSelectedDate] = useState(
    getToday()
  );

  const [devotees, setDevotees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sadhana, setSadhana] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
  |--------------------------------------------------------------------------
  | Load Devotees
  |--------------------------------------------------------------------------
  | Administrator needs the community count.
  */
  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
      return undefined;
    }

    const devoteesQuery = query(
      collection(db, "users"),
      where("role", "==", "devotee")
    );

    const unsubscribe = onSnapshot(
      devoteesQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          uid: item.id,
          ...item.data(),
        }));

        setDevotees(data);
      },
      (firebaseError) => {
        console.error(
          "Failed to load devotees:",
          firebaseError
        );

        setError("Unable to load devotee information.");
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
  |--------------------------------------------------------------------------
  | Load Attendance
  |--------------------------------------------------------------------------
  |
  | Administrator:
  |   Gets all attendance records for selected date.
  |
  | Devotee:
  |   Gets only their own records.
  |
  */
  useEffect(() => {
    if (!user?.uid) return undefined;

    setLoading(true);
    setError("");

    let attendanceQuery;

    if (isAdministrator) {
      attendanceQuery = query(
        collection(db, "attendance"),
        where("date", "==", selectedDate)
      );
    } else {
      attendanceQuery = query(
        collection(db, "attendance"),
        where("devoteeId", "==", user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      attendanceQuery,
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        /*
        | Devotee query is intentionally filtered here by date.
        | This avoids requiring a composite Firestore index.
        */
        const filteredRecords = isAdministrator
          ? records
          : records.filter(
              (item) => item.date === selectedDate
            );

        setAttendance(filteredRecords);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Failed to load attendance reports:",
          firebaseError
        );

        setError(
          "Unable to load attendance reports."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [
    user?.uid,
    isAdministrator,
    selectedDate,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Load Sadhana
  |--------------------------------------------------------------------------
  */
  useEffect(() => {
    if (!user?.uid) return undefined;

    let sadhanaQuery;

    if (isAdministrator) {
      sadhanaQuery = query(
        collection(db, "sadhana"),
        where("date", "==", selectedDate)
      );
    } else {
      sadhanaQuery = query(
        collection(db, "sadhana"),
        where("devoteeId", "==", user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      sadhanaQuery,
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        const filteredRecords = isAdministrator
          ? records
          : records.filter(
              (item) => item.date === selectedDate
            );

        setSadhana(filteredRecords);
      },
      (firebaseError) => {
        console.error(
          "Failed to load sadhana reports:",
          firebaseError
        );

        setError(
          "Unable to load sadhana reports."
        );
      }
    );

    return () => unsubscribe();
  }, [
    user?.uid,
    isAdministrator,
    selectedDate,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Load Leave Requests
  |--------------------------------------------------------------------------
  |
  | Administrator -> all leave requests
  | Devotee -> own leave requests
  */
  useEffect(() => {
    if (!user?.uid) return undefined;

    let leaveQuery;

    if (isAdministrator) {
      leaveQuery = query(
        collection(db, "leaveRequests")
      );
    } else {
      leaveQuery = query(
        collection(db, "leaveRequests"),
        where("devoteeId", "==", user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setLeaveRequests(records);
      },
      (firebaseError) => {
        console.error(
          "Failed to load leave reports:",
          firebaseError
        );

        setError(
          "Unable to load leave reports."
        );
      }
    );

    return () => unsubscribe();
  }, [
    user?.uid,
    isAdministrator,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Administrator Calculations
  |--------------------------------------------------------------------------
  */

  const communityReport = useMemo(() => {
    const totalDevotees = devotees.length;

    const presentCount = attendance.filter(
      (item) =>
        item.morning === "Present" &&
        item.evening === "Present"
    ).length;

    const morningPresent = attendance.filter(
      (item) => item.morning === "Present"
    ).length;

    const eveningPresent = attendance.filter(
      (item) => item.evening === "Present"
    ).length;

    const leaveCount = attendance.filter(
      (item) =>
        item.morning === "Leave" ||
        item.evening === "Leave"
    ).length;

    const absentCount = attendance.filter(
      (item) =>
        item.morning === "Absent" ||
        item.evening === "Absent"
    ).length;

    const totalRounds = sadhana.reduce(
      (total, item) =>
        total + Number(item.rounds || 0),
      0
    );

    const averageRounds =
      sadhana.length > 0
        ? Math.round(
            totalRounds / sadhana.length
          )
        : 0;

    const pendingLeaves = leaveRequests.filter(
      (item) => item.status === "pending"
    ).length;

    const approvedLeaves = leaveRequests.filter(
      (item) => item.status === "approved"
    ).length;

    const rejectedLeaves = leaveRequests.filter(
      (item) => item.status === "rejected"
    ).length;

    return {
      totalDevotees,
      presentCount,
      morningPresent,
      eveningPresent,
      leaveCount,
      absentCount,
      totalRounds,
      averageRounds,
      pendingLeaves,
      approvedLeaves,
      rejectedLeaves,
    };
  }, [
    devotees,
    attendance,
    sadhana,
    leaveRequests,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Devotee Personal Calculations
  |--------------------------------------------------------------------------
  */
  const personalReport = useMemo(() => {
    const todayAttendance = attendance[0];

    const morningPresent =
      todayAttendance?.morning === "Present";

    const eveningPresent =
      todayAttendance?.evening === "Present";

    const morningLeave =
      todayAttendance?.morning === "Leave";

    const eveningLeave =
      todayAttendance?.evening === "Leave";

    const attendanceStatus =
      morningLeave || eveningLeave
        ? "On Leave"
        : morningPresent && eveningPresent
          ? "Present"
          : todayAttendance
            ? "Partial"
            : "Not Recorded";

    const totalRounds = sadhana.reduce(
      (total, item) =>
        total + Number(item.rounds || 0),
      0
    );

    const totalSadhanaDays = sadhana.length;

    const averageRounds =
      totalSadhanaDays > 0
        ? Math.round(
            totalRounds / totalSadhanaDays
          )
        : 0;

    const approvedLeaves = leaveRequests.filter(
      (item) => item.status === "approved"
    );

    const pendingLeaves = leaveRequests.filter(
      (item) => item.status === "pending"
    );

    const rejectedLeaves = leaveRequests.filter(
      (item) => item.status === "rejected"
    );

    const leaveDays = approvedLeaves.reduce(
      (total, item) => {
        return (
          total +
          calculateDays(
            item.from,
            item.to
          )
        );
      },
      0
    );

    return {
      attendanceStatus,
      morningStatus:
        todayAttendance?.morning ||
        "Not Recorded",
      eveningStatus:
        todayAttendance?.evening ||
        "Not Recorded",

      totalRounds,
      averageRounds,
      totalSadhanaDays,

      approvedLeaves:
        approvedLeaves.length,

      pendingLeaves:
        pendingLeaves.length,

      rejectedLeaves:
        rejectedLeaves.length,

      leaveDays,
    };
  }, [
    attendance,
    sadhana,
    leaveRequests,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */
  if (loading) {
    return (
      <Loader text="Loading reports..." />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Invalid Role
  |--------------------------------------------------------------------------
  */
  if (!isAdministrator && !isDevotee) {
    return (
      <div className="reports-page">
        <section className="report-panel">
          <h2>Reports unavailable</h2>
          <p>
            Your account role could not be verified.
          </p>
        </section>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Main Page
  |--------------------------------------------------------------------------
  */
  return (
    <div className="reports-page">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">
            {isAdministrator
              ? "COMMUNITY ANALYTICS"
              : "PERSONAL ANALYTICS"}
          </span>

          <h1>
            {isAdministrator
              ? "Reports"
              : "My Reports"}
          </h1>

          <p>
            {isAdministrator
              ? "Community-level operational and spiritual statistics."
              : "Your personal temple activity summary."}
          </p>
        </div>

        <div className="report-date-control">
          <label htmlFor="report-date">
            Report Date
          </label>

          <input
            id="report-date"
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(
                event.target.value
              )
            }
          />
        </div>
      </div>

      {error && (
        <div className="report-error">
          {error}
        </div>
      )}

      {/* ================================================================
          ADMINISTRATOR REPORT
      ================================================================= */}

      {isAdministrator && (
        <>
          <h2 className="report-section-title">
            Community Overview
          </h2>

          <div className="report-grid">
            <ReportCard
              label="Total Devotees"
              value={
                communityReport.totalDevotees
              }
              description="Registered devotees"
            />

            <ReportCard
              label="Full Attendance"
              value={
                communityReport.presentCount
              }
              description="Present morning and evening"
              type="success"
            />

            <ReportCard
              label="On Leave"
              value={
                communityReport.leaveCount
              }
              description="Attendance marked on leave"
              type="warning"
            />

            <ReportCard
              label="Average Japa"
              value={
                communityReport.averageRounds
              }
              description="Rounds per recorded devotee"
              type="primary"
            />
          </div>

          <section className="report-panel">
            <div className="report-panel-header">
              <div>
                <span className="page-eyebrow">
                  ATTENDANCE
                </span>

                <h2>
                  Attendance Distribution
                </h2>
              </div>

              <span className="report-date-label">
                {formatDate(selectedDate)}
              </span>
            </div>

            <div className="distribution">
              <DistributionItem
                label="Full Present"
                value={
                  communityReport.presentCount
                }
              />

              <DistributionItem
                label="Morning Present"
                value={
                  communityReport.morningPresent
                }
              />

              <DistributionItem
                label="Evening Present"
                value={
                  communityReport.eveningPresent
                }
              />

              <DistributionItem
                label="Leave"
                value={
                  communityReport.leaveCount
                }
              />

              <DistributionItem
                label="Absent"
                value={
                  communityReport.absentCount
                }
              />

              <DistributionItem
                label="Recorded"
                value={attendance.length}
              />
            </div>
          </section>

          <section className="report-panel">
            <div className="report-panel-header">
              <div>
                <span className="page-eyebrow">
                  SADHANA
                </span>

                <h2>
                  Sadhana Overview
                </h2>
              </div>
            </div>

            <div className="report-grid report-grid-three">
              <ReportCard
                label="Total Rounds"
                value={
                  communityReport.totalRounds
                }
                description="Community rounds"
              />

              <ReportCard
                label="Average Rounds"
                value={
                  communityReport.averageRounds
                }
                description="Per recorded devotee"
              />

              <ReportCard
                label="Records"
                value={sadhana.length}
                description="Sadhana records"
              />
            </div>
          </section>

          <section className="report-panel">
            <div className="report-panel-header">
              <div>
                <span className="page-eyebrow">
                  LEAVE
                </span>

                <h2>
                  Leave Overview
                </h2>
              </div>
            </div>

            <div className="distribution">
              <DistributionItem
                label="Pending"
                value={
                  communityReport.pendingLeaves
                }
              />

              <DistributionItem
                label="Approved"
                value={
                  communityReport.approvedLeaves
                }
              />

              <DistributionItem
                label="Rejected"
                value={
                  communityReport.rejectedLeaves
                }
              />
            </div>
          </section>
        </>
      )}

      {/* ================================================================
          DEVOTEE REPORT
      ================================================================= */}

      {isDevotee && (
        <>
          <h2 className="report-section-title">
            My Activity
          </h2>

          <div className="report-grid">
            <ReportCard
              label="Attendance"
              value={
                personalReport.attendanceStatus
              }
              description={formatDate(
                selectedDate
              )}
              type="success"
            />

            <ReportCard
              label="Today's Japa"
              value={
                getCurrentRounds(sadhana)
              }
              description="Rounds recorded"
              type="primary"
            />

            <ReportCard
              label="Sadhana Days"
              value={
                personalReport.totalSadhanaDays
              }
              description="Recorded days"
            />

            <ReportCard
              label="Leave Days"
              value={
                personalReport.leaveDays
              }
              description="Approved leave days"
              type="warning"
            />
          </div>

          <section className="report-panel">
            <div className="report-panel-header">
              <div>
                <span className="page-eyebrow">
                  MY ATTENDANCE
                </span>

                <h2>
                  Attendance Details
                </h2>
              </div>

              <span className="report-status-badge">
                {personalReport.attendanceStatus}
              </span>
            </div>

            <div className="personal-details">
              <DetailItem
                label="Morning"
                value={
                  personalReport.morningStatus
                }
              />

              <DetailItem
                label="Evening"
                value={
                  personalReport.eveningStatus
                }
              />

              <DetailItem
                label="Date"
                value={formatDate(
                  selectedDate
                )}
              />
            </div>
          </section>

          <section className="report-panel">
            <div className="report-panel-header">
              <div>
                <span className="page-eyebrow">
                  MY SADHANA
                </span>

                <h2>
                  Sadhana Summary
                </h2>
              </div>
            </div>

            <div className="personal-details">
              <DetailItem
                label="Selected Day Rounds"
                value={getCurrentRounds(
                  sadhana
                )}
              />

              <DetailItem
                label="Average Rounds"
                value={
                  personalReport.averageRounds
                }
              />

              <DetailItem
                label="Recorded Days"
                value={
                  personalReport.totalSadhanaDays
                }
              />

              <DetailItem
                label="Total Recorded Rounds"
                value={
                  personalReport.totalRounds
                }
              />
            </div>
          </section>

          <section className="report-panel">
            <div className="report-panel-header">
              <div>
                <span className="page-eyebrow">
                  MY LEAVE
                </span>

                <h2>
                  Leave Summary
                </h2>
              </div>
            </div>

            <div className="personal-details">
              <DetailItem
                label="Approved Requests"
                value={
                  personalReport.approvedLeaves
                }
              />

              <DetailItem
                label="Pending Requests"
                value={
                  personalReport.pendingLeaves
                }
              />

              <DetailItem
                label="Rejected Requests"
                value={
                  personalReport.rejectedLeaves
                }
              />

              <DetailItem
                label="Approved Leave Days"
                value={
                  personalReport.leaveDays
                }
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Report Card
|--------------------------------------------------------------------------
*/
function ReportCard({
  label,
  value,
  description,
  type = "",
}) {
  return (
    <article
      className={`report-card ${type}`}
    >
      <span>{label}</span>

      <strong>{value}</strong>

      <small>{description}</small>
    </article>
  );
}

/*
|--------------------------------------------------------------------------
| Distribution Item
|--------------------------------------------------------------------------
*/
function DistributionItem({
  label,
  value,
}) {
  return (
    <div>
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Personal Detail
|--------------------------------------------------------------------------
*/
function DetailItem({
  label,
  value,
}) {
  return (
    <div className="personal-detail-item">
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| Get Current Day Rounds
|--------------------------------------------------------------------------
*/
function getCurrentRounds(records) {
  return records.reduce(
    (total, item) =>
      total + Number(item.rounds || 0),
    0
  );
}

/*
|--------------------------------------------------------------------------
| Calculate Leave Days
|--------------------------------------------------------------------------
*/
function calculateDays(from, to) {
  if (!from || !to) {
    return 0;
  }

  const start = new Date(
    `${from}T00:00:00`
  );

  const end = new Date(
    `${to}T00:00:00`
  );

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0;
  }

  const difference =
    end.getTime() - start.getTime();

  const days =
    Math.floor(
      difference / 86400000
    ) + 1;

  return Math.max(days, 0);
}

/*
|--------------------------------------------------------------------------
| Format Date
|--------------------------------------------------------------------------
*/
function formatDate(value) {
  if (!value) {
    return "Not selected";
  }

  const date = new Date(
    `${value}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

export default Reports;