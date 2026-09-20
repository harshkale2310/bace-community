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

/*
 * ============================================================
 * AUTH CONTEXT PROVIDER
 * ============================================================
 */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  /*
   * ==========================================================
   * FIREBASE AUTH STATE LISTENER
   * ==========================================================
   *
   * Firebase automatically remembers authentication state.
   *
   * This listener runs:
   *
   * - when the application starts
   * - after a successful Firebase login
   * - after logout
   * - when Firebase restores an existing session
   */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          /*
           * --------------------------------------------------
           * NO FIREBASE USER
           * --------------------------------------------------
           */

          if (!firebaseUser) {
            setUser(null);
            setAuthLoading(false);
            return;
          }

          try {
            /*
             * ------------------------------------------------
             * LOAD FIRESTORE USER PROFILE
             * ------------------------------------------------
             *
             * Firebase Authentication provides the UID.
             *
             * Application information is stored at:
             *
             * users/{uid}
             */

            const userRef = doc(
              db,
              "users",
              firebaseUser.uid
            );

            const userSnapshot =
              await getDoc(userRef);

            /*
             * ------------------------------------------------
             * FIREBASE ACCOUNT EXISTS BUT PROFILE DOES NOT
             * ------------------------------------------------
             *
             * Do not allow the user into the application
             * without a valid Firestore profile.
             */

            if (!userSnapshot.exists()) {
              console.error(
                "Firestore user profile not found."
              );

              try {
                await signOut(auth);
              } catch (signOutError) {
                console.error(
                  "Failed to sign out user without profile:",
                  signOutError
                );
              }

              setUser(null);
              setAuthLoading(false);

              return;
            }

            const profile =
              userSnapshot.data();

            /*
             * ------------------------------------------------
             * VALIDATE ROLE
             * ------------------------------------------------
             *
             * The application supports only:
             *
             * administrator
             * devotee
             */

            const userRole =
              String(
                profile.role || ""
              )
                .trim()
                .toLowerCase();

            if (
              userRole !== "administrator" &&
              userRole !== "devotee"
            ) {
              console.error(
                "Invalid user role:",
                profile.role
              );

              try {
                await signOut(auth);
              } catch (signOutError) {
                console.error(
                  "Failed to sign out invalid-role user:",
                  signOutError
                );
              }

              setUser(null);
              setAuthLoading(false);

              return;
            }

            /*
             * ------------------------------------------------
             * VALIDATE ACCOUNT STATUS
             * ------------------------------------------------
             *
             * Only:
             *
             * active
             *
             * can enter the application.
             *
             * inactive/deleted/unknown status:
             * sign out.
             */

            const accountStatus =
              String(
                profile.status || "active"
              )
                .trim()
                .toLowerCase();

            if (
              accountStatus !== "active"
            ) {
              if (
                accountStatus === "deleted"
              ) {
                console.warn(
                  "This user account has been deleted."
                );
              } else if (
                accountStatus === "inactive"
              ) {
                console.warn(
                  "This user account is inactive."
                );
              } else {
                console.warn(
                  "This user account has an invalid status:",
                  profile.status
                );
              }

              try {
                await signOut(auth);
              } catch (signOutError) {
                console.error(
                  "Failed to sign out inactive/deleted user:",
                  signOutError
                );
              }

              setUser(null);
              setAuthLoading(false);

              return;
            }

            /*
             * ------------------------------------------------
             * CREATE APPLICATION USER
             * ------------------------------------------------
             *
             * UID is stored internally because Firestore
             * operations need it.
             *
             * Do not display UID in the UI.
             */

            const applicationUser = {
              uid: firebaseUser.uid,

              name:
                profile.name ||
                firebaseUser.displayName ||
                "User",

              email:
                profile.email ||
                firebaseUser.email ||
                "",

              phone:
                profile.phone ||
                "",

              role: userRole,

              status: "active",

              department:
                profile.department ||
                "",

              seva:
                profile.seva ||
                "",

              rounds:
                Number(
                  profile.rounds || 0
                ),

              reading:
                Number(
                  profile.reading || 0
                ),

              photoURL:
                profile.photoURL ||
                firebaseUser.photoURL ||
                null,

              createdAt:
                profile.createdAt ||
                null,

              updatedAt:
                profile.updatedAt ||
                null,
            };

            /*
             * Store validated user.
             */

            setUser(
              applicationUser
            );
          } catch (error) {
            /*
             * ------------------------------------------------
             * PROFILE VALIDATION ERROR
             * ------------------------------------------------
             *
             * If Firestore fails, do not leave the application
             * looking authenticated.
             */

            console.error(
              "Failed to load user profile:",
              error
            );

            setUser(null);

            try {
              await signOut(auth);
            } catch (signOutError) {
              console.error(
                "Failed to sign out after profile error:",
                signOutError
              );
            }
          } finally {
            setAuthLoading(false);
          }
        }
      );

    /*
     * --------------------------------------------------------
     * CLEANUP
     * --------------------------------------------------------
     */

    return () => {
      unsubscribe();
    };
  }, []);

  /*
   * ==========================================================
   * LOGIN
   * ==========================================================
   *
   * Firebase Authentication is still the real authentication
   * mechanism.
   *
   * This function remains for compatibility with existing
   * components that may call login().
   */

  const login = (userData) => {
    if (!userData) {
      return;
    }

    /*
     * Validate status.
     */

    const status =
      String(
        userData.status || "active"
      )
        .trim()
        .toLowerCase();

    if (status !== "active") {
      console.warn(
        "Attempted to place inactive/deleted user into auth state."
      );

      setUser(null);
      return;
    }

    /*
     * Validate role.
     */

    const role =
      String(
        userData.role || ""
      )
        .trim()
        .toLowerCase();

    if (
      role !== "administrator" &&
      role !== "devotee"
    ) {
      console.warn(
        "Attempted to place user with invalid role into auth state."
      );

      setUser(null);
      return;
    }

    /*
     * Store validated user.
     */

    setUser({
      ...userData,

      role,

      status: "active",
    });
  };

  /*
   * ==========================================================
   * LOGOUT
   * ==========================================================
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
   * ==========================================================
   * UPDATE USER
   * ==========================================================
   *
   * This only updates local React state.
   *
   * Firestore should be updated by the corresponding page or
   * service first.
   */

  const updateUser = (
    updatedData
  ) => {
    setUser(
      (currentUser) => {
        /*
         * No current user.
         */

        if (!currentUser) {
          return null;
        }

        /*
         * Merge new information.
         */

        const nextUser = {
          ...currentUser,
          ...updatedData,
        };

        /*
         * Validate status.
         */

        const nextStatus =
          String(
            nextUser.status ||
              "active"
          )
            .trim()
            .toLowerCase();

        if (
          nextStatus !== "active"
        ) {
          console.warn(
            "Blocked inactive/deleted user from local auth state."
          );

          return null;
        }

        /*
         * Validate role.
         */

        const nextRole =
          String(
            nextUser.role || ""
          )
            .trim()
            .toLowerCase();

        if (
          nextRole !==
            "administrator" &&
          nextRole !== "devotee"
        ) {
          console.warn(
            "Blocked invalid role from local auth state."
          );

          return null;
        }

        /*
         * Return validated user.
         */

        return {
          ...nextUser,

          role: nextRole,

          status: "active",
        };
      }
    );
  };

  /*
   * ==========================================================
   * AUTH STATE
   * ==========================================================
   */

  const isAuthenticated =
    Boolean(user) &&
    user?.status === "active";

  const isAdministrator =
    isAuthenticated &&
    user?.role ===
      "administrator";

  const isDevotee =
    isAuthenticated &&
    user?.role === "devotee";

  /*
   * ==========================================================
   * CONTEXT VALUE
   * ==========================================================
   */

  const value = {
    user,

    setUser,

    login,

    logout,

    updateUser,

    isAuthenticated,

    isAdministrator,

    isDevotee,

    authLoading,
  };

  /*
   * ==========================================================
   * PROVIDER
   * ==========================================================
   */

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

/*
 * ============================================================
 * useAuth HOOK
 * ============================================================
 */

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}

export default AuthContext;