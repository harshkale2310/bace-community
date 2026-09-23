import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { auth, db } from "../../services/firebase";
import krishnaImage from "../../assets/krishna.png";
import iskconLogo from "../../assets/iskcon-logo.png";
import "./Register.css";

function Register() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  /*
   * Firebase automatically authenticates a newly created
   * account.
   *
   * This ref prevents the authentication redirect effect
   * from sending the newly registered user to Dashboard.
   */
  const registrationInProgress = useRef(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /*
   * ---------------------------------------------------------
   * AUTHENTICATED USER REDIRECT
   * ---------------------------------------------------------
   *
   * If an already authenticated user manually opens
   * /register, send them to Dashboard.
   *
   * Do NOT redirect while registration is in progress.
   */
  useEffect(() => {
    if (
      isAuthenticated &&
      !isSubmitting &&
      !registrationInProgress.current
    ) {
      navigate("/dashboard", {
        replace: true,
      });
    }
  }, [isAuthenticated, isSubmitting, navigate]);

  /*
   * ---------------------------------------------------------
   * INPUT CHANGE
   * ---------------------------------------------------------
   */
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

  /*
   * ---------------------------------------------------------
   * FORM VALIDATION
   * ---------------------------------------------------------
   */
  const validateForm = () => {
    const trimmedName = formData.name.trim();
    const trimmedEmail = formData.email.trim();

    /*
     * Name validation
     */
    if (!trimmedName) {
      return "Please enter your full name.";
    }

    if (trimmedName.length < 2) {
      return "Name must contain at least 2 characters.";
    }

    /*
     * Email validation
     */
    if (!trimmedEmail) {
      return "Please enter your email address.";
    }

    /*
     * Valid email pattern:
     *
     * example@gmail.com
     * user.name@example.co.in
     *
     * Maximum practical email length: 254 characters.
     */
    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (
      trimmedEmail.length > 254 ||
      !emailPattern.test(trimmedEmail)
    ) {
      return "Please enter a valid email address.";
    }

    /*
     * Password validation
     */
    if (!formData.password) {
      return "Please create a password.";
    }

    if (formData.password.length < 8) {
      return "Password must contain at least 8 characters.";
    }

    if (formData.password.length > 64) {
      return "Password must not exceed 64 characters.";
    }

    if (!/[A-Z]/.test(formData.password)) {
      return "Password must contain at least one uppercase letter.";
    }

    if (!/[a-z]/.test(formData.password)) {
      return "Password must contain at least one lowercase letter.";
    }

    if (!/[0-9]/.test(formData.password)) {
      return "Password must contain at least one number.";
    }

    if (!/[^A-Za-z0-9\s]/.test(formData.password)) {
      return "Password must contain at least one special character.";
    }

    /*
     * Confirm password validation
     */
    if (!formData.confirmPassword) {
      return "Please confirm your password.";
    }

    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  /*
   * ---------------------------------------------------------
   * FIREBASE ERROR MESSAGE
   * ---------------------------------------------------------
   */
  const getFirebaseErrorMessage = (firebaseError) => {
    switch (firebaseError.code) {
      case "auth/email-already-in-use":
        return "An account with this email already exists. Please sign in instead.";

      case "auth/invalid-email":
        return "Please enter a valid email address.";

      case "auth/weak-password":
        return "Your password is too weak. Use at least 8 characters with uppercase, lowercase, number, and special character.";

      case "auth/network-request-failed":
        return "Network error. Please check your internet connection.";

      case "auth/operation-not-allowed":
        return "Email and password registration is not enabled in Firebase.";

      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";

      case "permission-denied":
      case "firestore/permission-denied":
        return "Your authentication account was created, but your profile could not be saved. Please check your Firestore rules.";

      default:
        return "Unable to create your account. Please try again.";
    }
  };

  /*
   * ---------------------------------------------------------
   * REGISTRATION
   * ---------------------------------------------------------
   */
  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    /*
     * Mark registration as active BEFORE Firebase creates
     * the account.
     */
    registrationInProgress.current = true;
    setIsSubmitting(true);
    setError("");

    try {
      const email = formData.email.trim().toLowerCase();
      const name = formData.name.trim();

      /*
       * -----------------------------------------------------
       * 1. CREATE FIREBASE AUTH ACCOUNT
       * -----------------------------------------------------
       *
       * Firebase automatically signs the user in here.
       */
      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          formData.password
        );

      const firebaseUser = credential.user;

      /*
       * -----------------------------------------------------
       * 2. CREATE FIRESTORE PROFILE
       * -----------------------------------------------------
       *
       * Every public registration creates a devotee.
       */
      await setDoc(
        doc(db, "users", firebaseUser.uid),
        {
          uid: firebaseUser.uid,
          name,
          email,
          role: "devotee",
          status: "active",
          department: "Giri Govardhan BACE",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      /*
       * -----------------------------------------------------
       * 3. SIGN OUT NEWLY REGISTERED USER
       * -----------------------------------------------------
       *
       * Firebase automatically signs newly registered users in.
       * We explicitly sign them out so they must log in.
       */
      await signOut(auth);

      /*
       * -----------------------------------------------------
       * 4. SEND USER TO LOGIN
       * -----------------------------------------------------
       */
      navigate("/login", {
        replace: true,
        state: {
          registered: true,
          email,
        },
      });
    } catch (submitError) {
      console.error("Registration error:", submitError);

      /*
       * If the Firebase Auth account was created but a
       * later operation failed, make sure the browser is
       * signed out.
       */
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error(
            "Registration cleanup sign-out error:",
            signOutError
          );
        }
      }

      /*
       * Display useful error message.
       */
      setError(getFirebaseErrorMessage(submitError));
    } finally {
      /*
       * Registration is finished.
       */
      registrationInProgress.current = false;
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
          <span
            className="auth-nav-brand-icon auth-nav-brand-logo"
            aria-hidden="true"
          >
            <img src={iskconLogo} alt="" />
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
            className="auth-nav-link"
          >
            Login
          </Link>

          <Link
            to="/register"
            className="auth-nav-link active"
          >
            Register
          </Link>
        </div>
      </nav>

      {/* Register Shell */}
      <section className="register-shell">
        {/* Left Visual Panel */}
        <div className="register-visual">
          <div className="register-visual-image">
            <img
              src={krishnaImage}
              alt="Lord Krishna"
            />
            <div className="register-image-overlay" />
          </div>

          <div className="register-visual-content">
            <div
              className="register-om register-iskcon-logo"
              aria-hidden="true"
            >
              <img src={iskconLogo} alt="" />
            </div>

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
              Create your devotee account and stay
              connected with your daily activities,
              seva, sadhana and attendance.
            </p>
          </div>
        </div>

        {/* Right Register Panel */}
        <div className="register-panel">
          <div className="register-card">
            {/* Header */}
            <div className="register-header">
              <Link
                to="/"
                className="register-back-link"
              >
                <span aria-hidden="true">
                  ←
                </span>
                Back to Home
              </Link>

              <div
                className="register-brand-mark register-iskcon-mark"
                aria-hidden="true"
              >
                <img src={iskconLogo} alt="" />
              </div>

              <p className="register-eyebrow">
                WELCOME
              </p>

              <h2>
                Create your account
              </h2>

              <p className="register-description">
                Create your personal account to stay
                connected with your daily activities,
                seva, sadhana and attendance.
              </p>
            </div>

            {/* Account Type */}
            <div className="register-account-type">
              <div
                className="register-account-icon register-iskcon-account-icon"
                aria-hidden="true"
              >
                <img src={iskconLogo} alt="" />
              </div>

              <div>
                <strong>
                  Devotee Account
                </strong>

                <span>
                  Personal daily access
                </span>
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
                    maxLength={100}
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
                    inputMode="email"
                    maxLength={254}
                    spellCheck={false}
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
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={64}
                    spellCheck={false}
                    aria-describedby="register-password-requirements"
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
                    {showPassword
                      ? "Hide"
                      : "Show"}
                  </button>
                </div>

                <p
                  id="register-password-requirements"
                  className="register-field-hint"
                >
                  Use 8–64 characters with uppercase,
                  lowercase, a number and a special
                  character.
                </p>
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
                    minLength={8}
                    maxLength={64}
                    spellCheck={false}
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
                    {showConfirmPassword
                      ? "Hide"
                      : "Show"}
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

                  <span>
                    {error}
                  </span>
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
                account. Administrator accounts are
                handled separately.
              </p>
            </div>

            {/* Footer */}
            <div className="register-footer">
              <span>
                Giri Govardhan BACE
              </span>

              <span className="register-footer-dot">
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

export default Register;