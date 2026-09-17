import { useEffect, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { createUserWithEmailAndPassword } from "firebase/auth";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { useAuth } from "../../context/AuthContext";

import { auth, db } from "../../services/firebase";

import krishnaImage from "../../assets/krishna.png";

import "./Register.css";

function Register() {
  const navigate = useNavigate();

  const { isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const validateForm = () => {
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();

    if (!trimmedName) {
      return "Please enter your full name.";
    }

    if (trimmedName.length < 2) {
      return "Name must contain at least 2 characters.";
    }

    if (!trimmedEmail) {
      return "Please enter your email address.";
    }

    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      return "Please enter a valid email address.";
    }

    if (!formData.password) {
      return "Please create a password.";
    }

    if (formData.password.length < 6) {
      return "Password must contain at least 6 characters.";
    }

    if (!formData.confirmPassword) {
      return "Please confirm your password.";
    }

    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const getFirebaseErrorMessage = (firebaseError) => {
    switch (firebaseError.code) {
      case "auth/email-already-in-use":
        return "An account with this email already exists. Please sign in instead.";

      case "auth/invalid-email":
        return "Please enter a valid email address.";

      case "auth/weak-password":
        return "Your password is too weak. Please use at least 6 characters.";

      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";

      case "auth/operation-not-allowed":
        return "Email and password registration is not enabled in Firebase.";

      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";

      default:
        return "Unable to create your account. Please try again.";
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

    try {
      const email = formData.email.trim().toLowerCase();
      const name = formData.name.trim();

      // Create Firebase Authentication account.
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        formData.password
      );

      const firebaseUser = credential.user;

      /*
       * Every public registration creates a devotee account.
       * Administrator accounts are created separately.
       */

      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        name,
        email,
        role: "devotee",
        status: "active",
        department: "Giri Govardhan BACE",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      /*
       * AuthContext listens for the Firebase user and
       * loads the Firestore profile automatically.
       */

      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      console.error("Registration error:", submitError);

      if (
        submitError.code === "permission-denied" ||
        submitError.code === "firestore/permission-denied"
      ) {
        setError(
          "Your authentication account was created, but your profile could not be saved. Please check your account permissions."
        );
      } else {
        setError(getFirebaseErrorMessage(submitError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="register-page">
      {/* Top Navigation */}
      <nav className="auth-top-navigation">
        <Link
          to="/"
          className="auth-nav-brand"
          aria-label="Giri Govardhan BACE Home"
        >
          <span className="auth-nav-brand-icon">ॐ</span>

          <span className="auth-nav-brand-text">
            Giri Govardhan BACE
          </span>
        </Link>

        <div className="auth-nav-links">
          <Link to="/" className="auth-nav-link">
            Home
          </Link>

          <Link to="/login" className="auth-nav-link">
            Login
          </Link>

          <Link to="/register" className="auth-nav-link active">
            Register
          </Link>
        </div>
      </nav>

      {/* Register Shell */}
      <section className="register-shell">
        {/* Left Visual Panel */}
        <div className="register-visual">
          <div className="register-visual-image">
            <img src={krishnaImage} alt="Lord Krishna" />

            <div className="register-image-overlay" />
          </div>

          <div className="register-visual-content">
            <div className="register-om">ॐ</div>

            <p className="register-visual-label">
              GIRI GOVARDHAN BACE
            </p>

            <h1 className="register-visual-title">
              <span className="register-title-main">
                Begin Your
              </span>

              <span className="register-title-accent">
                Journey
              </span>
            </h1>

            <p className="register-visual-description">
              Create your devotee account and stay connected
              with your daily activities, seva, sadhana and
              attendance.
            </p>
          </div>
        </div>

        {/* Right Register Panel */}
        <div className="register-panel">
          <div className="register-card">
            {/* Header */}
            <div className="register-header">
              <Link to="/" className="register-back-link">
                <span aria-hidden="true">←</span>
                Back to Home
              </Link>

              <div className="register-brand-mark">ॐ</div>

              <p className="register-eyebrow">
                WELCOME
              </p>

              <h2>Create your account</h2>

              <p className="register-description">
                Create your personal account to stay connected
                with your daily activities, seva, sadhana and
                attendance.
              </p>
            </div>

            {/* Account Type */}
            <div className="register-account-type">
              <div className="register-account-icon">
                ॐ
              </div>

              <div>
                <strong>Devotee Account</strong>
                <span>Personal daily access</span>
              </div>

              <span className="register-account-check">
                ✓
              </span>
            </div>

            {/* Registration Form */}
            <form
              className="register-form"
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Name */}
              <div className="register-form-group">
                <label htmlFor="name">
                  Full name
                </label>

                <div className="register-input-wrapper">
                  <span
                    className="register-input-icon"
                    aria-hidden="true"
                  >
                    ♙
                  </span>

                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="register-form-group">
                <label htmlFor="register-email">
                  Email address
                </label>

                <div className="register-input-wrapper">
                  <span
                    className="register-input-icon"
                    aria-hidden="true"
                  >
                    @
                  </span>

                  <input
                    id="register-email"
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
              <div className="register-form-group">
                <label htmlFor="register-password">
                  Password
                </label>

                <div className="register-input-wrapper">
                  <span
                    className="register-input-icon password-symbol"
                    aria-hidden="true"
                  >
                    •••
                  </span>

                  <input
                    id="register-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                  />

                  <button
                    type="button"
                    className="register-password-toggle"
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

              {/* Confirm Password */}
              <div className="register-form-group">
                <label htmlFor="confirm-password">
                  Confirm password
                </label>

                <div className="register-input-wrapper">
                  <span
                    className="register-input-icon password-symbol"
                    aria-hidden="true"
                  >
                    •••
                  </span>

                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                  />

                  <button
                    type="button"
                    className="register-password-toggle"
                    onClick={() =>
                      setShowConfirmPassword(
                        (previous) => !previous
                      )
                    }
                    disabled={isSubmitting}
                    aria-label={
                      showConfirmPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="register-error"
                  role="alert"
                >
                  <span
                    className="register-error-icon"
                    aria-hidden="true"
                  >
                    !
                  </span>

                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className="register-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="register-spinner" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create devotee account

                    <span aria-hidden="true">
                      →
                    </span>
                  </>
                )}
              </button>
            </form>

            {/* Login Link */}
            <div className="register-login-prompt">
              <span>
                Already have an account?
              </span>

              <Link to="/login">
                Sign in
              </Link>
            </div>

            {/* Information */}
            <div className="register-note">
              <span
                className="register-note-icon"
                aria-hidden="true"
              >
                i
              </span>

              <p>
                Public registration creates a devotee
                account. Administrator accounts are handled
                separately.
              </p>
            </div>

            {/* Footer */}
            <div className="register-footer">
              <span>Giri Govardhan BACE</span>

              <span className="register-footer-dot">
                •
              </span>

              <span>Hare Krishna</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Register;