import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    /*
     * Firebase automatically remembers the signed-in user.
     *
     * This listener runs:
     * - when the application starts
     * - after login
     * - after logout
     * - when Firebase restores an existing session
     */
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setAuthLoading(false);
          return;
        }

        try {
          /*
           * Firebase Authentication gives us the UID.
           *
           * Then we load the application profile from:
           *
           * /users/{uid}
           */
          const userRef = doc(
            db,
            "users",
            firebaseUser.uid
          );

          const userSnapshot = await getDoc(userRef);

          if (!userSnapshot.exists()) {
            console.error(
              "Firestore user profile not found:",
              firebaseUser.uid
            );

            await signOut(auth);

            setUser(null);
            setAuthLoading(false);
            return;
          }

          const profile = userSnapshot.data();

          /*
           * Only these roles are accepted.
           */
          if (
            profile.role !== "administrator" &&
            profile.role !== "devotee"
          ) {
            console.error(
              "Invalid user role:",
              profile.role
            );

            await signOut(auth);

            setUser(null);
            setAuthLoading(false);
            return;
          }

          /*
           * Check account status.
           */
          if (
            profile.status &&
            profile.status !== "active"
          ) {
            console.error(
              "User account is inactive."
            );

            await signOut(auth);

            setUser(null);
            setAuthLoading(false);
            return;
          }

          /*
           * Store Firebase + Firestore information
           * in our application state.
           */
          setUser({
            uid: firebaseUser.uid,

            name:
              profile.name ||
              firebaseUser.displayName ||
              "User",

            email:
              profile.email ||
              firebaseUser.email ||
              "",

            role: profile.role,

            status:
              profile.status ||
              "active",

            photoURL:
              profile.photoURL ||
              firebaseUser.photoURL ||
              null,
          });
        } catch (error) {
          console.error(
            "Failed to load user profile:",
            error
          );

          setUser(null);
        } finally {
          setAuthLoading(false);
        }
      }
    );

    /*
     * Clean up Firebase listener when the provider
     * is removed from the application.
     */
    return () => unsubscribe();
  }, []);

  /*
   * Login is mainly kept for compatibility with your
   * current Login.jsx.
   *
   * Firebase Authentication is the actual source of
   * authentication.
   */
  const login = (userData) => {
    if (!userData) {
      return;
    }

    setUser(userData);
  };

  /*
   * Firebase performs the actual logout.
   */
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error(
        "Failed to logout:",
        error
      );
    }
  };

  /*
   * Update information in the local application state.
   *
   * Firestore updates should be performed by the
   * corresponding page/service and then update this state.
   */
  const updateUser = (updatedData) => {
    setUser((currentUser) => {
      if (!currentUser) {
        return null;
      }

      return {
        ...currentUser,
        ...updatedData,
      };
    });
  };

  const isAuthenticated = Boolean(user);

  const isAdministrator =
    user?.role === "administrator";

  const isDevotee =
    user?.role === "devotee";

  const value = {
    user,
    setUser,

    login,
    logout,
    updateUser,

    isAuthenticated,
    isAdministrator,
    isDevotee,

    /*
     * Important for ProtectedRoute.
     *
     * While Firebase is checking whether a user
     * is already signed in, authLoading is true.
     */
    authLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}

export default AuthContext;