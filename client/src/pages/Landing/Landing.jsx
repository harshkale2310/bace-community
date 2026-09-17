import { Link } from "react-router-dom";

import krishnaImage from "../../assets/krishna.png";

import "./Landing.css";

function Landing() {
  return (
    <main className="landing-page">

      {/* ============================================================
          TOP BRAND BAR
      ============================================================ */}
      <header className="landing-header">

        <div className="landing-brand">

          <div className="landing-brand-symbol">
            ॐ
          </div>

          <div className="landing-brand-text">
            <strong>Temple Base</strong>
            <span>Management System</span>
          </div>

        </div>

        <nav className="landing-nav">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
        </nav>

        <Link
          to="/login"
          className="landing-header-login"
        >
          <span>↪</span>
          Login
        </Link>

      </header>


      {/* ============================================================
          HERO
      ============================================================ */}
      <section
        className="landing-hero"
        id="home"
      >

        {/* ----------------------------------------------------------
            LEFT CONTENT
        ----------------------------------------------------------- */}
        <div className="landing-content-section">

          <div className="landing-content">

            <div className="landing-eyebrow">

              <span className="landing-eyebrow-line"></span>

              <span>
                HARE KRISHNA
              </span>

              <span className="landing-eyebrow-line"></span>

            </div>


            <div className="landing-symbol">
              ॐ
            </div>


            <h1>
              Temple Base
              <span>
                Management System
              </span>
            </h1>


            <p className="landing-description">
              A simple and organized platform for managing
              devotees, attendance, sadhana, seva, rooms,
              leave and daily temple activities.
            </p>


            {/* ------------------------------------------------------
                ACTIONS
            ------------------------------------------------------- */}
            <div className="landing-actions">

              <Link
                to="/login"
                className="landing-login-button"
              >
                <span>↪</span>
                Login to Continue
                <strong>→</strong>
              </Link>

            </div>


            {/* ------------------------------------------------------
                QUICK HIGHLIGHTS
            ------------------------------------------------------- */}
            <div className="landing-highlights">

              <div className="landing-highlight">

                <span className="landing-highlight-icon">
                  ◷
                </span>

                <div>
                  <strong>
                    4:30 AM
                  </strong>

                  <small>
                    Daily Attendance
                  </small>
                </div>

              </div>


              <div className="landing-highlight-divider"></div>


              <div className="landing-highlight">

                <span className="landing-highlight-icon">
                  ♡
                </span>

                <div>
                  <strong>
                    Seva
                  </strong>

                  <small>
                    Service Management
                  </small>
                </div>

              </div>


              <div className="landing-highlight-divider"></div>


              <div className="landing-highlight">

                <span className="landing-highlight-icon">
                  ॐ
                </span>

                <div>
                  <strong>
                    Sadhana
                  </strong>

                  <small>
                    Spiritual Practice
                  </small>
                </div>

              </div>

            </div>

          </div>

        </div>


        {/* ----------------------------------------------------------
            IMAGE
        ----------------------------------------------------------- */}
        <div className="landing-image-section">

          <div className="landing-image-glow"></div>

          <div className="landing-image-frame">

            <img
              src={krishnaImage}
              alt="Lord Krishna"
              className="landing-krishna-image"
            />

          </div>


          {/* Decorative OM */}
          <div className="landing-floating-symbol landing-symbol-one">
            ॐ
          </div>

          <div className="landing-floating-symbol landing-symbol-two">
            ✦
          </div>

        </div>

      </section>


      {/* ============================================================
          FEATURES
      ============================================================ */}
      <section
        className="landing-features"
        id="features"
      >

        <div className="landing-section-heading">

          <span>
            TEMPLE MANAGEMENT
          </span>

          <h2>
            Everything in one place
          </h2>

          <p>
            Organize daily temple activities with clarity,
            simplicity and devotion.
          </p>

        </div>


        <div className="landing-feature-grid">

          {/* DEVOTEES */}
          <div className="landing-feature-card">

            <div className="landing-feature-icon devotees">
              ♙
            </div>

            <h3>
              Devotees
            </h3>

            <p>
              Manage devotee information,
              profiles and temple records.
            </p>

          </div>


          {/* ATTENDANCE */}
          <div className="landing-feature-card">

            <div className="landing-feature-icon attendance">
              ✓
            </div>

            <h3>
              Attendance
            </h3>

            <p>
              Record and monitor daily
              temple attendance.
            </p>

          </div>


          {/* SADHANA */}
          <div className="landing-feature-card">

            <div className="landing-feature-icon sadhana">
              ॐ
            </div>

            <h3>
              Sadhana
            </h3>

            <p>
              Track spiritual practices
              and daily sadhana.
            </p>

          </div>


          {/* SEVA */}
          <div className="landing-feature-card">

            <div className="landing-feature-icon seva">
              ♡
            </div>

            <h3>
              Seva
            </h3>

            <p>
              Organize service activities
              and seva assignments.
            </p>

          </div>


          {/* ROOMS */}
          <div className="landing-feature-card">

            <div className="landing-feature-icon rooms">
              ⌂
            </div>

            <h3>
              Rooms
            </h3>

            <p>
              Manage room allocation
              and devotee occupancy.
            </p>

          </div>


          {/* REPORTS */}
          <div className="landing-feature-card">

            <div className="landing-feature-icon reports">
              ▤
            </div>

            <h3>
              Reports
            </h3>

            <p>
              View useful reports and
              temple activity records.
            </p>

          </div>

        </div>

      </section>


      {/* ============================================================
          SPIRITUAL MESSAGE
      ============================================================ */}
      <section
        className="landing-message"
        id="about"
      >

        <div className="landing-message-decoration">
          ✦
        </div>

        <div className="landing-message-symbol">
          ॐ
        </div>

        <blockquote>
          “Service to Krishna is the
          highest welfare.”
        </blockquote>

        <p>
          — Srila Prabhupada
        </p>

      </section>


      {/* ============================================================
          FINAL CTA
      ============================================================ */}
      <section className="landing-cta">

        <div>

          <span className="landing-cta-small">
            SIMPLE • ORGANIZED • DEVOTIONAL
          </span>

          <h2>
            Begin your temple management journey.
          </h2>

        </div>

        <Link
          to="/login"
          className="landing-cta-button"
        >
          Login
          <span>→</span>
        </Link>

      </section>


      {/* ============================================================
          FOOTER
      ============================================================ */}
      <footer className="landing-footer">

        <div className="landing-footer-brand">

          <div className="landing-footer-symbol">
            ॐ
          </div>

          <div>
            <strong>
              Temple Base
            </strong>

            <span>
              Management System
            </span>
          </div>

        </div>


        <div className="landing-footer-center">
          — Hare Krishna —
        </div>


        <div className="landing-footer-right">
          Simple&nbsp; • &nbsp;Organized&nbsp; • &nbsp;Devotional
        </div>

      </footer>

    </main>
  );
}

export default Landing;