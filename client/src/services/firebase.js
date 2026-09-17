import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/*
 * Primary Firebase application.
 *
 * This is the application used by the currently signed-in
 * administrator/devotee.
 */
const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/*
 * Secondary Firebase application.
 *
 * This allows an administrator to create a new Firebase
 * Authentication account without signing the administrator
 * out of the primary application.
 */
const secondaryFirebaseApp = initializeApp(
  firebaseConfig,
  "secondaryFirebaseApp"
);

const secondaryAuth = getAuth(secondaryFirebaseApp);

export {
  firebaseApp,
  auth,
  db,
  secondaryFirebaseApp,
  secondaryAuth,
};