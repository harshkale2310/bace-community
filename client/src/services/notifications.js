import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";

export async function createNotification({
  recipientId,
  type,
  title,
  message,
  metadata = {},
}) {
  if (!recipientId) {
    return;
  }

  await addDoc(
    collection(db, "notifications"),
    {
      recipientId,
      type,
      title,
      message,
      read: false,
      createdAt: serverTimestamp(),
      ...metadata,
    }
  );
}