import { useEffect, useMemo, useState } from "react";

import {
  collection,
  deleteDoc,
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
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) {
    return "";
  }

  const [year, month, day] = dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${day}-${month}-${year}`;
}

function Sadhana() {
  const {
    user,
    isAdministrator,
    isDevotee,
    authLoading,
  } = useAuth();

  const [devotees, setDevotees] = useState([]);
  const [records, setRecords] = useState([]);

  const [selectedDate, setSelectedDate] = useState(
    getToday()
  );

  const [ownRecord, setOwnRecord] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const todayDate = getToday();

  const isToday = selectedDate === todayDate;

  const isPastDate =
    selectedDate < todayDate;

  const isFutureDate =
    selectedDate > todayDate;

  const canEditToday =
    isDevotee &&
    !!user?.uid &&
    isToday;

  /*
   * ======================================================
   * LOAD DEVOTEES
   * ======================================================
   */

  useEffect(() => {
    if (!isAdministrator) {
      setDevotees([]);
      return undefined;
    }

    const devoteesQuery = query(
      collection(db, "users"),
      where("role", "==", "devotee")
    );

    const unsubscribe = onSnapshot(
      devoteesQuery,
      (snapshot) => {
        const devoteeData = snapshot.docs.map(
          (item) => ({
            uid: item.id,
            ...item.data(),
          })
        );

        devoteeData.sort((a, b) =>
          String(a.name || "").localeCompare(
            String(b.name || ""),
            undefined,
            {
              sensitivity: "base",
            }
          )
        );

        setDevotees(devoteeData);
      },
      (firebaseError) => {
        console.error(
          "Failed to load devotees:",
          firebaseError
        );

        setDevotees([]);

        if (
          firebaseError.code ===
          "permission-denied"
        ) {
          setError(
            "Firebase permission denied while loading devotees."
          );
        } else {
          setError(
            "Unable to load devotees. Please try again."
          );
        }
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  /*
   * ======================================================
   * DEVOTEE MAP
   * ======================================================
   */

  const devoteeMap = useMemo(() => {
    const map = {};

    devotees.forEach((devotee) => {
      map[devotee.uid] = devotee;
    });

    return map;
  }, [devotees]);

  /*
   * ======================================================
   * CLEAN ORPHAN SADHANA RECORDS
   * ======================================================
   *
   * This removes old records belonging to accounts that
   * no longer exist.
   *
   * Example:
   *
   * users/{oldUid}      -> deleted
   * sadhana/{recordId}  -> still exists
   *
   * The orphan Sadhana record is deleted here.
   */

  useEffect(() => {
    if (!isAdministrator) {
      return undefined;
    }

    let cancelled = false;

    async function cleanupOrphanRecords() {
      try {
        const [
          usersSnapshot,
          sadhanaSnapshot,
        ] = await Promise.all([
          getDocs(
            query(
              collection(db, "users"),
              where(
                "role",
                "==",
                "devotee"
              )
            )
          ),
          getDocs(
            collection(db, "sadhana")
          ),
        ]);

        if (cancelled) {
          return;
        }

        const existingDevoteeIds =
          new Set(
            usersSnapshot.docs.map(
              (item) => item.id
            )
          );

        const orphanRecords =
          sadhanaSnapshot.docs.filter(
            (item) => {
              const data = item.data();

              if (!data.devoteeId) {
                return true;
              }

              return !existingDevoteeIds.has(
                data.devoteeId
              );
            }
          );

        if (
          orphanRecords.length === 0
        ) {
          return;
        }

        await Promise.all(
          orphanRecords.map((item) =>
            deleteDoc(item.ref)
          )
        );

        console.info(
          `Removed ${orphanRecords.length} orphan Sadhana record(s).`
        );
      } catch (cleanupError) {
        console.error(
          "Failed to clean orphan Sadhana records:",
          cleanupError
        );
      }
    }

    cleanupOrphanRecords();

    return () => {
      cancelled = true;
    };
  }, [isAdministrator]);

  /*
   * ======================================================
   * LOAD SADHANA RECORDS
   * ======================================================
   */

  useEffect(() => {
    if (!user?.uid) {
      setRecords([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    let unsubscribe;

    if (isAdministrator) {
      unsubscribe = onSnapshot(
        collection(db, "sadhana"),
        (snapshot) => {
          const recordData =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setRecords(recordData);
          setLoading(false);
        },
        (firebaseError) => {
          console.error(
            "Failed to load Sadhana records:",
            firebaseError
          );

          setRecords([]);
          setLoading(false);

          if (
            firebaseError.code ===
            "permission-denied"
          ) {
            setError(
              "Firebase permission denied while loading Sadhana records."
            );
          } else {
            setError(
              "Unable to load Sadhana records. Please try again."
            );
          }
        }
      );
    } else {
      const ownQuery = query(
        collection(db, "sadhana"),
        where(
          "devoteeId",
          "==",
          user.uid
        )
      );

      unsubscribe = onSnapshot(
        ownQuery,
        (snapshot) => {
          const recordData =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          setRecords(recordData);
          setLoading(false);
        },
        (firebaseError) => {
          console.error(
            "Failed to load your Sadhana records:",
            firebaseError
          );

          setRecords([]);
          setLoading(false);

          if (
            firebaseError.code ===
            "permission-denied"
          ) {
            setError(
              "Firebase permission denied while loading your Sadhana records."
            );
          } else {
            setError(
              "Unable to load your Sadhana records. Please try again."
            );
          }
        }
      );
    }

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [
    user?.uid,
    isAdministrator,
  ]);

  /*
   * ======================================================
   * ONLY VALID ADMIN RECORDS
   * ======================================================
   *
   * This is an additional safety layer.
   *
   * Even if an orphan record exists temporarily while
   * cleanup is running, it will never render as
   * "Unknown Devotee".
   */

  const validRecords = useMemo(() => {
    if (!isAdministrator) {
      return records.filter(
        (record) =>
          record.devoteeId === user?.uid
      );
    }

    return records.filter(
      (record) =>
        !!record.devoteeId &&
        !!devoteeMap[
          record.devoteeId
        ]
    );
  }, [
    records,
    devoteeMap,
    isAdministrator,
    user?.uid,
  ]);

  /*
   * ======================================================
   * RECORD FOR SELECTED DATE
   * ======================================================
   */

  const selectedDateRecords =
    useMemo(() => {
      return validRecords.filter(
        (record) =>
          record.date === selectedDate
      );
    }, [
      validRecords,
      selectedDate,
    ]);

  /*
   * ======================================================
   * SELECTED DATE RECORD FOR DEVOTEE
   * ======================================================
   */

  useEffect(() => {
    if (!isDevotee || !user?.uid) {
      setOwnRecord(null);
      return;
    }

    const record =
      validRecords.find(
        (item) =>
          item.devoteeId ===
            user.uid &&
          item.date ===
            selectedDate
      ) || null;

    setOwnRecord(record);
  }, [
    isDevotee,
    user?.uid,
    selectedDate,
    validRecords,
  ]);

  /*
   * ======================================================
   * SYNC FORM
   * ======================================================
   */

  useEffect(() => {
    if (!isDevotee) {
      return;
    }

    if (ownRecord) {
      setForm({
        rounds:
          Number(
            ownRecord.rounds
          ) || 0,

        reading:
          Number(
            ownRecord.reading
          ) || 0,

        meditation:
          Number(
            ownRecord.meditation
          ) || 0,

        notes:
          ownRecord.notes || "",
      });
    } else {
      setForm(
        EMPTY_FORM
      );
    }

    setError("");
    setSuccess("");
  }, [
    ownRecord,
    isDevotee,
    selectedDate,
  ]);

  /*
   * ======================================================
   * FORM CHANGE
   * ======================================================
   */

  const handleChange = (event) => {
    if (!canEditToday) {
      return;
    }

    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]:
        name === "notes"
          ? value
          : value === ""
            ? 0
            : Number(value),
    }));

    setError("");
    setSuccess("");
  };

  /*
   * ======================================================
   * SAVE TODAY'S SADHANA
   * ======================================================
   */

  const saveSadhana = async (
    event
  ) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!isDevotee) {
      return;
    }

    if (!user?.uid) {
      setError(
        "Your account could not be verified."
      );
      return;
    }

    if (!isToday) {
      setError(
        "Only today's Sadhana record can be edited."
      );
      return;
    }

    const rounds =
      Math.max(
        0,
        Number(form.rounds) || 0
      );

    const reading =
      Math.max(
        0,
        Number(form.reading) || 0
      );

    const meditation =
      Math.max(
        0,
        Number(form.meditation) || 0
      );

    try {
      setSaving(true);

      const recordId =
        `${user.uid}_${selectedDate}`;

      const recordRef = doc(
        db,
        "sadhana",
        recordId
      );

      await setDoc(
        recordRef,
        {
          devoteeId: user.uid,
          date: selectedDate,

          rounds,
          reading,
          meditation,

          notes:
            String(
              form.notes || ""
            ).trim(),

          updatedAt:
            serverTimestamp(),

          createdAt:
            ownRecord?.createdAt ||
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      setSuccess(
        "Today's Sadhana record has been saved."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to save Sadhana:",
        firebaseError
      );

      if (
        firebaseError.code ===
        "permission-denied"
      ) {
        setError(
          "Firebase permission denied. Please check the Sadhana Firestore rules."
        );
      } else {
        setError(
          "Unable to save today's Sadhana. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /*
   * ======================================================
   * STATS
   * ======================================================
   */

  const recordsForDate =
    selectedDateRecords;

  const totalRounds =
    recordsForDate.reduce(
      (total, record) =>
        total +
        (Number(
          record.rounds
        ) || 0),
      0
    );

  const practiceRecorded =
    recordsForDate.filter(
      (record) =>
        Number(
          record.rounds
        ) > 0
    ).length;

  const averageRounds =
    practiceRecorded > 0
      ? Math.round(
          (totalRounds /
            practiceRecorded) *
            10
        ) / 10
      : 0;

  /*
   * ======================================================
   * LOADING
   * ======================================================
   */

  if (
    authLoading ||
    loading
  ) {
    return (
      <Loader text="Loading Sadhana..." />
    );
  }

  /*
   * ======================================================
   * DEVOTEE VIEW
   * ======================================================
   */

  if (isDevotee) {
    const history = [...validRecords]
      .sort((a, b) =>
        String(
          b.date || ""
        ).localeCompare(
          String(
            a.date || ""
          )
        )
      );

    return (
      <div className="sadhana-page">
        <header className="sadhana-header">
          <div>
            <span className="sadhana-eyebrow">
              MY DAILY PRACTICE
            </span>

            <h1>Sadhana</h1>

            <p>
              Record your daily spiritual
              practice and review your
              previous records.
            </p>
          </div>
        </header>

        {error && (
          <div className="sadhana-error">
            {error}
          </div>
        )}

        {success && (
          <div className="sadhana-success">
            {success}
          </div>
        )}

        <section className="sadhana-card">
          <div className="sadhana-card-header">
            <div>
              <span className="sadhana-card-eyebrow">
                DAILY RECORD
              </span>

              <h2>
                {isToday
                  ? "Today's Sadhana"
                  : "Sadhana Record"}
              </h2>
            </div>

            <span className="sadhana-date-badge">
              {formatDate(
                selectedDate
              )}
            </span>
          </div>

          <div className="sadhana-date-selector">
            <label>
              <span>Date</span>

              <input
                type="date"
                value={selectedDate}
                max={todayDate}
                onChange={(event) =>
                  setSelectedDate(
                    event.target.value
                  )
                }
              />
            </label>
          </div>

          {isPastDate && (
            <div className="sadhana-readonly-notice">
              This is a past record. Past
              Sadhana records are
              read-only.
            </div>
          )}

          {isFutureDate && (
            <div className="sadhana-readonly-notice">
              Future Sadhana records
              cannot be created yet.
            </div>
          )}

          <form
            className="sadhana-form"
            onSubmit={saveSadhana}
          >
            <div className="sadhana-form-grid">
              <label>
                <span>Japa Rounds</span>

                <input
                  type="number"
                  name="rounds"
                  min="0"
                  value={
                    form.rounds
                  }
                  onChange={
                    handleChange
                  }
                  disabled={
                    !canEditToday
                  }
                />
              </label>

              <label>
                <span>
                  Reading (minutes)
                </span>

                <input
                  type="number"
                  name="reading"
                  min="0"
                  value={
                    form.reading
                  }
                  onChange={
                    handleChange
                  }
                  disabled={
                    !canEditToday
                  }
                />
              </label>

              <label>
                <span>
                  Meditation (minutes)
                </span>

                <input
                  type="number"
                  name="meditation"
                  min="0"
                  value={
                    form.meditation
                  }
                  onChange={
                    handleChange
                  }
                  disabled={
                    !canEditToday
                  }
                />
              </label>
            </div>

            <label className="sadhana-notes-field">
              <span>Notes</span>

              <textarea
                name="notes"
                rows="4"
                value={
                  form.notes
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
                placeholder="Add a note about today's practice..."
              />
            </label>

            {canEditToday && (
              <div className="sadhana-form-actions">
                <button
                  type="submit"
                  className="sadhana-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : ownRecord
                      ? "Update Today's Record"
                      : "Save Today's Record"}
                </button>
              </div>
            )}
          </form>
        </section>

        <section className="sadhana-card">
          <div className="sadhana-card-header">
            <div>
              <span className="sadhana-card-eyebrow">
                HISTORY
              </span>

              <h2>
                My Sadhana History
              </h2>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="sadhana-empty">
              <h3>
                No Sadhana records yet
              </h3>

              <p>
                Your completed daily
                records will appear here.
              </p>
            </div>
          ) : (
            <div className="sadhana-history-list">
              {history.map(
                (record) => (
                  <button
                    type="button"
                    className={
                      record.date ===
                      selectedDate
                        ? "sadhana-history-item selected"
                        : "sadhana-history-item"
                    }
                    key={
                      record.id
                    }
                    onClick={() =>
                      setSelectedDate(
                        record.date
                      )
                    }
                  >
                    <div>
                      <strong>
                        {formatDate(
                          record.date
                        )}
                      </strong>

                      <span>
                        {Number(
                          record.rounds
                        ) || 0}{" "}
                        rounds
                      </span>
                    </div>

                    <div>
                      <span>
                        Reading
                      </span>

                      <strong>
                        {Number(
                          record.reading
                        ) || 0}{" "}
                        min
                      </strong>
                    </div>

                    <div>
                      <span>
                        Meditation
                      </span>

                      <strong>
                        {Number(
                          record.meditation
                        ) || 0}{" "}
                        min
                      </strong>
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  /*
   * ======================================================
   * ADMIN VIEW
   * ======================================================
   */

  if (isAdministrator) {
    return (
      <div className="sadhana-page">
        <header className="sadhana-header">
          <div>
            <span className="sadhana-eyebrow">
              BACE COMMUNITY MONITORING
            </span>

            <h1>Sadhana</h1>

            <p>
              Monitor daily spiritual
              practice across the BACE
              community.
            </p>
          </div>
        </header>

        {error && (
          <div className="sadhana-error">
            {error}
          </div>
        )}

        <section className="sadhana-stats">
          <article className="sadhana-stat">
            <span>Records</span>

            <strong>
              {recordsForDate.length}
            </strong>

            <small>
              For selected date
            </small>
          </article>

          <article className="sadhana-stat">
            <span>
              Practice Recorded
            </span>

            <strong>
              {practiceRecorded}
            </strong>

            <small>
              Devotees with rounds
            </small>
          </article>

          <article className="sadhana-stat">
            <span>Total Rounds</span>

            <strong>
              {totalRounds}
            </strong>

            <small>
              Community total
            </small>
          </article>

          <article className="sadhana-stat">
            <span>
              Average Rounds
            </span>

            <strong>
              {averageRounds}
            </strong>

            <small>
              Per recorded devotee
            </small>
          </article>
        </section>

        <section className="sadhana-toolbar">
          <label>
            <span>Date</span>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(
                  event.target.value
                )
              }
            />
          </label>

          <label className="sadhana-search">
            <span>
              Search Devotee
            </span>

            <input
              type="search"
              placeholder="Search name or email..."
              onChange={(event) => {
                const value =
                  event.target.value
                    .trim()
                    .toLowerCase();

                setSearchTerm(
                  value
                );
              }}
            />
          </label>
        </section>

        <AdminSadhanaTable
          records={recordsForDate}
          devoteeMap={devoteeMap}
        />

        <section className="sadhana-info-card">
          <div className="sadhana-info-icon">
            i
          </div>

          <div>
            <strong>
              Administrator view is
              read-only
            </strong>

            <p>
              Devotees maintain their own
              daily Sadhana. Administrators
              can monitor the records
              without changing personal
              spiritual entries.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return null;
}

/*
 * ======================================================
 * ADMIN TABLE
 * ======================================================
 */

function AdminSadhanaTable({
  records,
  devoteeMap,
}) {
  const [searchTerm, setSearchTerm] =
    useState("");

  const filteredRecords =
    useMemo(() => {
      if (!searchTerm) {
        return records;
      }

      return records.filter(
        (record) => {
          const devotee =
            devoteeMap[
              record.devoteeId
            ];

          if (!devotee) {
            return false;
          }

          const searchable = [
            devotee.name,
            devotee.email,
            devotee.phone,
            devotee.department,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            searchTerm
          );
        }
      );
    }, [
      records,
      devoteeMap,
      searchTerm,
    ]);

  if (
    filteredRecords.length === 0
  ) {
    return (
      <section className="sadhana-card">
        <div className="sadhana-empty">
          <h3>
            No Sadhana records
          </h3>

          <p>
            No valid devotee Sadhana
            records exist for the
            selected date.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="sadhana-card">
      <div className="sadhana-card-header">
        <div>
          <span className="sadhana-card-eyebrow">
            BACE RECORDS
          </span>

          <h2>
            Community Sadhana
          </h2>

          <p>
            Read-only overview of devotee
            spiritual practice.
          </p>
        </div>
      </div>

      <div className="sadhana-table-wrapper">
        <table className="sadhana-table">
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
            {filteredRecords.map(
              (record) => {
                const devotee =
                  devoteeMap[
                    record.devoteeId
                  ];

                /*
                 * This should never be reached
                 * for an orphan record because
                 * validRecords already removes it.
                 */
                if (!devotee) {
                  return null;
                }

                const name =
                  devotee.name ||
                  devotee.email ||
                  "Devotee";

                const initials =
                  name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(
                      (part) =>
                        part.charAt(0)
                    )
                    .join("")
                    .toUpperCase() ||
                  "D";

                return (
                  <tr
                    key={
                      record.id
                    }
                  >
                    <td>
                      <div className="sadhana-devotee">
                        <div className="sadhana-avatar">
                          {initials}
                        </div>

                        <div>
                          <strong>
                            {name}
                          </strong>

                          <small>
                            {devotee.email ||
                              "No email available"}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="sadhana-rounds">
                        {Number(
                          record.rounds
                        ) || 0}
                      </span>
                    </td>

                    <td>
                      {Number(
                        record.reading
                      ) || 0}{" "}
                      min
                    </td>

                    <td>
                      {Number(
                        record.meditation
                      ) || 0}{" "}
                      min
                    </td>

                    <td>
                      {record.notes
                        ? record.notes
                        : "No notes"}
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Sadhana;