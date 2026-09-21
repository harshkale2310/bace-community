import { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
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

/*
 * ============================================================
 * NOTIFICATION HELPER
 * ============================================================
 *
 * Notification failures are intentionally isolated from the
 * main leave operation. A leave request should still be saved
 * even if notification delivery encounters an error.
 */
async function createNotification({
  recipientId,
  type,
  title,
  message,
  metadata = {},
}) {
  if (!recipientId) {
    return;
  }

  try {
    await addDoc(collection(db, "notifications"), {
      recipientId,
      type,
      title,
      message,
      read: false,
      createdAt: serverTimestamp(),
      ...metadata,
    });
  } catch (notificationError) {
    console.warn(
      "Notification could not be created:",
      notificationError
    );
  }
}

/*
 * ============================================================
 * NOTIFY ACTIVE ADMINISTRATORS
 * ============================================================
 */
async function notifyActiveAdministrators({
  type,
  title,
  message,
  metadata = {},
}) {
  try {
    const administratorsQuery = query(
      collection(db, "users"),
      where("role", "==", "administrator"),
      where("status", "==", "active")
    );

    const snapshot = await getDocs(
      administratorsQuery
    );

    if (snapshot.empty) {
      return;
    }

    await Promise.all(
      snapshot.docs.map((administrator) =>
        createNotification({
          recipientId: administrator.id,
          type,
          title,
          message,
          metadata,
        })
      )
    );
  } catch (notificationError) {
    console.warn(
      "Administrator notifications could not be created:",
      notificationError
    );
  }
}

function Leave() {
  const { user, isAdministrator, isDevotee } =
    useAuth();

  const [requests, setRequests] = useState([]);
  const [devotees, setDevotees] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [devoteesLoading, setDevoteesLoading] =
    useState(isAdministrator);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [showApplyForm, setShowApplyForm] =
    useState(false);

  const [form, setForm] = useState({
    from: "",
    to: "",
    reason: "",
  });

  /*
   * ============================================================
   * LOAD LEAVE REQUESTS
   * ============================================================
   */
  useEffect(() => {
    if (!user?.uid) {
      setRequests([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    let leaveQuery;

    if (isAdministrator) {
      leaveQuery = query(
        collection(db, "leaveRequests")
      );
    } else {
      leaveQuery = query(
        collection(db, "leaveRequests"),
        where(
          "devoteeId",
          "==",
          user.uid
        )
      );
    }

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        const data = snapshot.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        data.sort((a, b) => {
          const aSeconds =
            a.createdAt?.seconds || 0;

          const bSeconds =
            b.createdAt?.seconds || 0;

          return bSeconds - aSeconds;
        });

        setRequests(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Failed to load leave requests:",
          firebaseError
        );

        setRequests([]);

        setError(
          "Unable to load leave requests. Please check your Firestore permissions."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, isAdministrator]);

  /*
   * ============================================================
   * LOAD DEVOTEES
   * ADMIN ONLY
   * ============================================================
   */
  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
      setDevoteesLoading(false);
      return undefined;
    }

    setDevoteesLoading(true);

    const usersQuery = query(
      collection(db, "users"),
      where(
        "role",
        "==",
        "devotee"
      )
    );

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const data = snapshot.docs.map(
          (item) => ({
            uid: item.id,
            ...item.data(),
          })
        );

        setDevotees(data);
        setDevoteesLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Failed to load devotees:",
          firebaseError
        );

        setDevotees([]);
        setDevoteesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
   * ============================================================
   * LOAD ROOMS
   * ============================================================
   */
  useEffect(() => {
    if (!user?.uid) {
      setRooms([]);
      return undefined;
    }

    let roomsQuery;

    if (isAdministrator) {
      roomsQuery = query(
        collection(db, "rooms")
      );
    } else {
      roomsQuery = query(
        collection(db, "rooms"),
        where(
          "occupants",
          "array-contains",
          user.uid
        )
      );
    }

    const unsubscribe = onSnapshot(
      roomsQuery,
      (snapshot) => {
        const data = snapshot.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        setRooms(data);
      },
      (firebaseError) => {
        console.error(
          "Failed to load rooms:",
          firebaseError
        );

        setRooms([]);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, isAdministrator]);

  /*
   * ============================================================
   * ACTIVE DEVOTEE IDS
   * ============================================================
   */
  const activeDevoteeIds = useMemo(() => {
    const ids = new Set();

    devotees.forEach((devotee) => {
      const status = String(
        devotee.status || ""
      )
        .trim()
        .toLowerCase();

      if (status === "active") {
        ids.add(devotee.uid);
      }
    });

    return ids;
  }, [devotees]);

  /*
   * ============================================================
   * VISIBLE REQUESTS
   * ============================================================
   */
  const visibleRequests = useMemo(() => {
    if (!isAdministrator) {
      return requests;
    }

    if (devoteesLoading) {
      return [];
    }

    return requests.filter((request) => {
      if (!request.devoteeId) {
        return false;
      }

      return activeDevoteeIds.has(
        request.devoteeId
      );
    });
  }, [
    requests,
    isAdministrator,
    devoteesLoading,
    activeDevoteeIds,
  ]);

  /*
   * ============================================================
   * DEVOTEE LOOKUP
   * ============================================================
   */
  const devoteeMap = useMemo(() => {
    const map = {};

    devotees.forEach((devotee) => {
      map[devotee.uid] = devotee;
    });

    return map;
  }, [devotees]);

  /*
   * ============================================================
   * ROOM LOOKUP
   * ============================================================
   */
  const roomMap = useMemo(() => {
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
          map[occupantId] = [];
        }

        map[occupantId].push(room);
      });
    });

    return map;
  }, [rooms]);

  /*
   * ============================================================
   * GET ROOMS FOR DEVOTEE
   * ============================================================
   */
  const getDevoteeRooms = (devoteeId) => {
    if (!devoteeId) {
      return [];
    }

    return roomMap[devoteeId] || [];
  };

  /*
   * ============================================================
   * ROOM IDENTITY
   * ============================================================
   */
  const getRoomIdentity = (room) => {
    if (!room) {
      return "";
    }

    const floor =
      room.floor !== undefined &&
      room.floor !== null &&
      room.floor !== ""
        ? `Floor ${room.floor}`
        : "";

    const roomNumber =
      room.roomNumber !== undefined &&
      room.roomNumber !== null &&
      room.roomNumber !== ""
        ? `Room ${room.roomNumber}`
        : "";

    const roomName =
      room.roomName || "";

    return [
      floor,
      roomNumber,
      roomName,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  /*
   * ============================================================
   * ROOM LABEL
   * ============================================================
   */
  const getDevoteeRoomLabel = (
    devoteeId
  ) => {
    const devoteeRooms =
      getDevoteeRooms(devoteeId);

    if (!devoteeRooms.length) {
      return "Residence not assigned";
    }

    const labels = devoteeRooms
      .map((room) =>
        getRoomIdentity(room)
      )
      .filter(Boolean);

    if (!labels.length) {
      return "Residence assigned";
    }

    return labels.join(" • ");
  };

  /*
   * ============================================================
   * FILTER REQUESTS
   * ============================================================
   */
  const filteredRequests = useMemo(() => {
    let result = [...visibleRequests];

    if (
      isAdministrator &&
      search.trim()
    ) {
      const value = search
        .trim()
        .toLowerCase();

      result = result.filter(
        (request) => {
          const devotee =
            devoteeMap[
              request.devoteeId
            ];

          const name =
            devotee?.name ||
            request.devoteeName ||
            "";

          const email =
            devotee?.email ||
            request.devoteeEmail ||
            "";

          const roomIdentity =
            getDevoteeRoomLabel(
              request.devoteeId
            ).toLowerCase();

          const reason = String(
            request.reason || ""
          ).toLowerCase();

          return (
            name
              .toLowerCase()
              .includes(value) ||
            email
              .toLowerCase()
              .includes(value) ||
            roomIdentity.includes(
              value
            ) ||
            reason.includes(value)
          );
        }
      );
    }

    if (
      statusFilter !== "all"
    ) {
      result = result.filter(
        (request) =>
          normalizeStatus(
            request.status
          ) === statusFilter
      );
    }

    return result;
  }, [
    visibleRequests,
    search,
    statusFilter,
    isAdministrator,
    devoteeMap,
    roomMap,
  ]);

  /*
   * ============================================================
   * STATISTICS
   * ============================================================
   */
  const statistics = useMemo(() => {
    return {
      total:
        visibleRequests.length,

      pending:
        visibleRequests.filter(
          (item) =>
            normalizeStatus(
              item.status
            ) === "pending"
        ).length,

      approved:
        visibleRequests.filter(
          (item) =>
            normalizeStatus(
              item.status
            ) === "approved"
        ).length,

      rejected:
        visibleRequests.filter(
          (item) =>
            normalizeStatus(
              item.status
            ) === "rejected"
        ).length,

      cancelled:
        visibleRequests.filter(
          (item) =>
            normalizeStatus(
              item.status
            ) === "cancelled"
        ).length,
    };
  }, [visibleRequests]);

  /*
   * ============================================================
   * FORM HANDLING
   * ============================================================
   */
  const handleFormChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setSuccess("");
  };

  /*
   * ============================================================
   * APPLY FOR LEAVE
   * ============================================================
   */
  const handleApplyLeave = async (
    event
  ) => {
    event.preventDefault();

    if (
      !isDevotee ||
      !user?.uid
    ) {
      return;
    }

    setError("");
    setSuccess("");

    const from =
      form.from.trim();

    const to =
      form.to.trim();

    const reason =
      form.reason.trim();

    if (!from || !to) {
      setError(
        "Please select both start and end dates."
      );
      return;
    }

    if (from > to) {
      setError(
        "End date cannot be before start date."
      );
      return;
    }

    if (!reason) {
      setError(
        "Please enter a reason for leave."
      );
      return;
    }

    if (reason.length < 3) {
      setError(
        "Please provide a more detailed reason."
      );
      return;
    }

    try {
      setSaving(true);

      await addDoc(
        collection(
          db,
          "leaveRequests"
        ),
        {
          devoteeId:
            user.uid,

          devoteeName:
            user.name || "",

          devoteeEmail:
            user.email || "",

          from,
          to,
          reason,

          status:
            "pending",

          adminNote:
            "",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),

          reviewedBy:
            null,

          reviewedAt:
            null,
        }
      );

      /*
       * Notify all active administrators.
       *
       * This is deliberately performed after the leave
       * request has been successfully saved.
       */
      await notifyActiveAdministrators({
        type: "leave_request",
        title: "New Leave Request",
        message: `A new leave request has been submitted by ${
          user.name || "a community resident"
        }.`,
        metadata: {
          devoteeId: user.uid,
          from,
          to,
        },
      });

      setForm({
        from: "",
        to: "",
        reason: "",
      });

      setShowApplyForm(false);

      setSuccess(
        "Your leave request has been submitted successfully."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to apply for leave:",
        firebaseError
      );

      setError(
        "Unable to submit your leave request. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ============================================================
   * ADMIN REVIEW
   * ============================================================
   */
  const updateLeaveStatus = async (
    requestId,
    status
  ) => {
    if (
      !isAdministrator ||
      !user?.uid
    ) {
      return;
    }

    const request =
      requests.find(
        (item) =>
          item.id === requestId
      );

    if (!request) {
      return;
    }

    if (
      !activeDevoteeIds.has(
        request.devoteeId
      )
    ) {
      setError(
        "This leave request belongs to an inactive or deleted devotee."
      );
      return;
    }

    if (
      normalizeStatus(
        request.status
      ) !== "pending"
    ) {
      return;
    }

    if (
      status !== "approved" &&
      status !== "rejected"
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateDoc(
        doc(
          db,
          "leaveRequests",
          requestId
        ),
        {
          status,

          reviewedBy:
            user.uid,

          reviewedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
       * Notify the devotee after the leave request
       * has been successfully updated.
       */
      const devoteeName =
        devoteeMap[
          request.devoteeId
        ]?.name ||
        request.devoteeName ||
        "your";

      const formattedFrom =
        formatDate(request.from);

      const formattedTo =
        formatDate(request.to);

      const dateMessage =
        request.from === request.to
          ? formattedFrom
          : `${formattedFrom} to ${formattedTo}`;

      if (status === "approved") {
        await createNotification({
          recipientId:
            request.devoteeId,

          type:
            "leave_approved",

          title:
            "Leave Approved",

          message:
            `Your leave request for ${dateMessage} has been approved.`,

          metadata: {
            leaveRequestId:
              requestId,
            from:
              request.from,
            to:
              request.to,
          },
        });
      }

      if (status === "rejected") {
        await createNotification({
          recipientId:
            request.devoteeId,

          type:
            "leave_rejected",

          title:
            "Leave Rejected",

          message:
            `Your leave request for ${dateMessage} has been declined.`,

          metadata: {
            leaveRequestId:
              requestId,
            from:
              request.from,
            to:
              request.to,
          },
        });
      }

      setSuccess(
        status === "approved"
          ? "Leave request approved successfully."
          : "Leave request declined successfully."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to update leave request:",
        firebaseError
      );

      setError(
        "Unable to update leave request."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ============================================================
   * ADMIN DELETE LEAVE REQUEST
   * ============================================================
   */
  const deleteLeaveRequest = async (
    requestId
  ) => {
    if (
      !isAdministrator ||
      !user?.uid
    ) {
      return;
    }

    const request =
      requests.find(
        (item) =>
          item.id === requestId
      );

    if (!request) {
      return;
    }

    const name =
      devoteeMap[
        request.devoteeId
      ]?.name ||
      request.devoteeName ||
      "this devotee";

    const confirmed =
      window.confirm(
        `Delete this leave request from ${name}?\n\nThis will permanently remove the request from the leave records.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await deleteDoc(
        doc(
          db,
          "leaveRequests",
          requestId
        )
      );

      setSuccess(
        "Leave request deleted successfully."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to delete leave request:",
        firebaseError
      );

      setError(
        "Unable to delete leave request. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ============================================================
   * DEVOTEE CANCEL
   * ============================================================
   */
  const cancelLeave = async (
    requestId
  ) => {
    if (
      !isDevotee ||
      !user?.uid
    ) {
      return;
    }

    const request =
      requests.find(
        (item) =>
          item.id === requestId
      );

    if (!request) {
      return;
    }

    if (
      request.devoteeId !==
      user.uid
    ) {
      return;
    }

    if (
      normalizeStatus(
        request.status
      ) !== "pending"
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateDoc(
        doc(
          db,
          "leaveRequests",
          requestId
        ),
        {
          status:
            "cancelled",

          updatedAt:
            serverTimestamp(),
        }
      );

      setSuccess(
        "Your leave request has been cancelled."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to cancel leave request:",
        firebaseError
      );

      setError(
        "Unable to cancel leave request."
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * ============================================================
   * NAME
   * ============================================================
   */
  const getDevoteeName = (
    request
  ) => {
    if (
      request.devoteeId ===
      user?.uid
    ) {
      return (
        user?.name ||
        "You"
      );
    }

    return (
      devoteeMap[
        request.devoteeId
      ]?.name ||
      request.devoteeName ||
      "Community resident"
    );
  };

  /*
   * ============================================================
   * EMAIL
   * ============================================================
   */
  const getDevoteeEmail = (
    request
  ) => {
    if (
      request.devoteeId ===
      user?.uid
    ) {
      return (
        user?.email ||
        ""
      );
    }

    return (
      devoteeMap[
        request.devoteeId
      ]?.email ||
      request.devoteeEmail ||
      ""
    );
  };

  /*
   * ============================================================
   * DATE FORMAT
   * ============================================================
   */
  const formatDate = (
    date
  ) => {
    if (!date) {
      return "—";
    }

    const parsed =
      new Date(
        `${date}T00:00:00`
      );

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return date;
    }

    return parsed.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  /*
   * ============================================================
   * STATUS
   * ============================================================
   */
  const getStatusLabel = (
    status
  ) => {
    const normalized =
      normalizeStatus(
        status
      );

    const labels = {
      pending:
        "Pending",

      approved:
        "Approved",

      rejected:
        "Rejected",

      cancelled:
        "Cancelled",
    };

    return (
      labels[
        normalized
      ] || "Pending"
    );
  };

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */
  if (
    loading ||
    (
      isAdministrator &&
      devoteesLoading
    )
  ) {
    return (
      <Loader text="Loading leave requests..." />
    );
  }

  /*
   * ============================================================
   * ADMIN VIEW
   * ============================================================
   */
  if (isAdministrator) {
    return (
      <div className="leave-page">
        <header className="leave-header">
          <div>
            <span className="leave-eyebrow">
              COMMUNITY SERVICES
            </span>

            <h1>
              Leave Requests
            </h1>

            <p>
              Review and manage leave applications
              from community residents.
            </p>
          </div>
        </header>

        {error && (
          <div className="leave-error">
            {error}
          </div>
        )}

        {success && (
          <div className="leave-success">
            {success}
          </div>
        )}

        <section className="leave-stats">
          <StatCard
            label="Total Requests"
            value={
              statistics.total
            }
            description="Active community requests"
            type="default"
          />

          <StatCard
            label="Pending"
            value={
              statistics.pending
            }
            description="Awaiting review"
            type="pending"
          />

          <StatCard
            label="Approved"
            value={
              statistics.approved
            }
            description="Approved requests"
            type="approved"
          />

          <StatCard
            label="Rejected"
            value={
              statistics.rejected
            }
            description="Rejected requests"
            type="rejected"
          />
        </section>

        <section className="leave-toolbar">
          <div className="leave-search">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search devotee, email, residence or reason..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
            />
          </div>

          <label className="leave-filter">
            <span>
              Status
            </span>

            <select
              value={
                statusFilter
              }
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Status
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="approved">
                Approved
              </option>

              <option value="rejected">
                Rejected
              </option>

              <option value="cancelled">
                Cancelled
              </option>
            </select>
          </label>
        </section>

        <section className="leave-card">
          <div className="leave-card-header">
            <div>
              <span className="leave-card-eyebrow">
                COMMUNITY REQUESTS
              </span>

              <h2>
                Leave Applications
              </h2>
            </div>

            <span className="leave-count">
              {
                filteredRequests.length
              }{" "}
              {filteredRequests.length ===
              1
                ? "request"
                : "requests"}
            </span>
          </div>

          {filteredRequests.length ===
          0 ? (
            <EmptyLeaveState
              title="No leave requests found"
              description="There are no leave requests matching the current filters."
            />
          ) : (
            <div className="leave-list">
              {filteredRequests.map(
                (request) => (
                  <LeaveRequest
                    key={request.id}
                    request={request}
                    name={getDevoteeName(
                      request
                    )}
                    email={getDevoteeEmail(
                      request
                    )}
                    roomIdentity={getDevoteeRoomLabel(
                      request.devoteeId
                    )}
                    formatDate={
                      formatDate
                    }
                    getStatusLabel={
                      getStatusLabel
                    }
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
                    onDelete={() =>
                      deleteLeaveRequest(
                        request.id
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  /*
   * ============================================================
   * DEVOTEE VIEW
   * ============================================================
   */
  if (isDevotee) {
    return (
      <div className="leave-page">
        <header className="leave-header">
          <div>
            <span className="leave-eyebrow">
              MY COMMUNITY LIFE
            </span>

            <h1>
              My Leave
            </h1>

            <p>
              Apply for leave and track the
              status of your requests.
            </p>
          </div>

          <button
            type="button"
            className="leave-primary-button"
            onClick={() => {
              setShowApplyForm(
                (previous) =>
                  !previous
              );

              setError("");
              setSuccess("");
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

        {success && (
          <div className="leave-success">
            {success}
          </div>
        )}

        {showApplyForm && (
          <section className="leave-form-card">
            <div className="leave-form-header">
              <div>
                <span className="leave-card-eyebrow">
                  NEW REQUEST
                </span>

                <h2>
                  Apply for Leave
                </h2>
              </div>
            </div>

            <form
              className="leave-form"
              onSubmit={
                handleApplyLeave
              }
            >
              <div className="leave-form-grid">
                <label>
                  <span>
                    From
                  </span>

                  <input
                    type="date"
                    name="from"
                    value={
                      form.from
                    }
                    onChange={
                      handleFormChange
                    }
                    required
                  />
                </label>

                <label>
                  <span>
                    To
                  </span>

                  <input
                    type="date"
                    name="to"
                    value={
                      form.to
                    }
                    min={
                      form.from ||
                      undefined
                    }
                    onChange={
                      handleFormChange
                    }
                    required
                  />
                </label>
              </div>

              <label>
                <span>
                  Reason
                </span>

                <textarea
                  name="reason"
                  value={
                    form.reason
                  }
                  onChange={
                    handleFormChange
                  }
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
                    setShowApplyForm(
                      false
                    );

                    setForm({
                      from: "",
                      to: "",
                      reason: "",
                    });

                    setError("");
                    setSuccess("");
                  }}
                  disabled={
                    saving
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="leave-primary-button"
                  disabled={
                    saving
                  }
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
            value={
              statistics.total
            }
            description="Total applications"
            type="default"
          />

          <StatCard
            label="Pending"
            value={
              statistics.pending
            }
            description="Awaiting approval"
            type="pending"
          />

          <StatCard
            label="Approved"
            value={
              statistics.approved
            }
            description="Approved leave"
            type="approved"
          />

          <StatCard
            label="Rejected"
            value={
              statistics.rejected
            }
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

              <h2>
                My Leave Applications
              </h2>
            </div>

            <span className="leave-count">
              {
                filteredRequests.length
              }{" "}
              {filteredRequests.length ===
              1
                ? "request"
                : "requests"}
            </span>
          </div>

          {filteredRequests.length ===
          0 ? (
            <EmptyLeaveState
              title="No leave requests yet"
              description="You have not submitted any leave applications."
            />
          ) : (
            <div className="leave-list">
              {filteredRequests.map(
                (request) => (
                  <LeaveRequest
                    key={request.id}
                    request={request}
                    name="You"
                    email={
                      user?.email ||
                      ""
                    }
                    roomIdentity={getDevoteeRoomLabel(
                      user?.uid
                    )}
                    formatDate={
                      formatDate
                    }
                    getStatusLabel={
                      getStatusLabel
                    }
                    isAdministrator={
                      false
                    }
                    saving={saving}
                    onCancel={() =>
                      cancelLeave(
                        request.id
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  return null;
}

/*
 * ============================================================
 * NORMALIZE STATUS
 * ============================================================
 */
function normalizeStatus(
  status
) {
  const value = String(
    status || "pending"
  )
    .trim()
    .toLowerCase();

  if (
    [
      "pending",
      "approved",
      "rejected",
      "cancelled",
    ].includes(value)
  ) {
    return value;
  }

  return "pending";
}

/*
 * ============================================================
 * STAT CARD
 * ============================================================
 */
function StatCard({
  label,
  value,
  description,
  type,
}) {
  return (
    <article
      className={`leave-stat-card ${type}`}
    >
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

      <small>
        {description}
      </small>
    </article>
  );
}

/*
 * ============================================================
 * LEAVE REQUEST
 * ============================================================
 */
function LeaveRequest({
  request,
  name,
  email,
  roomIdentity,
  formatDate,
  getStatusLabel,
  isAdministrator,
  saving,
  onApprove,
  onReject,
  onCancel,
  onDelete,
}) {
  const status =
    normalizeStatus(
      request.status
    );

  return (
    <article className="leave-request">
      <div className="leave-request-dates">
        <span>
          FROM
        </span>

        <strong>
          {formatDate(
            request.from
          )}
        </strong>

        <small>
          TO{" "}
          {formatDate(
            request.to
          )}
        </small>
      </div>

      <div className="leave-request-main">
        <div className="leave-user">
          <div className="leave-avatar">
            {name
              ?.charAt(0)
              ?.toUpperCase() ||
              "D"}
          </div>

          <div>
            <strong>
              {name}
            </strong>

            {email && (
              <small>
                {email}
              </small>
            )}
          </div>
        </div>

        {roomIdentity && (
          <div className="leave-room-identity">
            <span className="leave-room-icon">
              🏠
            </span>

            <div>
              <span className="leave-room-label">
                RESIDENCE
              </span>

              <strong>
                {roomIdentity}
              </strong>
            </div>
          </div>
        )}

        <p className="leave-reason">
          {request.reason ||
            "No reason provided"}
        </p>

        {request.adminNote && (
          <div className="leave-admin-note">
            <strong>
              Admin note:
            </strong>{" "}
            {request.adminNote}
          </div>
        )}
      </div>

      <div className="leave-request-actions">
        <span
          className={`leave-status ${status}`}
        >
          {getStatusLabel(
            status
          )}
        </span>

        {isAdministrator &&
          status ===
            "pending" && (
            <div className="leave-review-actions">
              <button
                type="button"
                className="leave-approve-button"
                onClick={
                  onApprove
                }
                disabled={
                  saving
                }
              >
                ✓ Approve
              </button>

              <button
                type="button"
                className="leave-reject-button"
                onClick={
                  onReject
                }
                disabled={
                  saving
                }
              >
                × Reject
              </button>
            </div>
          )}

        {isAdministrator && (
          <button
            type="button"
            className="leave-delete-button"
            onClick={
              onDelete
            }
            disabled={
              saving
            }
          >
            🗑 Delete
          </button>
        )}

        {!isAdministrator &&
          status ===
            "pending" && (
            <button
              type="button"
              className="leave-cancel-button"
              onClick={
                onCancel
              }
              disabled={
                saving
              }
            >
              {saving
                ? "Cancelling..."
                : "Cancel Request"}
            </button>
          )}
      </div>
    </article>
  );
}

/*
 * ============================================================
 * EMPTY STATE
 * ============================================================
 */
function EmptyLeaveState({
  title,
  description,
}) {
  return (
    <div className="leave-empty">
      <div className="leave-empty-icon">
        ◷
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {description}
      </p>
    </div>
  );
}

export default Leave;