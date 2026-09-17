import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";
import "./Sadhana.css";

const EMPTY_FORM = {
  rounds: 0,
  reading: 0,
  meditation: 0,
  notes: "",
};

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function Sadhana() {
  const { user, isAdministrator, isDevotee } = useAuth();

  const [records, setRecords] = useState([]);
  const [devotees, setDevotees] = useState([]);

  const [selectedDate, setSelectedDate] = useState(getToday());
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /*
   * ------------------------------------------------------------------
   * LOAD DEVOTEE DIRECTORY
   * Administrator needs names for all sadhana records.
   * Devotee only needs their own profile.
   * ------------------------------------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function loadDevotees() {
      try {
        if (isAdministrator) {
          const devoteesQuery = query(
            collection(db, "users"),
            where("role", "==", "devotee")
          );

          const snapshot = await getDocs(devoteesQuery);

          if (!cancelled) {
            const list = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));

            setDevotees(list);
          }
        } else if (isDevotee && user?.uid) {
          setDevotees([
            {
              id: user.uid,
              uid: user.uid,
              name: user.name || "My Profile",
              email: user.email || "",
            },
          ]);
        }
      } catch (loadError) {
        console.error("Failed to load devotees:", loadError);

        if (!cancelled) {
          setError("Unable to load devotee information.");
        }
      }
    }

    loadDevotees();

    return () => {
      cancelled = true;
    };
  }, [isAdministrator, isDevotee, user?.uid, user?.name, user?.email]);

  /*
   * ------------------------------------------------------------------
   * LOAD SADHANA
   *
   * Administrator:
   *   Reads the complete sadhana collection.
   *
   * Devotee:
   *   Reads only their own records.
   * ------------------------------------------------------------------
   */
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    let unsubscribe;

    try {
      if (isAdministrator) {
        unsubscribe = onSnapshot(
          collection(db, "sadhana"),
          (snapshot) => {
            const list = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));

            setRecords(list);
            setLoading(false);
          },
          (snapshotError) => {
            console.error("Failed to load sadhana:", snapshotError);
            setError("Unable to load sadhana records.");
            setLoading(false);
          }
        );
      } else if (isDevotee) {
        const ownQuery = query(
          collection(db, "sadhana"),
          where("devoteeId", "==", user.uid)
        );

        unsubscribe = onSnapshot(
          ownQuery,
          (snapshot) => {
            const list = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));

            setRecords(list);
            setLoading(false);
          },
          (snapshotError) => {
            console.error("Failed to load personal sadhana:", snapshotError);
            setError("Unable to load your sadhana records.");
            setLoading(false);
          }
        );
      } else {
        setLoading(false);
      }
    } catch (snapshotError) {
      console.error("Failed to initialize sadhana listener:", snapshotError);
      setError("Unable to load sadhana records.");
      setLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user?.uid, isAdministrator, isDevotee]);

  /*
   * ------------------------------------------------------------------
   * FIND DEVOTEE
   * ------------------------------------------------------------------
   */
  const getDevotee = (devoteeId) => {
    return devotees.find(
      (devotee) =>
        devotee.id === devoteeId ||
        devotee.uid === devoteeId
    );
  };

  /*
   * ------------------------------------------------------------------
   * ADMINISTRATOR VIEW
   *
   * Admin sees selected date + optional search.
   * Devotee sees only their selected date.
   * ------------------------------------------------------------------
   */
  const visibleRecords = useMemo(() => {
    let result = records.filter(
      (record) => record.date === selectedDate
    );

    if (isDevotee) {
      result = result.filter(
        (record) => record.devoteeId === user?.uid
      );
    }

    if (isAdministrator && search.trim()) {
      const searchValue = search.trim().toLowerCase();

      result = result.filter((record) => {
        const devotee = getDevotee(record.devoteeId);

        const name = devotee?.name?.toLowerCase() || "";
        const email = devotee?.email?.toLowerCase() || "";
        const uid = record.devoteeId?.toLowerCase() || "";

        return (
          name.includes(searchValue) ||
          email.includes(searchValue) ||
          uid.includes(searchValue)
        );
      });
    }

    return [...result].sort((a, b) => {
      const devoteeA = getDevotee(a.devoteeId)?.name || "";
      const devoteeB = getDevotee(b.devoteeId)?.name || "";

      return devoteeA.localeCompare(devoteeB);
    });
  }, [
    records,
    selectedDate,
    search,
    isAdministrator,
    isDevotee,
    user?.uid,
    devotees,
  ]);

  /*
   * ------------------------------------------------------------------
   * PERSONAL RECORD FOR DEVOTEE
   * ------------------------------------------------------------------
   */
  const ownRecord = useMemo(() => {
    if (!isDevotee || !user?.uid) {
      return null;
    }

    return (
      records.find(
        (record) =>
          record.devoteeId === user.uid &&
          record.date === selectedDate
      ) || null
    );
  }, [records, selectedDate, isDevotee, user?.uid]);

  /*
   * ------------------------------------------------------------------
   * KEEP DEVOTEE FORM IN SYNC WITH SELECTED RECORD
   * ------------------------------------------------------------------
   */
  useEffect(() => {
    if (!isDevotee) {
      return;
    }

    if (ownRecord) {
      setForm({
        rounds: Number(ownRecord.rounds || 0),
        reading: Number(ownRecord.reading || 0),
        meditation: Number(ownRecord.meditation || 0),
        notes: ownRecord.notes || "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [ownRecord, selectedDate, isDevotee]);

  /*
   * ------------------------------------------------------------------
   * FORM INPUT
   * ------------------------------------------------------------------
   */
  const handleInput = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  /*
   * ------------------------------------------------------------------
   * SAVE PERSONAL SADHANA
   *
   * Deterministic document ID prevents duplicate records for the same
   * devotee and date.
   * ------------------------------------------------------------------
   */
  const savePersonalSadhana = async (event) => {
    event.preventDefault();

    if (!isDevotee || !user?.uid) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const rounds = Math.min(
        64,
        Math.max(0, Number(form.rounds) || 0)
      );

      const reading = Math.min(
        1440,
        Math.max(0, Number(form.reading) || 0)
      );

      const meditation = Math.min(
        1440,
        Math.max(0, Number(form.meditation) || 0)
      );

      const documentId = `${user.uid}_${selectedDate}`;

      const sadhanaRef = doc(db, "sadhana", documentId);

      await setDoc(
        sadhanaRef,
        {
          devoteeId: user.uid,
          date: selectedDate,
          rounds,
          reading,
          meditation,
          notes: form.notes.trim(),
          updatedAt: serverTimestamp(),
          ...(ownRecord
            ? {}
            : {
                createdAt: serverTimestamp(),
              }),
        },
        {
          merge: true,
        }
      );

      setForm({
        rounds,
        reading,
        meditation,
        notes: form.notes.trim(),
      });
    } catch (saveError) {
      console.error("Failed to save sadhana:", saveError);
      setError("Unable to save your sadhana record. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /*
   * ------------------------------------------------------------------
   * ADMIN SUMMARY
   * ------------------------------------------------------------------
   */
  const adminSummary = useMemo(() => {
    if (!isAdministrator) {
      return null;
    }

    const total = visibleRecords.length;

    const completed = visibleRecords.filter(
      (record) => Number(record.rounds || 0) > 0
    ).length;

    const totalRounds = visibleRecords.reduce(
      (sum, record) => sum + Number(record.rounds || 0),
      0
    );

    const averageRounds =
      total > 0
        ? Math.round((totalRounds / total) * 10) / 10
        : 0;

    return {
      total,
      completed,
      totalRounds,
      averageRounds,
    };
  }, [visibleRecords, isAdministrator]);

  if (loading) {
    return <Loader text="Loading sadhana..." />;
  }

  /*
   * ------------------------------------------------------------------
   * INVALID ROLE
   * ------------------------------------------------------------------
   */
  if (!isAdministrator && !isDevotee) {
    return (
      <div className="sadhana-page">
        <section className="sadhana-access">
          <div className="sadhana-access-icon">!</div>
          <h2>Access Unavailable</h2>
          <p>
            Your account role could not be verified.
            Please sign in again.
          </p>
        </section>
      </div>
    );
  }

  /*
   * ==================================================================
   * ADMINISTRATOR PAGE
   * ==================================================================
   */
  if (isAdministrator) {
    return (
      <div className="sadhana-page">
        <div className="page-header">
          <div>
            <span className="page-eyebrow">
              Community Monitoring
            </span>

            <h1>Sadhana</h1>

            <p>
              Monitor daily spiritual practice across the
              temple community.
            </p>
          </div>
        </div>

        {error && (
          <div className="sadhana-alert error">
            {error}
          </div>
        )}

        <section className="sadhana-admin-summary">
          <div className="sadhana-summary-card">
            <span>Records</span>
            <strong>{adminSummary.total}</strong>
            <small>For selected date</small>
          </div>

          <div className="sadhana-summary-card">
            <span>Practice Recorded</span>
            <strong>{adminSummary.completed}</strong>
            <small>Devotees with rounds</small>
          </div>

          <div className="sadhana-summary-card">
            <span>Total Rounds</span>
            <strong>{adminSummary.totalRounds}</strong>
            <small>Community total</small>
          </div>

          <div className="sadhana-summary-card">
            <span>Average Rounds</span>
            <strong>{adminSummary.averageRounds}</strong>
            <small>Per recorded devotee</small>
          </div>
        </section>

        <section className="sadhana-admin-toolbar">
          <label>
            <span>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value)
              }
            />
          </label>

          <label className="sadhana-search-field">
            <span>Search Devotee</span>
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search name, email or UID..."
            />
          </label>
        </section>

        <section className="sadhana-directory-card">
          <div className="sadhana-directory-header">
            <div>
              <span className="card-eyebrow">
                TEMPLE RECORDS
              </span>

              <h2>Community Sadhana</h2>

              <p>
                Read-only overview of devotee spiritual
                practice.
              </p>
            </div>

            <span className="sadhana-date-badge">
              {selectedDate}
            </span>
          </div>

          <div className="sadhana-table-wrapper">
            <table className="sadhana-admin-table">
              <thead>
                <tr>
                  <th>Devotee</th>
                  <th>Japa Rounds</th>
                  <th>Reading</th>
                  <th>Meditation</th>
                  <th>Notes</th>
                </tr>
              </thead>

              <tbody>
                {visibleRecords.map((record) => {
                  const devotee = getDevotee(record.devoteeId);

                  return (
                    <tr key={record.id}>
                      <td>
                        <div className="sadhana-table-person">
                          <div className="mini-avatar">
                            {(
                              devotee?.name ||
                              "D"
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {devotee?.name ||
                                "Unknown Devotee"}
                            </strong>

                            <span>
                              {devotee?.email ||
                                record.devoteeId}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <strong className="round-value">
                          {Number(record.rounds || 0)}
                        </strong>
                      </td>

                      <td>
                        {Number(record.reading || 0)} min
                      </td>

                      <td>
                        {Number(record.meditation || 0)} min
                      </td>

                      <td>
                        {record.notes ? (
                          <span className="table-note">
                            {record.notes}
                          </span>
                        ) : (
                          <span className="no-note">
                            No notes
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visibleRecords.length === 0 && (
            <div className="sadhana-empty">
              <div className="sadhana-empty-icon">ॐ</div>
              <h3>No sadhana records</h3>
              <p>
                No devotee has a sadhana record for the
                selected date or search.
              </p>
            </div>
          )}
        </section>

        <div className="sadhana-admin-note">
          <span className="info-icon">i</span>

          <div>
            <strong>Administrator view is read-only</strong>
            <p>
              Devotees maintain their own daily sadhana.
              Administrators can monitor the records without
              changing personal spiritual entries.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ==================================================================
   * DEVOTEE PAGE
   * ==================================================================
   */
  return (
    <div className="sadhana-page">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">
            Personal Practice
          </span>

          <h1>My Sadhana</h1>

          <p>
            Record and review your daily spiritual practice.
          </p>
        </div>
      </div>

      {error && (
        <div className="sadhana-alert error">
          {error}
        </div>
      )}

      <section className="my-sadhana-date-card">
        <div>
          <span className="card-eyebrow">
            DAILY PRACTICE
          </span>

          <h2>Your Sadhana</h2>

          <p>
            Select a date to record or review your practice.
          </p>
        </div>

        <label>
          <span>Practice Date</span>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
          />
        </label>
      </section>

      <form
        className="my-sadhana-form"
        onSubmit={savePersonalSadhana}
      >
        <div className="my-sadhana-form-header">
          <div>
            <span className="card-eyebrow">
              {ownRecord ? "UPDATE RECORD" : "NEW RECORD"}
            </span>

            <h2>
              {ownRecord
                ? "Update Today's Practice"
                : "Record Your Practice"}
            </h2>

            <p>
              {ownRecord
                ? `Your record for ${selectedDate} can be updated below.`
                : `No record exists for ${selectedDate}. Add your practice below.`}
            </p>
          </div>

          <span
            className={
              ownRecord
                ? "record-status saved"
                : "record-status new"
            }
          >
            <span></span>
            {ownRecord ? "Saved" : "Not recorded"}
          </span>
        </div>

        <div className="personal-sadhana-fields">
          <label className="practice-field">
            <span>Japa Rounds</span>

            <div className="practice-input">
              <input
                type="number"
                name="rounds"
                min="0"
                max="64"
                step="1"
                value={form.rounds}
                onChange={handleInput}
              />

              <small>rounds</small>
            </div>

            <em>Maximum 64 rounds</em>
          </label>

          <label className="practice-field">
            <span>Reading</span>

            <div className="practice-input">
              <input
                type="number"
                name="reading"
                min="0"
                max="1440"
                step="1"
                value={form.reading}
                onChange={handleInput}
              />

              <small>minutes</small>
            </div>

            <em>Time spent reading</em>
          </label>

          <label className="practice-field">
            <span>Meditation</span>

            <div className="practice-input">
              <input
                type="number"
                name="meditation"
                min="0"
                max="1440"
                step="1"
                value={form.meditation}
                onChange={handleInput}
              />

              <small>minutes</small>
            </div>

            <em>Time spent meditating</em>
          </label>
        </div>

        <label className="notes-field">
          <span>Notes</span>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleInput}
            placeholder="Add any reflection or note about today's practice..."
            rows="5"
            maxLength="1000"
          />

          <small>
            {form.notes.length}/1000 characters
          </small>
        </label>

        <div className="personal-form-footer">
          <div className="privacy-message">
            <span>🔒</span>

            <p>
              This is your personal sadhana record. You can
              update it whenever you need.
            </p>
          </div>

          <button
            type="submit"
            className="save-sadhana-button"
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : ownRecord
                ? "Save Changes"
                : "Save Sadhana"}
          </button>
        </div>
      </form>

      <section className="personal-history-card">
        <div className="personal-history-header">
          <div>
            <span className="card-eyebrow">
              PERSONAL HISTORY
            </span>

            <h2>My Recent Sadhana</h2>

            <p>
              Your recorded spiritual practice history.
            </p>
          </div>
        </div>

        <div className="personal-history-list">
          {[...records]
            .sort((a, b) =>
              String(b.date).localeCompare(String(a.date))
            )
            .slice(0, 7)
            .map((record) => (
              <button
                type="button"
                className={
                  record.date === selectedDate
                    ? "history-row selected"
                    : "history-row"
                }
                key={record.id}
                onClick={() => setSelectedDate(record.date)}
              >
                <span className="history-date">
                  {record.date}
                </span>

                <span className="history-stat">
                  <strong>{Number(record.rounds || 0)}</strong>
                  <small>Rounds</small>
                </span>

                <span className="history-stat">
                  <strong>
                    {Number(record.reading || 0)}
                  </strong>
                  <small>Reading min</small>
                </span>

                <span className="history-stat">
                  <strong>
                    {Number(record.meditation || 0)}
                  </strong>
                  <small>Meditation min</small>
                </span>

                <span className="history-arrow">
                  →
                </span>
              </button>
            ))}

          {records.length === 0 && (
            <div className="history-empty">
              <div>ॐ</div>
              <h3>No history yet</h3>
              <p>
                Your saved sadhana records will appear here.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Sadhana;