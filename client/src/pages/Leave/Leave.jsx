import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Leave.css";

function Leave() {
  const { user, isAdministrator, isDevotee } = useAuth();

  const [requests, setRequests] = useState([]);
  const [devotees, setDevotees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showApplyForm, setShowApplyForm] = useState(false);

  const [form, setForm] = useState({
    from: "",
    to: "",
    reason: "",
  });

  /*
   * ----------------------------------------------------
   * LOAD LEAVE REQUESTS
   * ----------------------------------------------------
   */

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);
    setError("");

    let leaveQuery;

    if (isAdministrator) {
      leaveQuery = query(collection(db, "leaveRequests"));
    } else {
      leaveQuery = query(
        collection(db, "leaveRequests"),
        where("devoteeId", "==", user.uid)
      );
    }

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) => {
          const aDate = a.createdAt?.seconds || 0;
          const bDate = b.createdAt?.seconds || 0;
          return bDate - aDate;
        });

        setRequests(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error("Failed to load leave requests:", firebaseError);
        setError("Unable to load leave requests.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, isAdministrator]);

  /*
   * ----------------------------------------------------
   * LOAD DEVOTEES
   * ADMIN ONLY
   * ----------------------------------------------------
   */

  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
      return;
    }

    const usersQuery = query(
      collection(db, "users"),
      where("role", "==", "devotee")
    );

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          uid: item.id,
          ...item.data(),
        }));

        setDevotees(data);
      },
      (firebaseError) => {
        console.error("Failed to load devotees:", firebaseError);
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
   * ----------------------------------------------------
   * DEVOTEE NAME LOOKUP
   * ----------------------------------------------------
   */

  const devoteeMap = useMemo(() => {
    const map = {};

    devotees.forEach((devotee) => {
      map[devotee.uid] = devotee;
    });

    return map;
  }, [devotees]);

  /*
   * ----------------------------------------------------
   * ADMIN FILTERING
   * DEVOTEE ONLY GETS OWN DATA
   * ----------------------------------------------------
   */

  const filteredRequests = useMemo(() => {
    let result = [...requests];

    if (isAdministrator && search.trim()) {
      const value = search.trim().toLowerCase();

      result = result.filter((request) => {
        const devotee = devoteeMap[request.devoteeId];

        const name =
          devotee?.name ||
          request.devoteeName ||
          "";

        const email =
          devotee?.email ||
          request.devoteeEmail ||
          "";

        return (
          name.toLowerCase().includes(value) ||
          email.toLowerCase().includes(value) ||
          request.id.toLowerCase().includes(value)
        );
      });
    }

    if (statusFilter !== "all") {
      result = result.filter(
        (request) => request.status === statusFilter
      );
    }

    return result;
  }, [
    requests,
    search,
    statusFilter,
    isAdministrator,
    devoteeMap,
  ]);

  /*
   * ----------------------------------------------------
   * STATISTICS
   * ----------------------------------------------------
   */

  const statistics = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter(
        (item) => item.status === "pending"
      ).length,
      approved: requests.filter(
        (item) => item.status === "approved"
      ).length,
      rejected: requests.filter(
        (item) => item.status === "rejected"
      ).length,
    };
  }, [requests]);

  /*
   * ----------------------------------------------------
   * FORM HANDLING
   * ----------------------------------------------------
   */

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  /*
   * ----------------------------------------------------
   * APPLY FOR LEAVE
   * DEVOTEE ONLY
   * ----------------------------------------------------
   */

  const handleApplyLeave = async (event) => {
    event.preventDefault();

    if (!isDevotee || !user?.uid) return;

    setError("");

    if (!form.from || !form.to) {
      setError("Please select both start and end dates.");
      return;
    }

    if (form.from > form.to) {
      setError("End date cannot be before start date.");
      return;
    }

    if (!form.reason.trim()) {
      setError("Please enter a reason for leave.");
      return;
    }

    if (form.reason.trim().length < 3) {
      setError("Please provide a more detailed reason.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "leaveRequests"), {
        devoteeId: user.uid,
        devoteeName: user.name || "",
        devoteeEmail: user.email || "",

        from: form.from,
        to: form.to,
        reason: form.reason.trim(),

        status: "pending",

        adminNote: "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        reviewedBy: null,
        reviewedAt: null,
      });

      setForm({
        from: "",
        to: "",
        reason: "",
      });

      setShowApplyForm(false);
      setError("");
    } catch (firebaseError) {
      console.error("Failed to apply for leave:", firebaseError);
      setError("Unable to submit leave request.");
    } finally {
      setSaving(false);
    }
  };

  /*
   * ----------------------------------------------------
   * ADMIN REVIEW
   * ----------------------------------------------------
   */

  const updateLeaveStatus = async (requestId, status) => {
    if (!isAdministrator || !user?.uid) return;

    const request = requests.find(
      (item) => item.id === requestId
    );

    if (!request) return;

    if (request.status !== "pending") {
      return;
    }

    try {
      setSaving(true);
      setError("");

      await updateDoc(
        doc(db, "leaveRequests", requestId),
        {
          status,
          reviewedBy: user.uid,
          reviewedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );
    } catch (firebaseError) {
      console.error(
        "Failed to update leave request:",
        firebaseError
      );

      setError("Unable to update leave request.");
    } finally {
      setSaving(false);
    }
  };

  /*
   * ----------------------------------------------------
   * DEVOTEE CANCEL
   * ----------------------------------------------------
   */

  const cancelLeave = async (requestId) => {
    if (!isDevotee || !user?.uid) return;

    const request = requests.find(
      (item) => item.id === requestId
    );

    if (!request) return;

    if (request.devoteeId !== user.uid) return;

    if (request.status !== "pending") return;

    try {
      setSaving(true);
      setError("");

      await updateDoc(
        doc(db, "leaveRequests", requestId),
        {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        }
      );
    } catch (firebaseError) {
      console.error(
        "Failed to cancel leave request:",
        firebaseError
      );

      setError("Unable to cancel leave request.");
    } finally {
      setSaving(false);
    }
  };

  /*
   * ----------------------------------------------------
   * HELPERS
   * ----------------------------------------------------
   */

  const getDevoteeName = (request) => {
    if (request.devoteeId === user?.uid) {
      return user?.name || "You";
    }

    return (
      devoteeMap[request.devoteeId]?.name ||
      request.devoteeName ||
      "Unknown devotee"
    );
  };

  const getDevoteeEmail = (request) => {
    if (request.devoteeId === user?.uid) {
      return user?.email || "";
    }

    return (
      devoteeMap[request.devoteeId]?.email ||
      request.devoteeEmail ||
      ""
    );
  };

  const formatDate = (date) => {
    if (!date) return "—";

    const parsed = new Date(`${date}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      cancelled: "Cancelled",
    };

    return labels[status] || "Unknown";
  };

  if (loading) {
    return <Loader text="Loading leave requests..." />;
  }

  /*
   * ====================================================
   * ADMIN VIEW
   * ====================================================
   */

  if (isAdministrator) {
    return (
      <div className="leave-page">
        <header className="leave-header">
          <div>
            <span className="leave-eyebrow">
              COMMUNITY MANAGEMENT
            </span>

            <h1>Leave Requests</h1>

            <p>
              Review and manage leave applications from temple
              residents.
            </p>
          </div>
        </header>

        {error && (
          <div className="leave-error">
            {error}
          </div>
        )}

        <section className="leave-stats">
          <StatCard
            label="Total Requests"
            value={statistics.total}
            description="Community requests"
            type="default"
          />

          <StatCard
            label="Pending"
            value={statistics.pending}
            description="Awaiting review"
            type="pending"
          />

          <StatCard
            label="Approved"
            value={statistics.approved}
            description="Approved requests"
            type="approved"
          />

          <StatCard
            label="Rejected"
            value={statistics.rejected}
            description="Rejected requests"
            type="rejected"
          />
        </section>

        <section className="leave-toolbar">
          <div className="leave-search">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search devotee, email or request ID..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <label className="leave-filter">
            <span>Status</span>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </section>

        <section className="leave-card">
          <div className="leave-card-header">
            <div>
              <span className="leave-card-eyebrow">
                COMMUNITY REQUESTS
              </span>

              <h2>Leave Applications</h2>
            </div>

            <span className="leave-count">
              {filteredRequests.length}{" "}
              {filteredRequests.length === 1
                ? "request"
                : "requests"}
            </span>
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyLeaveState
              title="No leave requests found"
              description="There are no leave requests matching the current filters."
            />
          ) : (
            <div className="leave-list">
              {filteredRequests.map((request) => (
                <LeaveRequest
                  key={request.id}
                  request={request}
                  name={getDevoteeName(request)}
                  email={getDevoteeEmail(request)}
                  formatDate={formatDate}
                  getStatusLabel={getStatusLabel}
                  isAdministrator
                  saving={saving}
                  onApprove={() =>
                    updateLeaveStatus(
                      request.id,
                      "approved"
                    )
                  }
                  onReject={() =>
                    updateLeaveStatus(
                      request.id,
                      "rejected"
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  /*
   * ====================================================
   * DEVOTEE VIEW
   * ====================================================
   */

  if (isDevotee) {
    return (
      <div className="leave-page">
        <header className="leave-header">
          <div>
            <span className="leave-eyebrow">
              MY TEMPLE LIFE
            </span>

            <h1>My Leave</h1>

            <p>
              Apply for leave and track the status of your
              requests.
            </p>
          </div>

          <button
            className="leave-primary-button"
            onClick={() => {
              setShowApplyForm((previous) => !previous);
              setError("");
            }}
          >
            {showApplyForm
              ? "Close Form"
              : "+ Apply for Leave"}
          </button>
        </header>

        {error && (
          <div className="leave-error">
            {error}
          </div>
        )}

        {showApplyForm && (
          <section className="leave-form-card">
            <div className="leave-form-header">
              <div>
                <span className="leave-card-eyebrow">
                  NEW REQUEST
                </span>

                <h2>Apply for Leave</h2>
              </div>
            </div>

            <form
              className="leave-form"
              onSubmit={handleApplyLeave}
            >
              <div className="leave-form-grid">
                <label>
                  <span>From</span>

                  <input
                    type="date"
                    name="from"
                    value={form.from}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  <span>To</span>

                  <input
                    type="date"
                    name="to"
                    value={form.to}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </div>

              <label>
                <span>Reason</span>

                <textarea
                  name="reason"
                  value={form.reason}
                  onChange={handleFormChange}
                  placeholder="Enter the reason for your leave..."
                  rows="4"
                  maxLength="500"
                  required
                />
              </label>

              <div className="leave-form-actions">
                <button
                  type="button"
                  className="leave-secondary-button"
                  onClick={() => {
                    setShowApplyForm(false);
                    setError("");
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="leave-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Submitting..."
                    : "Submit Request"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="leave-stats">
          <StatCard
            label="My Requests"
            value={statistics.total}
            description="Total applications"
            type="default"
          />

          <StatCard
            label="Pending"
            value={statistics.pending}
            description="Awaiting approval"
            type="pending"
          />

          <StatCard
            label="Approved"
            value={statistics.approved}
            description="Approved leave"
            type="approved"
          />

          <StatCard
            label="Rejected"
            value={statistics.rejected}
            description="Rejected requests"
            type="rejected"
          />
        </section>

        <section className="leave-card">
          <div className="leave-card-header">
            <div>
              <span className="leave-card-eyebrow">
                PERSONAL RECORD
              </span>

              <h2>My Leave Applications</h2>
            </div>

            <span className="leave-count">
              {filteredRequests.length}{" "}
              {filteredRequests.length === 1
                ? "request"
                : "requests"}
            </span>
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyLeaveState
              title="No leave requests yet"
              description="You have not submitted any leave applications."
            />
          ) : (
            <div className="leave-list">
              {filteredRequests.map((request) => (
                <LeaveRequest
                  key={request.id}
                  request={request}
                  name="You"
                  email={user.email}
                  formatDate={formatDate}
                  getStatusLabel={getStatusLabel}
                  isAdministrator={false}
                  saving={saving}
                  onCancel={() =>
                    cancelLeave(request.id)
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return null;
}

/*
 * ======================================================
 * STAT CARD
 * ======================================================
 */

function StatCard({
  label,
  value,
  description,
  type,
}) {
  return (
    <article className={`leave-stat-card ${type}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  );
}

/*
 * ======================================================
 * LEAVE REQUEST
 * ======================================================
 */

function LeaveRequest({
  request,
  name,
  email,
  formatDate,
  getStatusLabel,
  isAdministrator,
  saving,
  onApprove,
  onReject,
  onCancel,
}) {
  return (
    <article className="leave-request">
      <div className="leave-request-dates">
        <span>FROM</span>
        <strong>{formatDate(request.from)}</strong>

        <small>
          TO {formatDate(request.to)}
        </small>
      </div>

      <div className="leave-request-main">
        <div className="leave-user">
          <div className="leave-avatar">
            {name?.charAt(0)?.toUpperCase() || "D"}
          </div>

          <div>
            <strong>{name}</strong>
            <small>{email}</small>
          </div>
        </div>

        <p className="leave-reason">
          {request.reason || "No reason provided"}
        </p>

        <span className="leave-request-id">
          Request ID: {request.id}
        </span>

        {request.adminNote && (
          <div className="leave-admin-note">
            <strong>Admin note:</strong>{" "}
            {request.adminNote}
          </div>
        )}
      </div>

      <div className="leave-request-actions">
        <span
          className={`leave-status ${request.status}`}
        >
          {getStatusLabel(request.status)}
        </span>

        {isAdministrator &&
          request.status === "pending" && (
            <div className="leave-review-actions">
              <button
                className="leave-approve-button"
                onClick={onApprove}
                disabled={saving}
              >
                ✓ Approve
              </button>

              <button
                className="leave-reject-button"
                onClick={onReject}
                disabled={saving}
              >
                × Reject
              </button>
            </div>
          )}

        {!isAdministrator &&
          request.status === "pending" && (
            <button
              className="leave-cancel-button"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel Request
            </button>
          )}
      </div>
    </article>
  );
}

/*
 * ======================================================
 * EMPTY STATE
 * ======================================================
 */

function EmptyLeaveState({
  title,
  description,
}) {
  return (
    <div className="leave-empty">
      <div className="leave-empty-icon">◷</div>

      <h3>{title}</h3>

      <p>{description}</p>
    </div>
  );
}

export default Leave;