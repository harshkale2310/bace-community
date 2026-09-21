import { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Rooms.css";

/* ======================================================
 * FACILITY IMAGES
 * ====================================================== */

const TERRACE_IMAGE = "/images/bace-terrace.jpg";
const UPPER_TERRACE_IMAGE = "/images/bace-upper-terrace.jpg";

/* ======================================================
 * COMMON FACILITIES
 * ====================================================== */

const COMMON_FACILITIES = [
  {
    key: "ground-floor",
    label: "GROUND FLOOR",
    title: "Ground Floor",
    subtitle: "Parking + Vrindavan Forest",
    description:
      "Main entrance, parking area, Vrindavan Forest and common ground-level access.",
    image: "",
    icon: "⌂",
    details: [
      "Parking area",
      "Vrindavan Forest",
      "Main entrance and common access",
    ],
  },
  {
    key: "terrace",
    label: "TERRACE",
    title: "BACE Terrace",
    subtitle: "Shared devotional and service spaces",
    description:
      "The terrace contains shared spaces for lectures, prasadam, devotional activities and kitchen services.",
    image: TERRACE_IMAGE,
    icon: "◈",
    details: [
      "Bhaktivedanta Hall — Lecture Area",
      "Mukharavinda — Temple Area",
      "Prasadam Hall",
      "Giriraj Rasoi — Kitchen",
    ],
  },
  {
    key: "upper-terrace",
    label: "UPPER TERRACE",
    title: "Upper Terrace",
    subtitle: "Gopinathji Mandir",
    description:
      "The upper terrace contains the Gopinathji Mandir devotional space.",
    image: UPPER_TERRACE_IMAGE,
    icon: "✦",
    details: ["Gopinathji Mandir"],
  },
];

/* ======================================================
 * RESIDENCE REFERENCE INFORMATION
 * ====================================================== */

const FLOOR_REFERENCE = [
  {
    floor: "Floor 1",
    passage: "Chandra Sarovar",
    bathroomInfo: "4 attached toilet bathrooms with geysers",
    rooms: [
      {
        number: "1",
        name: "",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "2",
        name: "",
        capacity: 6,
        lockers: 6,
      },
      {
        number: "3",
        name: "",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "4",
        name: "Study Room",
        studyOnly: true,
      },
      {
        number: "5",
        name: "",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "6",
        name: "",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "7",
        name: "",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "8",
        name: "",
        capacity: 4,
        lockers: 4,
      },
    ],
  },
  {
    floor: "Floor 2",
    passage: "Kusum Sarovar + Spiritual Library",
    bathroomInfo: "4 attached toilet bathrooms with geysers",
    rooms: [
      {
        number: "1",
        name: "Govardhan Kund",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "2",
        name: "Sankarshan Kund",
        capacity: 6,
        lockers: 6,
      },
      {
        number: "3",
        name: "Uddhava Kund",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "4",
        name: "Surabhi Kund",
        studyOnly: true,
      },
      {
        number: "5",
        name: "Narad Kund",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "6",
        name: "Shyam Kund",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "7",
        name: "Radha Kund",
        capacity: 4,
        lockers: 4,
      },
      {
        number: "8",
        name: "Rudra Kund",
        capacity: 4,
        lockers: 4,
      },
    ],
  },
];

/* ======================================================
 * ADMIN ROOM FLOORS
 * ====================================================== */

const FLOOR_OPTIONS = [
  { value: "1", label: "Floor 1" },
  { value: "2", label: "Floor 2" },
  { value: "3", label: "Floor 3" },
  { value: "4", label: "Floor 4" },
  { value: "5", label: "Floor 5" },
  { value: "6", label: "Floor 6" },
  { value: "7", label: "Floor 7" },
  { value: "8", label: "Floor 8" },
  { value: "9", label: "Floor 9" },
  { value: "10", label: "Floor 10" },
];

/* ======================================================
 * ROOMS
 * ====================================================== */

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
  const [showRoomForm, setShowRoomForm] = useState(false);

  const [assignment, setAssignment] = useState({
    roomId: "",
    devoteeId: "",
  });

  const [roomForm, setRoomForm] = useState({
    floor: "1",
    roomNumber: "",
    roomName: "",
    maximumOccupancy: "",
    roomType: "residential",
  });

  /* ======================================================
   * LOAD ROOMS
   * ====================================================== */

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

          const rawCapacity =
            data.maximumOccupancy ?? data.capacity ?? 0;

          const maximumOccupancy = Number(rawCapacity);

          const occupants = Array.isArray(data.occupants)
            ? data.occupants
            : [];

          return {
            id: item.id,

            floor:
              data.floor ??
              data.floorNumber ??
              "Not specified",

            roomNumber:
              data.roomNumber ??
              data.room ??
              item.id,

            roomName: data.roomName ?? "",

            maximumOccupancy: Number.isFinite(maximumOccupancy)
              ? maximumOccupancy
              : 0,

            roomType: data.roomType ?? "residential",

            occupants,
          };
        });

        roomData.sort((a, b) => {
          const aFloor =
            String(a.floor).toLowerCase() === "ground floor"
              ? 0
              : Number(a.floor);

          const bFloor =
            String(b.floor).toLowerCase() === "ground floor"
              ? 0
              : Number(b.floor);

          if (
            Number.isFinite(aFloor) &&
            Number.isFinite(bFloor) &&
            aFloor !== bFloor
          ) {
            return aFloor - bFloor;
          }

          return String(a.roomNumber).localeCompare(
            String(b.roomNumber),
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          );
        });

        setRooms(roomData);
        setLoading(false);
      },
      (firebaseError) => {
        console.error("Failed to load rooms:", firebaseError);

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

  /* ======================================================
   * LOAD ACTIVE DEVOTEES ONLY
   * ====================================================== */

  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
      return undefined;
    }

    const devoteesQuery = query(
      collection(db, "users"),
      where("role", "==", "devotee"),
      where("status", "==", "active")
    );

    const unsubscribe = onSnapshot(
      devoteesQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((item) => ({
            uid: item.id,
            ...item.data(),
          }))
          .filter(
            (devotee) =>
              devotee.role === "devotee" &&
              devotee.status === "active"
          );

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
          "Failed to load active devotees:",
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

  /* ======================================================
   * AUTOMATICALLY REMOVE INACTIVE / DELETED DEVOTEES
   * FROM ROOM ASSIGNMENTS
   *
   * IMPORTANT:
   * This runs only for administrators.
   *
   * Firestore users with:
   * - status = inactive
   * - status = deleted
   * - missing user profile
   *
   * are removed from every room's occupants array.
   * ====================================================== */

  useEffect(() => {
    if (!isAdministrator || rooms.length === 0) {
      return undefined;
    }

    let cancelled = false;

    const cleanupRoomAssignments = async () => {
      try {
        const usersSnapshot = await getDocs(
          collection(db, "users")
        );

        if (cancelled) {
          return;
        }

        const validActiveDevoteeIds = new Set();

        usersSnapshot.forEach((userDocument) => {
          const data = userDocument.data();

          const role = String(
            data.role || ""
          )
            .trim()
            .toLowerCase();

          const status = String(
            data.status || "active"
          )
            .trim()
            .toLowerCase();

          if (
            role === "devotee" &&
            status === "active"
          ) {
            validActiveDevoteeIds.add(
              userDocument.id
            );
          }
        });

        const cleanupPromises = [];

        rooms.forEach((room) => {
          if (!Array.isArray(room.occupants)) {
            return;
          }

          const validOccupants =
            room.occupants.filter((uid) =>
              validActiveDevoteeIds.has(uid)
            );

          const hasInvalidOccupants =
            validOccupants.length !==
            room.occupants.length;

          if (!hasInvalidOccupants) {
            return;
          }

          cleanupPromises.push(
            updateDoc(
              doc(db, "rooms", room.id),
              {
                occupants: validOccupants,
              }
            )
          );
        });

        if (cleanupPromises.length > 0) {
          await Promise.all(cleanupPromises);
        }
      } catch (firebaseError) {
        console.error(
          "Failed to clean inactive/deleted devotees from rooms:",
          firebaseError
        );

        if (
          firebaseError.code ===
          "permission-denied"
        ) {
          setError(
            "Firebase permission denied while cleaning inactive room assignments."
          );
        }
      }
    };

    cleanupRoomAssignments();

    return () => {
      cancelled = true;
    };
  }, [isAdministrator, rooms]);

  /* ======================================================
   * DEVOTEE MAP
   * ====================================================== */

  const devoteeMap = useMemo(() => {
    const map = {};

    devotees.forEach((devotee) => {
      if (
        devotee.role === "devotee" &&
        devotee.status === "active"
      ) {
        map[devotee.uid] = devotee;
      }
    });

    return map;
  }, [devotees]);

  /* ======================================================
   * ROOM HELPERS
   * ====================================================== */

  const getOccupantsCount = (room) => {
    return Array.isArray(room.occupants)
      ? room.occupants.length
      : 0;
  };

  const getVacancy = (room) => {
    const maximum = Number(room.maximumOccupancy) || 0;
    const occupants = getOccupantsCount(room);

    return Math.max(maximum - occupants, 0);
  };

  /* ======================================================
   * ASSIGNABLE ROOMS
   * ====================================================== */

  const assignableRooms = useMemo(() => {
    return rooms.filter((room) => {
      const maximum =
        Number(room.maximumOccupancy) || 0;

      const occupants =
        getOccupantsCount(room);

      const isGroundFloor =
        String(room.floor)
          .trim()
          .toLowerCase() ===
        "ground floor";

      return (
        !isGroundFloor &&
        room.roomType === "residential" &&
        maximum > 0 &&
        occupants < maximum
      );
    });
  }, [rooms]);

  /* ======================================================
   * AVAILABLE ACTIVE DEVOTEES
   * ====================================================== */

  const availableDevotees = useMemo(() => {
    return devotees.filter((devotee) => {
      if (
        devotee.role !== "devotee" ||
        devotee.status !== "active"
      ) {
        return false;
      }

      return !rooms.some((room) =>
        Array.isArray(room.occupants)
          ? room.occupants.includes(
              devotee.uid
            )
          : false
      );
    });
  }, [devotees, rooms]);

  /* ======================================================
   * FILTER ROOMS
   * ====================================================== */

  const filteredRooms = useMemo(() => {
    if (!isAdministrator) {
      return rooms;
    }

    let result = [...rooms];

    if (search.trim()) {
      const value =
        search.trim().toLowerCase();

      result = result.filter((room) => {
        const roomMatches =
          String(room.roomNumber)
            .toLowerCase()
            .includes(value) ||
          String(room.roomName)
            .toLowerCase()
            .includes(value) ||
          String(room.floor)
            .toLowerCase()
            .includes(value);

        const occupantMatches =
          room.occupants || [];

        const devoteeMatches =
          occupantMatches.some(
            (uid) => {
              const devotee =
                devoteeMap[uid];

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
            }
          );

        return (
          roomMatches ||
          devoteeMatches
        );
      });
    }

    if (occupancyFilter !== "all") {
      result = result.filter((room) => {
        const occupants =
          getOccupantsCount(room);

        const maximum =
          Number(
            room.maximumOccupancy
          ) || 0;

        if (
          occupancyFilter ===
          "available"
        ) {
          return (
            room.roomType ===
              "residential" &&
            maximum > 0 &&
            occupants < maximum
          );
        }

        if (
          occupancyFilter ===
          "full"
        ) {
          return (
            room.roomType ===
              "residential" &&
            maximum > 0 &&
            occupants >= maximum
          );
        }

        if (
          occupancyFilter ===
          "empty"
        ) {
          return occupants === 0;
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

  /* ======================================================
   * STATISTICS
   * ====================================================== */

  const statistics = useMemo(() => {
    const residentialRooms =
      rooms.filter(
        (room) =>
          room.roomType ===
            "residential" &&
          String(room.floor)
            .trim()
            .toLowerCase() !==
            "ground floor"
      );

    const totalRooms =
      residentialRooms.length;

    const totalCapacity =
      residentialRooms.reduce(
        (total, room) =>
          total +
          (Number(
            room.maximumOccupancy
          ) || 0),
        0
      );

    const occupants =
      residentialRooms.reduce(
        (total, room) =>
          total +
          getOccupantsCount(room),
        0
      );

    const vacancy = Math.max(
      totalCapacity - occupants,
      0
    );

    const fullRooms =
      residentialRooms.filter(
        (room) =>
          getOccupantsCount(room) >=
          Number(
            room.maximumOccupancy
          )
      ).length;

    const studyRooms =
      rooms.filter(
        (room) =>
          room.roomType === "study"
      ).length;

    return {
      totalRooms,
      totalCapacity,
      occupants,
      vacancy,
      fullRooms,
      studyRooms,
    };
  }, [rooms]);

  /* ======================================================
   * ROOM FORM
   * ====================================================== */

  const handleRoomFormChange = (
    event
  ) => {
    const {
      name,
      value,
    } = event.target;

    setRoomForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  /* ======================================================
   * CREATE ROOM
   * ====================================================== */

  const createRoom = async (
    event
  ) => {
    event.preventDefault();

    if (!isAdministrator) {
      return;
    }

    setError("");

    const floor =
      roomForm.floor.trim();

    const roomNumber =
      roomForm.roomNumber.trim();

    const roomName =
      roomForm.roomName.trim();

    const maximumOccupancy =
      Number(
        roomForm.maximumOccupancy
      );

    if (
      !FLOOR_OPTIONS.some(
        (item) =>
          item.value === floor
      )
    ) {
      setError(
        "Please select a valid residential floor."
      );
      return;
    }

    if (!roomNumber) {
      setError(
        "Please enter the room number."
      );
      return;
    }

    if (!roomName) {
      setError(
        "Please enter the room name."
      );
      return;
    }

    if (
      roomForm.roomType ===
        "residential" &&
      (!Number.isFinite(
        maximumOccupancy
      ) ||
        maximumOccupancy <= 0)
    ) {
      setError(
        "Please enter a valid maximum occupancy."
      );
      return;
    }

    const duplicate =
      rooms.some(
        (room) =>
          String(room.floor)
            .trim()
            .toLowerCase() ===
            floor.toLowerCase() &&
          String(room.roomNumber)
            .trim()
            .toLowerCase() ===
            roomNumber.toLowerCase()
      );

    if (duplicate) {
      setError(
        `Room ${roomNumber} already exists on ${floor}.`
      );
      return;
    }

    try {
      setSaving(true);

      await addDoc(
        collection(
          db,
          "rooms"
        ),
        {
          floor,
          roomNumber,
          roomName,
          maximumOccupancy:
            roomForm.roomType ===
            "residential"
              ? maximumOccupancy
              : 0,
          roomType:
            roomForm.roomType,
          occupants: [],
          createdAt:
            new Date().toISOString(),
          createdBy: user.uid,
        }
      );

      setRoomForm({
        floor: "1",
        roomNumber: "",
        roomName: "",
        maximumOccupancy: "",
        roomType:
          "residential",
      });

      setShowRoomForm(false);
      setError("");
    } catch (firebaseError) {
      console.error(
        "Failed to create room:",
        firebaseError
      );

      if (
        firebaseError.code ===
        "permission-denied"
      ) {
        setError(
          "Firebase permission denied. Your Firestore rules must allow administrators to create rooms."
        );
      } else {
        setError(
          "Unable to create the room. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /* ======================================================
   * ASSIGNMENT FORM
   * ====================================================== */

  const handleAssignmentChange = (
    event
  ) => {
    const {
      name,
      value,
    } = event.target;

    setAssignment((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const openAssignForm = () => {
    setError("");

    setAssignment({
      roomId: "",
      devoteeId: "",
    });

    setShowAssignForm(true);
  };

  const closeAssignForm = () => {
    setShowAssignForm(false);

    setAssignment({
      roomId: "",
      devoteeId: "",
    });

    setError("");
  };

  /* ======================================================
   * ASSIGN DEVOTEE
   * ====================================================== */

  const assignDevotee = async (
    event
  ) => {
    event.preventDefault();

    if (!isAdministrator) {
      return;
    }

    setError("");

    const roomId =
      assignment.roomId;

    const devoteeId =
      assignment.devoteeId;

    if (!roomId) {
      setError(
        "Please select a room."
      );
      return;
    }

    if (!devoteeId) {
      setError(
        "Please select a devotee."
      );
      return;
    }

    const selectedDevotee =
      devotees.find(
        (devotee) =>
          devotee.uid ===
            devoteeId &&
          devotee.role ===
            "devotee" &&
          devotee.status ===
            "active"
      );

    if (!selectedDevotee) {
      setError(
        "This devotee is no longer active and cannot be assigned to a room."
      );
      return;
    }

    const selectedRoom =
      rooms.find(
        (room) =>
          room.id === roomId
      );

    if (!selectedRoom) {
      setError(
        "Selected room was not found. Please refresh the page."
      );
      return;
    }

    const isGroundFloor =
      String(
        selectedRoom.floor
      )
        .trim()
        .toLowerCase() ===
      "ground floor";

    if (isGroundFloor) {
      setError(
        "Ground Floor is a common facility and cannot be assigned as a residence."
      );
      return;
    }

    const maximum =
      Number(
        selectedRoom.maximumOccupancy
      ) || 0;

    const occupants =
      getOccupantsCount(
        selectedRoom
      );

    if (
      selectedRoom.roomType !==
      "residential"
    ) {
      setError(
        "Only residential rooms can be assigned to devotees."
      );
      return;
    }

    if (maximum <= 0) {
      setError(
        `Room ${selectedRoom.roomNumber} does not have a valid maximum occupancy.`
      );
      return;
    }

    if (occupants >= maximum) {
      setError(
        `Room ${selectedRoom.roomNumber} is already full.`
      );
      return;
    }

    const alreadyAssigned =
      rooms.some((room) =>
        Array.isArray(
          room.occupants
        )
          ? room.occupants.includes(
              devoteeId
            )
          : false
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
        doc(
          db,
          "rooms",
          selectedRoom.id
        ),
        {
          occupants:
            arrayUnion(
              devoteeId
            ),
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

  /* ======================================================
   * REMOVE DEVOTEE
   * ====================================================== */

  const removeDevotee = async (
    roomId,
    devoteeId
  ) => {
    if (!isAdministrator) {
      return;
    }

    const room =
      rooms.find(
        (item) =>
          item.id === roomId
      );

    if (!room) {
      setError(
        "Room was not found."
      );
      return;
    }

    const devotee =
      devoteeMap[devoteeId];

    const devoteeName =
      devotee?.name ||
      devotee?.email ||
      "this devotee";

    const confirmed =
      window.confirm(
        `Remove ${devoteeName} from Room ${room.roomNumber}?`
      );

    if (!confirmed) {
      return;
    }

    const updatedOccupants =
      room.occupants.filter(
        (uid) =>
          uid !== devoteeId
      );

    try {
      setSaving(true);
      setError("");

      await updateDoc(
        doc(
          db,
          "rooms",
          roomId
        ),
        {
          occupants:
            updatedOccupants,
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

  /* ======================================================
   * DEVOTEE HELPERS
   * ====================================================== */

  const getDevoteeName = (
    uid
  ) => {
    return (
      devoteeMap[uid]?.name ||
      devoteeMap[uid]?.email ||
      "Unknown devotee"
    );
  };

  const getDevoteeEmail = (
    uid
  ) => {
    return (
      devoteeMap[uid]?.email ||
      ""
    );
  };

  const getOccupancyClass = (
    room
  ) => {
    if (
      room.roomType ===
      "study"
    ) {
      return "study";
    }

    const maximum =
      Number(
        room.maximumOccupancy
      ) || 0;

    const occupants =
      getOccupantsCount(room);

    if (maximum <= 0) {
      return "unknown";
    }

    if (occupants >= maximum) {
      return "full";
    }

    if (occupants === 0) {
      return "empty";
    }

    return "available";
  };

  /* ======================================================
   * LOADING
   * ====================================================== */

  if (loading) {
    return (
      <Loader text="Loading rooms..." />
    );
  }

  /* ======================================================
   * ADMIN VIEW
   * ====================================================== */

  if (isAdministrator) {
    return (
      <div className="rooms-page">
        <header className="rooms-header">
          <div>
            <span className="rooms-eyebrow">
              RESIDENTIAL SERVICES
            </span>

            <h1>
              Rooms & Residence
            </h1>

            <p>
              Manage BACE residence rooms,
              devotee assignments and
              current availability.
            </p>
          </div>

          <div className="rooms-header-actions">
            <button
              type="button"
              className="rooms-secondary-button"
              onClick={() => {
                setShowRoomForm(
                  !showRoomForm
                );
                setShowAssignForm(false);
                setError("");
              }}
            >
              {showRoomForm
                ? "Close"
                : "+ Add Room"}
            </button>

            <button
              type="button"
              className="rooms-primary-button"
              onClick={() => {
                if (showAssignForm) {
                  closeAssignForm();
                } else {
                  openAssignForm();
                  setShowRoomForm(false);
                }
              }}
            >
              {showAssignForm
                ? "Close"
                : "+ Assign Devotee"}
            </button>
          </div>
        </header>

        {error && (
          <div className="rooms-error">
            {error}
          </div>
        )}

        {showRoomForm && (
          <section className="rooms-form-card">
            <div className="rooms-card-header">
              <div>
                <span className="rooms-card-eyebrow">
                  ROOM REGISTRATION
                </span>

                <h2>
                  Add Residence Room
                </h2>
              </div>
            </div>

            <form
              className="rooms-form"
              onSubmit={
                createRoom
              }
            >
              <label>
                <span>
                  Floor No.
                </span>

                <select
                  name="floor"
                  value={
                    roomForm.floor
                  }
                  onChange={
                    handleRoomFormChange
                  }
                  required
                >
                  {FLOOR_OPTIONS.map(
                    (floor) => (
                      <option
                        key={
                          floor.value
                        }
                        value={
                          floor.value
                        }
                      >
                        {
                          floor.label
                        }
                      </option>
                    )
                  )}
                </select>

                <small>
                  Ground Floor is reserved
                  for common facilities.
                </small>
              </label>

              <label>
                <span>
                  Room No.
                </span>

                <input
                  type="text"
                  name="roomNumber"
                  value={
                    roomForm.roomNumber
                  }
                  onChange={
                    handleRoomFormChange
                  }
                  placeholder="e.g. 101"
                  required
                />
              </label>

              <label>
                <span>
                  Room Name
                </span>

                <input
                  type="text"
                  name="roomName"
                  value={
                    roomForm.roomName
                  }
                  onChange={
                    handleRoomFormChange
                  }
                  placeholder="e.g. Govardhan Kund"
                  required
                />
              </label>

              <label>
                <span>
                  Room Type
                </span>

                <select
                  name="roomType"
                  value={
                    roomForm.roomType
                  }
                  onChange={
                    handleRoomFormChange
                  }
                >
                  <option value="residential">
                    Residential
                  </option>

                  <option value="study">
                    Study Room
                  </option>
                </select>
              </label>

              {roomForm.roomType ===
                "residential" && (
                <label>
                  <span>
                    Maximum Occupancy
                  </span>

                  <input
                    type="number"
                    name="maximumOccupancy"
                    value={
                      roomForm.maximumOccupancy
                    }
                    onChange={
                      handleRoomFormChange
                    }
                    min="1"
                    placeholder="e.g. 4"
                    required
                  />
                </label>
              )}

              <div className="rooms-form-actions">
                <button
                  type="button"
                  className="rooms-secondary-button"
                  onClick={() => {
                    setShowRoomForm(
                      false
                    );
                    setError("");
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rooms-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : "Save Room"}
                </button>
              </div>
            </form>
          </section>
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
              onSubmit={
                assignDevotee
              }
            >
              <label>
                <span>
                  Available Room
                </span>

                <select
                  name="roomId"
                  value={
                    assignment.roomId
                  }
                  onChange={
                    handleAssignmentChange
                  }
                  required
                >
                  <option value="">
                    Select available room
                  </option>

                  {assignableRooms.map(
                    (room) => {
                      const vacancy =
                        getVacancy(
                          room
                        );

                      return (
                        <option
                          key={room.id}
                          value={
                            room.id
                          }
                        >
                          Floor{" "}
                          {room.floor} ·
                          Room{" "}
                          {
                            room.roomNumber
                          }{" "}
                          ·{" "}
                          {room.roomName ||
                            "Unnamed Room"}{" "}
                          · {vacancy}{" "}
                          vacancy
                        </option>
                      );
                    }
                  )}
                </select>

                {assignableRooms.length ===
                  0 && (
                  <small>
                    No residential rooms
                    currently have vacancy.
                  </small>
                )}
              </label>

              <label>
                <span>
                  Devotee
                </span>

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
                    Select active devotee
                  </option>

                  {availableDevotees.length ===
                  0 ? (
                    <option
                      value=""
                      disabled
                    >
                      No unassigned active
                      devotees
                    </option>
                  ) : (
                    availableDevotees.map(
                      (devotee) => (
                        <option
                          key={
                            devotee.uid
                          }
                          value={
                            devotee.uid
                          }
                        >
                          {devotee.name ||
                            devotee.email}
                        </option>
                      )
                    )
                  )}
                </select>

                <small>
                  Only active, unassigned
                  devotees are shown.
                </small>
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
            label="Residence Rooms"
            value={
              statistics.totalRooms
            }
            description="Residential rooms"
          />

          <RoomStat
            label="Total Capacity"
            value={
              statistics.totalCapacity
            }
            description="Maximum occupants"
          />

          <RoomStat
            label="Occupants"
            value={
              statistics.occupants
            }
            description="Currently assigned"
            type="occupied"
          />

          <RoomStat
            label="Vacancy"
            value={
              statistics.vacancy
            }
            description="Available spaces"
            type="available"
          />
        </section>

        <ResidencePlaces />

        <ResidenceReference />

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
            value={
              occupancyFilter
            }
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
                RESIDENCE DIRECTORY
              </span>

              <h2>
                BACE Residence Rooms
              </h2>
            </div>

            <span className="rooms-count">
              {
                filteredRooms.length
              }{" "}
              {filteredRooms.length ===
              1
                ? "room"
                : "rooms"}
            </span>
          </div>

          {filteredRooms.length ===
          0 ? (
            <EmptyRoomsState
              title="No rooms found"
              description={
                rooms.length === 0
                  ? "No room records have been added yet."
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
                    getOccupantsCount={
                      getOccupantsCount
                    }
                    getVacancy={
                      getVacancy
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

  /* ======================================================
   * DEVOTEE VIEW
   * ====================================================== */

  if (isDevotee) {
    const ownRooms =
      rooms.filter(
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

            <h1>
              My Room
            </h1>

            <p>
              View your assigned BACE
              residence and common
              facilities.
            </p>
          </div>
        </header>

        {error && (
          <div className="rooms-error">
            {error}
          </div>
        )}

        <ResidencePlaces />

        {ownRooms.length === 0 ? (
          <section className="rooms-empty-personal">
            <div className="rooms-empty-icon">
              ⌂
            </div>

            <h2>
              No Room Assigned
            </h2>

            <p>
              You currently do not have
              a residential room
              assignment. Please contact
              the BACE administrator.
            </p>
          </section>
        ) : (
          <div className="my-room-list">
            {ownRooms.map(
              (room) => {
                const occupants =
                  getOccupantsCount(
                    room
                  );

                const vacancy =
                  getVacancy(
                    room
                  );

                return (
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
                          {room.roomName ||
                            `Room ${room.roomNumber}`}
                        </h2>

                        <p className="my-room-identity">
                          Floor{" "}
                          {room.floor} ·
                          Room{" "}
                          {
                            room.roomNumber
                          }
                        </p>
                      </div>
                    </div>

                    <div className="my-room-details">
                      <div>
                        <span>
                          Floor
                        </span>

                        <strong>
                          {
                            room.floor
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Room No.
                        </span>

                        <strong>
                          {
                            room.roomNumber
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Room Name
                        </span>

                        <strong>
                          {room.roomName ||
                            "Not specified"}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Occupancy
                        </span>

                        <strong>
                          {occupants} /{" "}
                          {
                            room.maximumOccupancy
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Vacancy
                        </span>

                        <strong>
                          {vacancy}
                        </strong>
                      </div>
                    </div>

                    <div className="my-room-notice">
                      Room allocation is
                      managed by the BACE
                      administrator.
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

/* ======================================================
 * ROOM STAT
 * ====================================================== */

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

      <small>
        {description}
      </small>
    </article>
  );
}

/* ======================================================
 * ROOM CARD
 * ====================================================== */

function RoomCard({
  room,
  getDevoteeName,
  getDevoteeEmail,
  getOccupancyClass,
  getOccupantsCount,
  getVacancy,
  onRemove,
  saving,
}) {
  const occupancyClass =
    getOccupancyClass(room);

  const maximum =
    Number(
      room.maximumOccupancy
    ) || 0;

  const occupants =
    getOccupantsCount(room);

  const vacancy =
    getVacancy(room);

  const progress =
    maximum > 0
      ? Math.min(
          (occupants /
            maximum) *
            100,
          100
        )
      : 0;

  const isStudyRoom =
    room.roomType ===
    "study";

  return (
    <article className="room-card">
      <div className="room-card-top">
        <div>
          <span className="room-floor">
            Floor {room.floor}
          </span>

          <h3>
            {room.roomName ||
              `Room ${room.roomNumber}`}
          </h3>

          <small>
            Room No.{" "}
            {room.roomNumber}
          </small>
        </div>

        <span
          className={`room-status ${occupancyClass}`}
        >
          {isStudyRoom
            ? "Study Room"
            : maximum <= 0
              ? "Capacity not set"
              : vacancy > 0
                ? `${vacancy} available`
                : "Full"}
        </span>
      </div>

      {isStudyRoom ? (
        <div className="room-occupancy">
          <div className="room-occupancy-header">
            <span>
              Room Purpose
            </span>

            <strong>
              Study Only
            </strong>
          </div>
        </div>
      ) : (
        <div className="room-occupancy">
          <div className="room-occupancy-header">
            <span>
              Occupancy
            </span>

            <strong>
              {occupants} /{" "}
              {maximum}
            </strong>
          </div>

          <div className="room-progress">
            <span
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="room-occupancy-header">
            <span>
              Vacancy
            </span>

            <strong>
              {vacancy}
            </strong>
          </div>
        </div>
      )}

      <div className="room-occupants">
        <span className="room-section-label">
          OCCUPANTS
        </span>

        {isStudyRoom ? (
          <div className="room-no-occupants">
            This room is reserved
            for study purposes.
          </div>
        ) : room.occupants.length ===
          0 ? (
          <div className="room-no-occupants">
            No devotees assigned.
          </div>
        ) : (
          room.occupants.map(
            (uid) => (
              <div
                className="room-occupant"
                key={uid}
              >
                <div className="room-occupant-avatar">
                  {getDevoteeName(
                    uid
                  )
                    ?.charAt(0)
                    ?.toUpperCase() ||
                    "D"}
                </div>

                <div className="room-occupant-info">
                  <strong>
                    {getDevoteeName(
                      uid
                    )}
                  </strong>

                  <small>
                    {getDevoteeEmail(
                      uid
                    )}
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
            )
          )
        )}
      </div>
    </article>
  );
}

/* ======================================================
 * COMMON FACILITIES
 * ====================================================== */

function ResidencePlaces() {
  return (
    <section className="rooms-card facilities-card">
      <div className="rooms-card-header">
        <div>
          <span className="rooms-card-eyebrow">
            BACE FACILITIES
          </span>

          <h2>
            Common Areas & Sacred Spaces
          </h2>

          <p className="facilities-intro">
            Shared spaces available to
            the BACE community.
          </p>
        </div>
      </div>

      <div className="facilities-grid">
        {COMMON_FACILITIES.map(
          (facility) => (
            <article
              className={`facility-card ${
                facility.key ===
                "ground-floor"
                  ? "facility-ground"
                  : "facility-image-card"
              }`}
              key={
                facility.key
              }
            >
              {facility.image && (
                <div className="facility-image-wrap">
                  <img
                    src={
                      facility.image
                    }
                    alt={
                      facility.title
                    }
                    loading="lazy"
                    onError={(
                      event
                    ) => {
                      event.currentTarget.style.display =
                        "none";
                    }}
                  />
                </div>
              )}

              <div className="facility-card-content">
                <div className="facility-heading">
                  <div>
                    <span className="room-floor">
                      {
                        facility.label
                      }
                    </span>

                    <h3>
                      {
                        facility.title
                      }
                    </h3>

                    <p className="facility-subtitle">
                      {
                        facility.subtitle
                      }
                    </p>
                  </div>

                  <div className="facility-icon">
                    {
                      facility.icon
                    }
                  </div>
                </div>

                <p className="facility-description">
                  {
                    facility.description
                  }
                </p>

                <div className="facility-details">
                  {facility.details.map(
                    (detail) => (
                      <div
                        className="facility-detail"
                        key={
                          detail
                        }
                      >
                        <span>
                          ✓
                        </span>

                        <p>
                          {detail}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </article>
          )
        )}
      </div>
    </section>
  );
}

/* ======================================================
 * RESIDENCE REFERENCE
 * ====================================================== */

function ResidenceReference() {
  return (
    <section className="rooms-card residence-reference-card">
      <div className="rooms-card-header">
        <div>
          <span className="rooms-card-eyebrow">
            RESIDENCE LAYOUT
          </span>

          <h2>
            Floor Reference
          </h2>

          <p className="facilities-intro">
            Reference layout for the residential floors.
            Actual assignments are managed above.
          </p>
        </div>
      </div>

      <div className="reference-floor-grid">
        {FLOOR_REFERENCE.map(
          (floor) => (
            <article
              className="reference-floor"
              key={floor.floor}
            >
              <div className="reference-floor-header">
                <div>
                  <span>
                    RESIDENTIAL FLOOR
                  </span>

                  <h3>
                    {floor.floor}
                  </h3>
                </div>

                <span className="reference-room-count">
                  {
                    floor.rooms
                      .length
                  }{" "}
                  rooms
                </span>
              </div>

              <div className="reference-room-list">
                {floor.rooms.map(
                  (room) => (
                    <div
                      className="reference-room"
                      key={`${floor.floor}-${room.number}`}
                    >
                      <div className="reference-room-number">
                        {
                          room.number
                        }
                      </div>

                      <div className="reference-room-main">
                        <strong>
                          {room.name ||
                            `Room ${room.number}`}
                        </strong>

                        {room.studyOnly ? (
                          <span>
                            Study Room Only
                          </span>
                        ) : (
                          <span>
                            Capacity{" "}
                            {
                              room.capacity
                            }{" "}
                            ·{" "}
                            {
                              room.lockers
                            }{" "}
                            lockers
                          </span>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="reference-floor-notes">
                <div>
                  <span>
                    Passage
                  </span>

                  <strong>
                    {
                      floor.passage
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Facilities
                  </span>

                  <strong>
                    {
                      floor.bathroomInfo
                    }
                  </strong>
                </div>
              </div>
            </article>
          )
        )}
      </div>
    </section>
  );
}

/* ======================================================
 * EMPTY STATE
 * ====================================================== */

function EmptyRoomsState({
  title,
  description,
}) {
  return (
    <div className="rooms-empty">
      <div className="rooms-empty-icon">
        ⌂
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

export default Rooms;