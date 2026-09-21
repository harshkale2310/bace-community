import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "./firebase";

/**
 * Permanently removes all Firestore data belonging to one devotee.
 *
 * Deletes:
 * - users/{devoteeUid}
 * - leaveRequests belonging to devotee
 * - sadhana records belonging to devotee
 *
 * Updates:
 * - rooms containing devotee UID
 *
 * IMPORTANT:
 * This does NOT delete the Firebase Authentication account.
 * Authentication deletion must be handled server-side/Admin SDK.
 */
export async function deleteDevoteeFirestoreData(
  devoteeUid
) {
  if (!devoteeUid) {
    throw new Error(
      "Devotee UID is required."
    );
  }

  /*
   * ------------------------------------------------------------
   * FIND ALL RELATED DATA
   * ------------------------------------------------------------
   */

  const leaveQuery = query(
    collection(db, "leaveRequests"),
    where(
      "devoteeId",
      "==",
      devoteeUid
    )
  );

  const sadhanaQuery = query(
    collection(db, "sadhana"),
    where(
      "devoteeId",
      "==",
      devoteeUid
    )
  );

  const roomsQuery = query(
    collection(db, "rooms")
  );

  const [
    leaveSnapshot,
    sadhanaSnapshot,
    roomsSnapshot,
  ] = await Promise.all([
    getDocs(leaveQuery),
    getDocs(sadhanaQuery),
    getDocs(roomsQuery),
  ]);

  /*
   * ------------------------------------------------------------
   * DELETE DEVOTEE'S LEAVE REQUESTS
   * ------------------------------------------------------------
   */

  const leaveBatch = writeBatch(db);

  leaveSnapshot.forEach(
    (leaveDocument) => {
      leaveBatch.delete(
        leaveDocument.ref
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * DELETE DEVOTEE'S SADHANA RECORDS
   * ------------------------------------------------------------
   */

  sadhanaSnapshot.forEach(
    (sadhanaDocument) => {
      leaveBatch.delete(
        sadhanaDocument.ref
      );
    }
  );

  /*
   * ------------------------------------------------------------
   * DELETE DEVOTEE USER PROFILE
   * ------------------------------------------------------------
   */

  leaveBatch.delete(
    doc(
      db,
      "users",
      devoteeUid
    )
  );

  await leaveBatch.commit();

  /*
   * ------------------------------------------------------------
   * REMOVE DEVOTEE FROM ROOMS
   * ------------------------------------------------------------
   *
   * The room itself must NOT be deleted.
   *
   * Example:
   *
   * occupants:
   * [
   *   "devoteeA",
   *   "devoteeB"
   * ]
   *
   * after deleting devoteeA:
   *
   * occupants:
   * [
   *   "devoteeB"
   * ]
   */

  const roomUpdates = [];

  roomsSnapshot.forEach(
    (roomDocument) => {
      const roomData =
        roomDocument.data();

      const occupants =
        Array.isArray(
          roomData.occupants
        )
          ? roomData.occupants
          : [];

      if (
        occupants.includes(
          devoteeUid
        )
      ) {
        const updatedOccupants =
          occupants.filter(
            (occupantId) =>
              occupantId !==
              devoteeUid
          );

        roomUpdates.push(
          updateDoc(
            roomDocument.ref,
            {
              occupants:
                updatedOccupants,
            }
          )
        );
      }
    }
  );

  await Promise.all(
    roomUpdates
  );

  return {
    deletedLeaveRequests:
      leaveSnapshot.size,

    deletedSadhanaRecords:
      sadhanaSnapshot.size,

    updatedRooms:
      roomUpdates.length,

    deletedUserProfile: true,
  };
}