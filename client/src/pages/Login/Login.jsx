import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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

  const [role, setRole] = useState("administrator");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleRoleChange = (selectedRole) => {
    setRole(selectedRole);

    setError("");
    setResetMessage("");

    setFormData({
      email: "",
      password: "",
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

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

  const validateForm = () => {
    if (!formData.email.trim()) {
      return "Please enter your email address.";
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      return "Please enter a valid email address.";
    }

    if (!formData.password) {
      return "Please enter your password.";
    }

    return "";
  };

  const getFirebaseErrorMessage = (firebaseError) => {
    switch (firebaseError.code) {
      case "auth/invalid-credential":
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

      default:
        return "Unable to sign in. Please try again.";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setResetMessage("");

    try {
      /*
       * Firebase Authentication
       */
      const credential = await signInWithEmailAndPassword(
        auth,
        formData.email.trim(),
        formData.password
      );

      const firebaseUser = credential.user;

      /*
       * Load the user's Firestore profile.
       *
       * Firestore role is the actual authority.
       */
      const userRef = doc(db, "users", firebaseUser.uid);

      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        await auth.signOut();

        setError(
          "Your account profile was not found. Please contact the administrator."
        );

        return;
      }

      const profile = userSnapshot.data();

      /*
       * Validate role.
       *
       * The selected role cannot override the
       * role stored in Firestore.
       */
      if (profile.role !== role) {
        await auth.signOut();

        setError(
          `This account is registered as a ${
            profile.role === "administrator"
              ? "Administrator"
              : "Devotee"
          }. Please select the correct account type.`
        );

        return;
      }

      /*
       * Check account status.
       */
      if (profile.status && profile.status !== "active") {
        await auth.signOut();

        setError(
          "Your account is currently inactive. Please contact the administrator."
        );

        return;
      }

      /*
       * AuthContext listens to Firebase authentication
       * and loads the Firestore profile automatically.
       */

      const requestedPath =
        location.state?.from?.pathname || "/dashboard";

      navigate(requestedPath, { replace: true });
    } catch (submitError) {
      console.error("Login error:", submitError);

      setError(getFirebaseErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setResetMessage("");

    const email = formData.email.trim();

    if (!email) {
      setError("Enter your email address first to reset your password.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);

      setResetMessage(
        "Password reset instructions have been sent to your email."
      );
    } catch (resetError) {
      console.error("Password reset error:", resetError);

      if (resetError.code === "auth/user-not-found") {
        setError("No account was found with this email address.");
      } else if (resetError.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Unable to send the password reset email. Please try again.");
      }
    }
  };

  return (
    <main className="login-page">

      {/* ============================================================
          TOP NAVIGATION
      ============================================================ */}

      <nav className="auth-top-navigation">

        <Link
          to="/"
          className="auth-nav-brand"
          aria-label="Temple Base Home"
        >
          <span className="auth-nav-brand-icon">
            ॐ
          </span>

          <span className="auth-nav-brand-text">
            Temple Base
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


      {/* ============================================================
          LOGIN SHELL
      ============================================================ */}

      <section className="login-shell">

        {/* ==========================================================
            LEFT VISUAL PANEL
        =========================================================== */}

        <div className="login-visual">

          <div className="login-visual-image">

            <img
              src={krishnaImage}
              alt="Lord Krishna"
            />

            <div className="login-image-overlay"></div>

          </div>

          <div className="login-visual-content">

            <div className="login-om">
              ॐ
            </div>

            <p className="login-visual-label">
              HARE KRISHNA
            </p>

            <h1>
              Temple
              <span>Base Management</span>
            </h1>

            <p>
              A centralized platform for organized
              temple administration and devotee
              management.
            </p>

          </div>

        </div>


        {/* ==========================================================
            RIGHT LOGIN PANEL
        =========================================================== */}

        <div className="login-panel">

          <div className="login-card">

            {/* Header */}

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


            {/* ======================================================
                ROLE SELECTOR
            ======================================================= */}

            <div className="role-selector">

              <button
                type="button"
                className={
                  role === "administrator"
                    ? "role-option active"
                    : "role-option"
                }
                onClick={() =>
                  handleRoleChange("administrator")
                }
                disabled={isSubmitting}
              >

                <span className="role-icon">
                  ♙
                </span>

                <span className="role-text">

                  <strong>
                    Administrator
                  </strong>

                  <small>
                    Manage temple operations
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
                  handleRoleChange("devotee")
                }
                disabled={isSubmitting}
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


            {/* ======================================================
                LOGIN FORM
            ======================================================= */}

            <form
              className="login-form"
              onSubmit={handleSubmit}
              noValidate
            >

              {/* Email */}

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
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    autoComplete="email"
                    disabled={isSubmitting}
                  />

                </div>

              </div>


              {/* Password */}

              <div className="form-group">

                <div className="password-label-row">

                  <label htmlFor="password">
                    Password
                  </label>

                  <button
                    type="button"
                    className="forgot-password"
                    onClick={handleForgotPassword}
                    disabled={isSubmitting}
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
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword(
                        (previous) => !previous
                      )
                    }
                    disabled={isSubmitting}
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>

                </div>

              </div>


              {/* Error */}

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


              {/* Success */}

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


              {/* Submit */}

              <button
                type="submit"
                className="login-submit"
                disabled={isSubmitting}
              >

                {isSubmitting ? (
                  <>
                    <span className="login-spinner"></span>
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


            {/* ======================================================
                REGISTER LINK
            ======================================================= */}

            <div className="login-register-prompt">

              <span>
                Don't have an account?
              </span>

              <Link to="/register">
                Create a devotee account
              </Link>

            </div>


            {/* ======================================================
                FOOTER
            ======================================================= */}

            <div className="login-footer">

              <span>
                Temple Base Management
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