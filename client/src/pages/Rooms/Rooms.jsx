import { useEffect, useMemo, useState } from "react";

import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Rooms.css";

function Rooms() {
  const { user, isAdministrator, isDevotee } = useAuth();

  const [rooms, setRooms] = useState([]);
  const [devotees, setDevotees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [occupancyFilter, setOccupancyFilter] = useState("all");

  const [showAssignForm, setShowAssignForm] = useState(false);

  const [assignment, setAssignment] = useState({
    roomId: "",
    devoteeId: "",
  });

  /*
   * ======================================================
   * LOAD ROOMS
   * ======================================================
   *
   * ADMIN:
   * Loads every room.
   *
   * DEVOTEE:
   * Loads only rooms containing their Firebase UID.
   */

  useEffect(() => {
    if (!user?.uid) {
      setRooms([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const roomsQuery = isAdministrator
      ? query(collection(db, "rooms"))
      : query(
          collection(db, "rooms"),
          where("occupants", "array-contains", user.uid)
        );

    const unsubscribe = onSnapshot(
      roomsQuery,
      (snapshot) => {
        const roomData = snapshot.docs.map((item) => {
          const data = item.data();

          /*
           * Support common Firebase field names.
           *
           * Preferred:
           * capacity
           *
           * Also supports:
           * beds
           * totalBeds
           */

          const rawCapacity =
            data.capacity ??
            data.beds ??
            data.totalBeds ??
            0;

          const capacity = Number(rawCapacity);

          /*
           * Support:
           * roomNumber
           * room
           *
           * If neither exists, use document ID.
           */

          const roomNumber =
            data.roomNumber ??
            data.room ??
            item.id;

          /*
           * Support occupants as an array.
           */

          const occupants = Array.isArray(data.occupants)
            ? data.occupants
            : [];

          return {
            id: item.id,
            room: roomNumber,
            roomNumber,
            floor:
              data.floor ??
              data.floorNumber ??
              "Not specified",
            capacity: Number.isFinite(capacity)
              ? capacity
              : 0,
            occupants,
          };
        });

        roomData.sort((a, b) =>
          String(a.roomNumber).localeCompare(
            String(b.roomNumber),
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          )
        );

        setRooms(roomData);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Failed to load rooms:",
          firebaseError
        );

        setRooms([]);
        setLoading(false);

        if (firebaseError.code === "permission-denied") {
          setError(
            "Firebase permission denied. Please check your Firestore security rules for the rooms collection."
          );
        } else {
          setError(
            "Unable to load rooms. Please try again."
          );
        }
      }
    );

    return () => unsubscribe();
  }, [user?.uid, isAdministrator]);

  /*
   * ======================================================
   * LOAD DEVOTEES
   * ======================================================
   *
   * ADMIN ONLY
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

        data.sort((a, b) =>
          String(a.name || "").localeCompare(
            String(b.name || ""),
            undefined,
            {
              sensitivity: "base",
            }
          )
        );

        setDevotees(data);
      },
      (firebaseError) => {
        console.error(
          "Failed to load devotees:",
          firebaseError
        );

        setDevotees([]);

        if (firebaseError.code === "permission-denied") {
          setError(
            "Firebase permission denied while loading devotees."
          );
        }
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
   * ======================================================
   * DEVOTEE MAP
   * ======================================================
   */

  const devoteeMap = useMemo(() => {
    const map = {};

    devotees.forEach((devotee) => {
      map[devotee.uid] = devotee;
    });

    return map;
  }, [devotees]);

  /*
   * ======================================================
   * ASSIGNABLE ROOMS
   * ======================================================
   *
   * This is deliberately calculated separately.
   *
   * Only rooms with:
   *
   * capacity > occupants
   *
   * can be assigned.
   */

  const assignableRooms = useMemo(() => {
    return rooms.filter((room) => {
      const capacity = Number(room.capacity) || 0;
      const occupied = Array.isArray(room.occupants)
        ? room.occupants.length
        : 0;

      return capacity > 0 && occupied < capacity;
    });
  }, [rooms]);

  /*
   * ======================================================
   * AVAILABLE DEVOTEES
   * ======================================================
   *
   * A devotee can only be assigned to one room.
   */

  const availableDevotees = useMemo(() => {
    return devotees.filter((devotee) => {
      const alreadyAssigned = rooms.some((room) =>
        room.occupants.includes(devotee.uid)
      );

      return !alreadyAssigned;
    });
  }, [devotees, rooms]);

  /*
   * ======================================================
   * ADMIN ROOM FILTERING
   * ======================================================
   */

  const filteredRooms = useMemo(() => {
    if (!isAdministrator) {
      return rooms;
    }

    let result = [...rooms];

    /*
     * SEARCH
     */

    if (search.trim()) {
      const value = search.trim().toLowerCase();

      result = result.filter((room) => {
        const roomMatches =
          String(room.roomNumber)
            .toLowerCase()
            .includes(value) ||
          String(room.floor)
            .toLowerCase()
            .includes(value);

        const occupantMatches = (
          room.occupants || []
        ).some((uid) => {
          const devotee = devoteeMap[uid];

          const name = String(
            devotee?.name || ""
          ).toLowerCase();

          const email = String(
            devotee?.email || ""
          ).toLowerCase();

          return (
            name.includes(value) ||
            email.includes(value)
          );
        });

        return roomMatches || occupantMatches;
      });
    }

    /*
     * OCCUPANCY FILTER
     */

    if (occupancyFilter !== "all") {
      result = result.filter((room) => {
        const occupied = room.occupants.length;
        const capacity = Number(room.capacity) || 0;

        if (occupancyFilter === "available") {
          return (
            capacity > 0 &&
            occupied < capacity
          );
        }

        if (occupancyFilter === "full") {
          return (
            capacity > 0 &&
            occupied >= capacity
          );
        }

        if (occupancyFilter === "empty") {
          return occupied === 0;
        }

        return true;
      });
    }

    return result;
  }, [
    rooms,
    search,
    occupancyFilter,
    isAdministrator,
    devoteeMap,
  ]);

  /*
   * ======================================================
   * ROOM STATISTICS
   * ======================================================
   */

  const statistics = useMemo(() => {
    const totalRooms = rooms.length;

    const totalCapacity = rooms.reduce(
      (total, room) =>
        total + (Number(room.capacity) || 0),
      0
    );

    const occupiedBeds = rooms.reduce(
      (total, room) =>
        total + room.occupants.length,
      0
    );

    const availableBeds = Math.max(
      totalCapacity - occupiedBeds,
      0
    );

    const fullRooms = rooms.filter((room) => {
      const capacity = Number(room.capacity) || 0;

      return (
        capacity > 0 &&
        room.occupants.length >= capacity
      );
    }).length;

    return {
      totalRooms,
      totalCapacity,
      occupiedBeds,
      availableBeds,
      fullRooms,
    };
  }, [rooms]);

  /*
   * ======================================================
   * ASSIGNMENT FORM
   * ======================================================
   */

  const handleAssignmentChange = (event) => {
    const { name, value } = event.target;

    setAssignment((previous) => ({
      ...previous,
      [name]: value,
    }));

    /*
     * Clear previous error once user changes
     * the form.
     */

    if (error) {
      setError("");
    }
  };

  /*
   * ======================================================
   * OPEN ASSIGN FORM
   * ======================================================
   */

  const openAssignForm = () => {
    setError("");

    setAssignment({
      roomId: "",
      devoteeId: "",
    });

    setShowAssignForm(true);
  };

  /*
   * ======================================================
   * CLOSE ASSIGN FORM
   * ======================================================
   */

  const closeAssignForm = () => {
    setShowAssignForm(false);

    setAssignment({
      roomId: "",
      devoteeId: "",
    });

    setError("");
  };

  /*
   * ======================================================
   * ASSIGN DEVOTEE
   * ======================================================
   */

  const assignDevotee = async (event) => {
    event.preventDefault();

    if (!isAdministrator) {
      return;
    }

    setError("");

    const roomId = assignment.roomId;
    const devoteeId = assignment.devoteeId;

    if (!roomId) {
      setError("Please select a room.");
      return;
    }

    if (!devoteeId) {
      setError("Please select a devotee.");
      return;
    }

    const selectedRoom = rooms.find(
      (room) => room.id === roomId
    );

    if (!selectedRoom) {
      setError(
        "Selected room was not found. Please refresh the page."
      );
      return;
    }

    const capacity =
      Number(selectedRoom.capacity) || 0;

    const occupied =
      selectedRoom.occupants.length;

    /*
     * Capacity validation
     */

    if (capacity <= 0) {
      setError(
        `Room ${selectedRoom.roomNumber} does not have a valid capacity. Please set the room capacity in Firebase first.`
      );
      return;
    }

    if (occupied >= capacity) {
      setError(
        `Room ${selectedRoom.roomNumber} is already full.`
      );
      return;
    }

    /*
     * Make sure selected devotee exists
     */

    const selectedDevotee = devotees.find(
      (devotee) =>
        devotee.uid === devoteeId
    );

    if (!selectedDevotee) {
      setError(
        "Selected devotee was not found."
      );
      return;
    }

    /*
     * Make sure devotee is not already assigned.
     */

    const alreadyAssigned = rooms.some(
      (room) =>
        room.occupants.includes(devoteeId)
    );

    if (alreadyAssigned) {
      setError(
        "This devotee is already assigned to a room."
      );
      return;
    }

    try {
      setSaving(true);

      await updateDoc(
        doc(db, "rooms", selectedRoom.id),
        {
          occupants: arrayUnion(devoteeId),
        }
      );

      setAssignment({
        roomId: "",
        devoteeId: "",
      });

      setShowAssignForm(false);
      setError("");
    } catch (firebaseError) {
      console.error(
        "Failed to assign devotee:",
        firebaseError
      );

      if (
        firebaseError.code ===
        "permission-denied"
      ) {
        setError(
          "Firebase permission denied. Your Firestore rules must allow administrators to update rooms."
        );
      } else {
        setError(
          "Unable to assign devotee. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /*
   * ======================================================
   * REMOVE DEVOTEE
   * ======================================================
   */

  const removeDevotee = async (
    roomId,
    devoteeId
  ) => {
    if (!isAdministrator) {
      return;
    }

    const room = rooms.find(
      (item) => item.id === roomId
    );

    if (!room) {
      setError("Room was not found.");
      return;
    }

    const updatedOccupants =
      room.occupants.filter(
        (uid) => uid !== devoteeId
      );

    try {
      setSaving(true);
      setError("");

      await updateDoc(
        doc(db, "rooms", roomId),
        {
          occupants: updatedOccupants,
        }
      );
    } catch (firebaseError) {
      console.error(
        "Failed to remove devotee:",
        firebaseError
      );

      if (
        firebaseError.code ===
        "permission-denied"
      ) {
        setError(
          "Firebase permission denied. Your Firestore rules must allow administrators to update rooms."
        );
      } else {
        setError(
          "Unable to remove devotee. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /*
   * ======================================================
   * HELPERS
   * ======================================================
   */

  const getDevoteeName = (uid) => {
    return (
      devoteeMap[uid]?.name ||
      devoteeMap[uid]?.email ||
      "Unknown devotee"
    );
  };

  const getDevoteeEmail = (uid) => {
    return devoteeMap[uid]?.email || "";
  };

  const getOccupancyClass = (room) => {
    const capacity =
      Number(room.capacity) || 0;

    const occupied =
      room.occupants.length;

    if (capacity <= 0) {
      return "unknown";
    }

    if (occupied >= capacity) {
      return "full";
    }

    if (occupied === 0) {
      return "empty";
    }

    return "available";
  };

  /*
   * ======================================================
   * LOADING
   * ======================================================
   */

  if (loading) {
    return (
      <Loader text="Loading rooms..." />
    );
  }

  /*
   * ======================================================
   * ADMIN VIEW
   * ======================================================
   */

  if (isAdministrator) {
    return (
      <div className="rooms-page">
        <header className="rooms-header">
          <div>
            <span className="rooms-eyebrow">
              RESIDENTIAL MANAGEMENT
            </span>

            <h1>Rooms</h1>

            <p>
              Manage room allocation and temple
              residence occupancy.
            </p>
          </div>

          <button
            type="button"
            className="rooms-primary-button"
            onClick={() => {
              if (showAssignForm) {
                closeAssignForm();
              } else {
                openAssignForm();
              }
            }}
          >
            {showAssignForm
              ? "Close"
              : "+ Assign Devotee"}
          </button>
        </header>

        {error && (
          <div className="rooms-error">
            {error}
          </div>
        )}

        {showAssignForm && (
          <section className="rooms-form-card">
            <div className="rooms-card-header">
              <div>
                <span className="rooms-card-eyebrow">
                  ROOM ALLOCATION
                </span>

                <h2>
                  Assign Devotee to Room
                </h2>
              </div>
            </div>

            <form
              className="rooms-form"
              onSubmit={assignDevotee}
            >
              <label>
                <span>Room</span>

                <select
                  name="roomId"
                  value={assignment.roomId}
                  onChange={
                    handleAssignmentChange
                  }
                  required
                >
                  <option value="">
                    Select room
                  </option>

                  {rooms.map((room) => {
                    const occupied =
                      room.occupants.length;

                    const capacity =
                      Number(room.capacity) || 0;

                    const isAvailable =
                      capacity > 0 &&
                      occupied < capacity;

                    return (
                      <option
                        key={room.id}
                        value={room.id}
                        disabled={!isAvailable}
                      >
                        Room {room.roomNumber} ·{" "}
                        {occupied}/{capacity}
                        {!capacity
                          ? " · Capacity not set"
                          : occupied >= capacity
                            ? " · Full"
                            : " · Available"}
                      </option>
                    );
                  })}
                </select>

                {rooms.length > 0 &&
                  assignableRooms.length === 0 && (
                    <small>
                      No rooms are currently
                      available for assignment.
                      Check room capacity and
                      occupancy in Firebase.
                    </small>
                  )}
              </label>

              <label>
                <span>Devotee</span>

                <select
                  name="devoteeId"
                  value={
                    assignment.devoteeId
                  }
                  onChange={
                    handleAssignmentChange
                  }
                  required
                >
                  <option value="">
                    Select devotee
                  </option>

                  {availableDevotees.length ===
                  0 ? (
                    <option
                      value=""
                      disabled
                    >
                      No unassigned devotees
                    </option>
                  ) : (
                    availableDevotees.map(
                      (devotee) => (
                        <option
                          key={devotee.uid}
                          value={devotee.uid}
                        >
                          {devotee.name ||
                            devotee.email}
                        </option>
                      )
                    )
                  )}
                </select>
              </label>

              <div className="rooms-form-actions">
                <button
                  type="button"
                  className="rooms-secondary-button"
                  onClick={
                    closeAssignForm
                  }
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rooms-primary-button"
                  disabled={
                    saving ||
                    assignableRooms.length ===
                      0 ||
                    availableDevotees.length ===
                      0
                  }
                >
                  {saving
                    ? "Assigning..."
                    : "Assign Room"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="rooms-stats">
          <RoomStat
            label="Total Rooms"
            value={
              statistics.totalRooms
            }
            description="Registered rooms"
          />

          <RoomStat
            label="Total Capacity"
            value={
              statistics.totalCapacity
            }
            description="Total beds"
          />

          <RoomStat
            label="Occupied"
            value={
              statistics.occupiedBeds
            }
            description="Current residents"
            type="occupied"
          />

          <RoomStat
            label="Available"
            value={
              statistics.availableBeds
            }
            description="Beds available"
            type="available"
          />
        </section>

        <section className="rooms-toolbar">
          <div className="rooms-search">
            <span>⌕</span>

            <input
              type="search"
              placeholder="Search room, floor or devotee..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
            />
          </div>

          <select
            value={occupancyFilter}
            onChange={(event) =>
              setOccupancyFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              All Rooms
            </option>

            <option value="available">
              Available
            </option>

            <option value="full">
              Full
            </option>

            <option value="empty">
              Empty
            </option>
          </select>
        </section>

        <section className="rooms-card">
          <div className="rooms-card-header">
            <div>
              <span className="rooms-card-eyebrow">
                ROOM DIRECTORY
              </span>

              <h2>Temple Rooms</h2>
            </div>

            <span className="rooms-count">
              {filteredRooms.length}{" "}
              {filteredRooms.length === 1
                ? "room"
                : "rooms"}
            </span>
          </div>

          {filteredRooms.length === 0 ? (
            <EmptyRoomsState
              title="No rooms found"
              description={
                rooms.length === 0
                  ? "No room records have been added to Firebase yet."
                  : "No rooms match the current filters."
              }
            />
          ) : (
            <div className="rooms-grid">
              {filteredRooms.map(
                (room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    getDevoteeName={
                      getDevoteeName
                    }
                    getDevoteeEmail={
                      getDevoteeEmail
                    }
                    getOccupancyClass={
                      getOccupancyClass
                    }
                    onRemove={
                      removeDevotee
                    }
                    saving={saving}
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
   * ======================================================
   * DEVOTEE VIEW
   * ======================================================
   */

  if (isDevotee) {
    const ownRooms = rooms.filter(
      (room) =>
        room.occupants.includes(
          user.uid
        )
    );

    return (
      <div className="rooms-page">
        <header className="rooms-header">
          <div>
            <span className="rooms-eyebrow">
              MY RESIDENCE
            </span>

            <h1>My Room</h1>

            <p>
              View your current temple residence
              assignment.
            </p>
          </div>
        </header>

        {error && (
          <div className="rooms-error">
            {error}
          </div>
        )}

        {ownRooms.length === 0 ? (
          <section className="rooms-empty-personal">
            <div className="rooms-empty-icon">
              ⌂
            </div>

            <h2>No Room Assigned</h2>

            <p>
              You currently do not have a
              room assignment. Please contact
              the temple administrator.
            </p>
          </section>
        ) : (
          <div className="my-room-list">
            {ownRooms.map((room) => (
              <article
                className="my-room-card"
                key={room.id}
              >
                <div className="my-room-top">
                  <div className="my-room-icon">
                    ⌂
                  </div>

                  <div>
                    <span>
                      MY ASSIGNED ROOM
                    </span>

                    <h2>
                      Room{" "}
                      {room.roomNumber}
                    </h2>
                  </div>
                </div>

                <div className="my-room-details">
                  <div>
                    <span>Floor</span>

                    <strong>
                      {room.floor}
                    </strong>
                  </div>

                  <div>
                    <span>Occupancy</span>

                    <strong>
                      {room.occupants.length}{" "}
                      / {room.capacity}
                    </strong>
                  </div>

                  <div>
                    <span>Status</span>

                    <strong>
                      {getOccupancyClass(
                        room
                      ) === "full"
                        ? "Full"
                        : "Assigned"}
                    </strong>
                  </div>
                </div>

                <div className="my-room-notice">
                  Room allocation is managed by
                  the temple administrator.
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

/*
 * ======================================================
 * ROOM STAT
 * ======================================================
 */

function RoomStat({
  label,
  value,
  description,
  type = "",
}) {
  return (
    <article
      className={`rooms-stat ${type}`}
    >
      <span>{label}</span>

      <strong>{value}</strong>

      <small>{description}</small>
    </article>
  );
}

/*
 * ======================================================
 * ROOM CARD
 * ======================================================
 */

function RoomCard({
  room,
  getDevoteeName,
  getDevoteeEmail,
  getOccupancyClass,
  onRemove,
  saving,
}) {
  const occupancyClass =
    getOccupancyClass(room);

  const capacity =
    Number(room.capacity) || 0;

  const occupied =
    room.occupants.length;

  const available = Math.max(
    capacity - occupied,
    0
  );

  const progress =
    capacity > 0
      ? Math.min(
          (occupied / capacity) * 100,
          100
        )
      : 0;

  return (
    <article className="room-card">
      <div className="room-card-top">
        <div>
          <span className="room-floor">
            {room.floor}
          </span>

          <h3>
            Room {room.roomNumber}
          </h3>
        </div>

        <span
          className={`room-status ${occupancyClass}`}
        >
          {occupancyClass === "full"
            ? "Full"
            : occupancyClass === "empty"
              ? "Empty"
              : occupancyClass ===
                  "unknown"
                ? "Capacity not set"
                : `${available} available`}
        </span>
      </div>

      <div className="room-occupancy">
        <div className="room-occupancy-header">
          <span>Occupancy</span>

          <strong>
            {occupied} / {capacity}
          </strong>
        </div>

        <div className="room-progress">
          <span
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div className="room-occupants">
        <span className="room-section-label">
          RESIDENTS
        </span>

        {room.occupants.length === 0 ? (
          <div className="room-no-occupants">
            No devotees assigned.
          </div>
        ) : (
          room.occupants.map((uid) => (
            <div
              className="room-occupant"
              key={uid}
            >
              <div className="room-occupant-avatar">
                {getDevoteeName(uid)
                  ?.charAt(0)
                  ?.toUpperCase() || "D"}
              </div>

              <div className="room-occupant-info">
                <strong>
                  {getDevoteeName(uid)}
                </strong>

                <small>
                  {getDevoteeEmail(uid)}
                </small>
              </div>

              <button
                type="button"
                className="room-remove-button"
                onClick={() =>
                  onRemove(
                    room.id,
                    uid
                  )
                }
                disabled={saving}
              >
                {saving
                  ? "..."
                  : "Remove"}
              </button>
            </div>
          ))
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

function EmptyRoomsState({
  title,
  description,
}) {
  return (
    <div className="rooms-empty">
      <div className="rooms-empty-icon">
        ⌂
      </div>

      <h3>{title}</h3>

      <p>{description}</p>
    </div>
  );
}

export default Rooms;