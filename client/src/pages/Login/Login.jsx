import { useEffect, useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { useAuth } from "../../context/AuthContext";

import { auth, db } from "../../services/firebase";

import krishnaImage from "../../assets/krishna.png";

import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const { isAuthenticated } = useAuth();

  /*
   * Public registration always creates a devotee account.
   *
   * Therefore, when the user has just registered,
   * automatically select Devotee.
   *
   * Normal login defaults to Administrator.
   */
  const [role, setRole] = useState(
    location.state?.registered
      ? "devotee"
      : "administrator"
  );

  const [formData, setFormData] = useState({
    email: location.state?.email || "",
    password: "",
  });

  const [showPassword, setShowPassword] =
    useState(false);

  const [error, setError] = useState("");

  const [resetMessage, setResetMessage] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  /*
   * If the user is already authenticated,
   * do not keep them on Login.
   */
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", {
        replace: true,
      });
    }
  }, [
    isAuthenticated,
    navigate,
  ]);

  /*
   * Show registration success message.
   */
  useEffect(() => {
    if (location.state?.registered) {
      setResetMessage(
        "Registration successful. Please sign in with your new devotee account."
      );
    }
  }, [location.state]);

  /*
   * ---------------------------------------------------------
   * ROLE CHANGE
   * ---------------------------------------------------------
   */

  const handleRoleChange = (
    selectedRole
  ) => {
    setRole(selectedRole);

    setError("");

    setResetMessage("");

    setFormData((previous) => ({
      ...previous,
      password: "",
    }));
  };

  /*
   * ---------------------------------------------------------
   * INPUT CHANGE
   * ---------------------------------------------------------
   */

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }

    if (resetMessage) {
      setResetMessage("");
    }
  };

  /*
   * ---------------------------------------------------------
   * FORM VALIDATION
   * ---------------------------------------------------------
   */

  const validateForm = () => {
    const email =
      formData.email.trim();

    if (!email) {
      return "Please enter your email address.";
    }

    /*
     * Correct email validation.
     */
    if (
      !/^\S+@\S+\.\S+$/.test(email)
    ) {
      return "Please enter a valid email address.";
    }

    if (!formData.password) {
      return "Please enter your password.";
    }

    return "";
  };

  /*
   * ---------------------------------------------------------
   * FIREBASE ERROR MESSAGE
   * ---------------------------------------------------------
   */

  const getFirebaseErrorMessage = (
    firebaseError
  ) => {
    switch (firebaseError.code) {
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password.";

      case "auth/invalid-email":
        return "Please enter a valid email address.";

      case "auth/user-disabled":
        return "This account has been disabled. Please contact the administrator.";

      case "auth/too-many-requests":
        return "Too many unsuccessful attempts. Please wait a moment and try again.";

      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";

      case "auth/operation-not-allowed":
        return "Email and password sign-in is not enabled.";

      default:
        return "Unable to sign in. Please try again.";
    }
  };

  /*
   * ---------------------------------------------------------
   * LOGIN
   * ---------------------------------------------------------
   */

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setResetMessage("");

    try {
      const email =
        formData.email
          .trim()
          .toLowerCase();

      /*
       * -----------------------------------------------------
       * 1. FIREBASE AUTHENTICATION
       * -----------------------------------------------------
       */

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          formData.password
        );

      const firebaseUser =
        credential.user;

      /*
       * -----------------------------------------------------
       * 2. LOAD FIRESTORE PROFILE
       * -----------------------------------------------------
       */

      const userRef = doc(
        db,
        "users",
        firebaseUser.uid
      );

      const userSnapshot =
        await getDoc(userRef);

      /*
       * -----------------------------------------------------
       * 3. PROFILE MUST EXIST
       * -----------------------------------------------------
       */

      if (!userSnapshot.exists()) {
        await signOut(auth);

        setError(
          "Your account profile was not found. Please contact the administrator."
        );

        return;
      }

      const profile =
        userSnapshot.data();

      /*
       * -----------------------------------------------------
       * 4. NORMALIZE ROLE
       * -----------------------------------------------------
       */

      const profileRole =
        String(
          profile.role || ""
        )
          .trim()
          .toLowerCase();

      /*
       * -----------------------------------------------------
       * 5. VALIDATE ROLE
       * -----------------------------------------------------
       */

      if (
        profileRole !==
          "administrator" &&
        profileRole !== "devotee"
      ) {
        await signOut(auth);

        setError(
          "Your account has an invalid account type. Please contact the administrator."
        );

        return;
      }

      /*
       * -----------------------------------------------------
       * 6. CHECK SELECTED LOGIN TYPE
       * -----------------------------------------------------
       */

      if (
        profileRole !== role
      ) {
        await signOut(auth);

        const accountType =
          profileRole ===
          "administrator"
            ? "Administrator"
            : "Devotee";

        setError(
          `This account is registered as a ${accountType}. Please select the correct account type.`
        );

        return;
      }

      /*
       * -----------------------------------------------------
       * 7. CHECK ACCOUNT STATUS
       * -----------------------------------------------------
       *
       * Only active users can enter.
       */

      const accountStatus =
        String(
          profile.status ||
            "active"
        )
          .trim()
          .toLowerCase();

      if (
        accountStatus !== "active"
      ) {
        await signOut(auth);

        if (
          accountStatus ===
          "deleted"
        ) {
          setError(
            "This account has been deleted. Please contact the administrator."
          );
        } else {
          setError(
            "Your account is currently inactive. Please contact the administrator."
          );
        }

        return;
      }

      /*
       * -----------------------------------------------------
       * 8. SUCCESS
       * -----------------------------------------------------
       *
       * AuthContext will receive the Firebase auth state,
       * load the Firestore profile and populate user state.
       */

      const requestedPath =
        location.state?.from
          ?.pathname ||
        "/dashboard";

      navigate(
        requestedPath,
        {
          replace: true,
        }
      );
    } catch (submitError) {
      console.error(
        "Login error:",
        submitError
      );

      /*
       * Make sure a failed profile validation
       * cannot leave the Firebase account signed in.
       */
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Login cleanup sign-out error:",
            signOutError
          );
        }
      }

      setError(
        getFirebaseErrorMessage(
          submitError
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * ---------------------------------------------------------
   * FORGOT PASSWORD
   * ---------------------------------------------------------
   */

  const handleForgotPassword =
    async () => {
      setError("");
      setResetMessage("");

      const email =
        formData.email
          .trim()
          .toLowerCase();

      if (!email) {
        setError(
          "Enter your email address first to reset your password."
        );
        return;
      }

      if (
        !/^\S+@\S+\.\S+$/.test(
          email
        )
      ) {
        setError(
          "Please enter a valid email address."
        );
        return;
      }

      try {
        await sendPasswordResetEmail(
          auth,
          email
        );

        setResetMessage(
          "Password reset instructions have been sent to your email."
        );
      } catch (resetError) {
        console.error(
          "Password reset error:",
          resetError
        );

        switch (
          resetError.code
        ) {
          case "auth/user-not-found":
            setError(
              "No account was found with this email address."
            );
            break;

          case "auth/invalid-email":
            setError(
              "Please enter a valid email address."
            );
            break;

          case "auth/too-many-requests":
            setError(
              "Too many requests. Please wait a moment and try again."
            );
            break;

          case "auth/network-request-failed":
            setError(
              "Network error. Please check your internet connection."
            );
            break;

          default:
            setError(
              "Unable to send the password reset email. Please try again."
            );
        }
      }
    };

  return (
    <main className="login-page">

      {/* TOP NAVIGATION */}

      <nav className="auth-top-navigation">

        <Link
          to="/"
          className="auth-nav-brand"
          aria-label="Giri Govardhan BACE Home"
        >
          <span className="auth-nav-brand-icon">
            ॐ
          </span>

          <span className="auth-nav-brand-text">
            Giri Govardhan BACE
          </span>
        </Link>

        <div className="auth-nav-links">

          <Link
            to="/"
            className="auth-nav-link"
          >
            Home
          </Link>

          <Link
            to="/login"
            className="auth-nav-link active"
          >
            Login
          </Link>

          <Link
            to="/register"
            className="auth-nav-link"
          >
            Register
          </Link>

        </div>
      </nav>

      {/* LOGIN SHELL */}

      <section className="login-shell">

        {/* LEFT VISUAL */}

        <div className="login-visual">

          <div className="login-visual-image">

            <img
              src={krishnaImage}
              alt="Lord Krishna"
            />

            <div className="login-image-overlay" />

          </div>

          <div className="login-visual-content">

            <div className="login-om">
              ॐ
            </div>

            <p className="login-visual-label">
              HARE KRISHNA
            </p>

            <h1>

              <span className="brand-main">
                Giri Govardhan
              </span>

              <span className="brand-accent">
                BACE
              </span>

            </h1>

            <div className="login-hero-divider">

              <span />

              <span className="divider-symbol">
                ❈
              </span>

              <span />

            </div>

            <p className="login-visual-description">
              A simple and organized platform for
              devotee activities, attendance, sadhana,
              seva, rooms, leave and daily routines.
            </p>

          </div>
        </div>

        {/* RIGHT LOGIN PANEL */}

        <div className="login-panel">

          <div className="login-card">

            {/* HEADER */}

            <div className="login-header">

              <Link
                to="/"
                className="login-back-link"
              >
                <span aria-hidden="true">
                  ←
                </span>

                Back to Home
              </Link>

              <div className="login-brand-mark">
                ॐ
              </div>

              <p className="login-eyebrow">
                WELCOME BACK
              </p>

              <h2>
                Sign in to your account
              </h2>

              <p className="login-description">
                Choose your account type and enter
                your credentials to continue.
              </p>

            </div>

            {/* ROLE SELECTOR */}

            <div className="role-selector">

              <button
                type="button"
                className={
                  role ===
                  "administrator"
                    ? "role-option active"
                    : "role-option"
                }
                onClick={() =>
                  handleRoleChange(
                    "administrator"
                  )
                }
                disabled={
                  isSubmitting
                }
              >

                <span className="role-icon">
                  ♙
                </span>

                <span className="role-text">

                  <strong>
                    Administrator
                  </strong>

                  <small>
                    Manage devotees and operations
                  </small>

                </span>

              </button>

              <button
                type="button"
                className={
                  role === "devotee"
                    ? "role-option active"
                    : "role-option"
                }
                onClick={() =>
                  handleRoleChange(
                    "devotee"
                  )
                }
                disabled={
                  isSubmitting
                }
              >

                <span className="role-icon">
                  ॐ
                </span>

                <span className="role-text">

                  <strong>
                    Devotee
                  </strong>

                  <small>
                    Access your personal area
                  </small>

                </span>

              </button>

            </div>

            {/* LOGIN FORM */}

            <form
              className="login-form"
              onSubmit={handleSubmit}
              noValidate
            >

              {/* EMAIL */}

              <div className="form-group">

                <label htmlFor="email">
                  Email address
                </label>

                <div className="input-wrapper">

                  <span
                    className="input-icon"
                    aria-hidden="true"
                  >
                    @
                  </span>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={
                      formData.email
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Enter your email"
                    autoComplete="email"
                    disabled={
                      isSubmitting
                    }
                  />

                </div>

              </div>

              {/* PASSWORD */}

              <div className="form-group">

                <div className="password-label-row">

                  <label htmlFor="password">
                    Password
                  </label>

                  <button
                    type="button"
                    className="forgot-password"
                    onClick={
                      handleForgotPassword
                    }
                    disabled={
                      isSubmitting
                    }
                  >
                    Forgot password?
                  </button>

                </div>

                <div className="input-wrapper">

                  <span
                    className="input-icon password-icon"
                    aria-hidden="true"
                  >
                    •••
                  </span>

                  <input
                    id="password"
                    name="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      formData.password
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={
                      isSubmitting
                    }
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(
                        (previous) =>
                          !previous
                      )
                    }
                    disabled={
                      isSubmitting
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword
                      ? "Hide"
                      : "Show"}
                  </button>

                </div>

              </div>

              {/* ERROR */}

              {error && (
                <div
                  className="login-error"
                  role="alert"
                >

                  <span
                    className="error-icon"
                    aria-hidden="true"
                  >
                    !
                  </span>

                  <span>
                    {error}
                  </span>

                </div>
              )}

              {/* SUCCESS */}

              {resetMessage && (
                <div
                  className="login-success"
                  role="status"
                >

                  <span
                    className="success-icon"
                    aria-hidden="true"
                  >
                    ✓
                  </span>

                  <span>
                    {resetMessage}
                  </span>

                </div>
              )}

              {/* SUBMIT */}

              <button
                type="submit"
                className="login-submit"
                disabled={
                  isSubmitting
                }
              >

                {isSubmitting ? (
                  <>
                    <span className="login-spinner" />

                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in

                    <span aria-hidden="true">
                      →
                    </span>
                  </>
                )}

              </button>

            </form>

            {/* REGISTER PROMPT */}

            <div className="login-register-prompt">

              <span>
                Don't have an account?
              </span>

              <Link to="/register">
                Create a devotee account
              </Link>

            </div>

            {/* FOOTER */}

            <div className="login-footer">

              <span>
                Giri Govardhan BACE
              </span>

              <span className="footer-dot">
                •
              </span>

              <span>
                Hare Krishna
              </span>

            </div>

          </div>
        </div>
      </section>
    </main>
  );
}

export default Login;