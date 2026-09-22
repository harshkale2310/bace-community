import { useEffect, useMemo, useState } from "react";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import * as XLSX from "xlsx";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Common/Loader";

import "./Sadhana.css";

const EMPTY_FORM = {
  toBed: "",
  wakeUp: "",
  dayRest: 0,
  morningProgramReport: "",
  rounds: 0,
  mangalArti: "",
  morningClass: "",
  adhyyanBookTopic: "",
  adhyyanTime: "",
  shravanSpeakerTopic: "",
  shravanTime: "",
  sevaDescription: "",
  sevaTime: "",
  yogaExercise: 0,
  collegeWork: 0,
  studyXWork: 0,
  reason: "",
  reading: 0,
  meditation: 0,
  notes: "",
};

const NUMBER_FIELDS = [
  "dayRest",
  "rounds",
  "yogaExercise",
  "collegeWork",
  "studyXWork",
  "reading",
  "meditation",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${day}-${month}-${year}`;
}

function formatMonthYear(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getMonthKey(dateString) {
  return String(dateString || "").slice(0, 7);
}

function getCurrentMonthKey() {
  return getToday().slice(0, 7);
}

function isCompletedMonth(monthKey) {
  return Boolean(monthKey) && monthKey < getCurrentMonthKey();
}

function getDaysInMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return [];

  const [year, month] = monthKey.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();

  return Array.from({ length: days }, (_, index) => {
    return `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
  });
}

function getReportDays(monthKey, trackingStartDate = "") {
  const allDays = getDaysInMonth(monthKey);
  const currentMonth = getCurrentMonthKey();

  if (!monthKey || !allDays.length) return [];

  if (monthKey < currentMonth) {
    return allDays;
  }

  if (monthKey === currentMonth) {
    const today = getToday();
    const startDate = trackingStartDate || today;
    return allDays.filter((date) => date >= startDate && date <= today);
  }

  return [];
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusLabel(value) {
  if (normalizeStatus(value) === "present") return "Present";
  if (normalizeStatus(value) === "absent") return "Absent";
  return "Not marked";
}

function statusShort(value) {
  if (normalizeStatus(value) === "present") return "P";
  if (normalizeStatus(value) === "absent") return "A";
  return "—";
}

function toNumber(value) {
  return Math.max(0, Number(value) || 0);
}

function safeText(value) {
  return String(value ?? "").trim();
}

function getDisplayName(devotee) {
  return devotee?.name || devotee?.email || "Devotee";
}

function getInitials(name) {
  return (
    String(name || "Devotee")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "D"
  );
}

function createDownloadName(prefix, monthKey = "") {
  const cleanMonth = monthKey ? `-${monthKey}` : "";
  return `${prefix}${cleanMonth}.xlsx`;
}

function downloadWorkbook(workbook, fileName) {
  XLSX.writeFile(workbook, fileName);
}

function buildDailyReportRows({
  monthDates,
  reportDevotees,
  recordMap,
}) {
  const rows = [];

  monthDates.forEach((date) => {
    reportDevotees.forEach((devotee) => {
      const record = recordMap.get(`${devotee.uid}_${date}`);

      rows.push({
        Date: date,
        "Display Date": formatDate(date),
        Devotee: getDisplayName(devotee),
        Email: devotee.email || "",
        Department: devotee.department || "",
        "Sadhana Status": record ? "Submitted" : "Not Submitted",
        "Japa Rounds": record ? toNumber(record.rounds) : 0,
        "Mangal Arti": record ? statusLabel(record.mangalArti) : "Not marked",
        "Morning Class": record ? statusLabel(record.morningClass) : "Not marked",
        "To Bed": record?.toBed || "",
        "Wake Up": record?.wakeUp || "",
        "Day Rest (hrs)": record ? toNumber(record.dayRest) : 0,
        "M.P. Report": record?.morningProgramReport || "",
        "Adhyayan Topic": record?.adhyyanBookTopic || "",
        "Adhyayan Time": record?.adhyyanTime || "",
        "Shravan Topic": record?.shravanSpeakerTopic || "",
        "Shravan Time": record?.shravanTime || "",
        Seva: record?.sevaDescription || "",
        "Seva Time": record?.sevaTime || "",
        "Yoga / Exercise (min)": record ? toNumber(record.yogaExercise) : 0,
        "College / Work (hrs)": record ? toNumber(record.collegeWork) : 0,
        "Study / X-Work (hrs)": record ? toNumber(record.studyXWork) : 0,
        Reading: record ? toNumber(record.reading) : 0,
        Meditation: record ? toNumber(record.meditation) : 0,
        Reason: record?.reason || "",
        Notes: record?.notes || "",
      });
    });
  });

  return rows;
}

function buildMonthlySummaryRows({
  monthDates,
  reportDevotees,
  recordMap,
}) {
  return reportDevotees.map((devotee) => {
    const devoteeRecords = monthDates
      .map((date) => recordMap.get(`${devotee.uid}_${date}`))
      .filter(Boolean);

    const rounds = devoteeRecords.reduce(
      (total, record) => total + toNumber(record.rounds),
      0
    );

    const reading = devoteeRecords.reduce(
      (total, record) => total + toNumber(record.reading),
      0
    );

    const meditation = devoteeRecords.reduce(
      (total, record) => total + toNumber(record.meditation),
      0
    );

    const morningProgram = devoteeRecords.filter(
      (record) => safeText(record.morningProgramReport)
    ).length;

    const mangalArtiPresent = devoteeRecords.filter(
      (record) => normalizeStatus(record.mangalArti) === "present"
    ).length;

    const mangalArtiAbsent = devoteeRecords.filter(
      (record) => normalizeStatus(record.mangalArti) === "absent"
    ).length;

    const morningClassPresent = devoteeRecords.filter(
      (record) => normalizeStatus(record.morningClass) === "present"
    ).length;

    const morningClassAbsent = devoteeRecords.filter(
      (record) => normalizeStatus(record.morningClass) === "absent"
    ).length;

    const totalExercise = devoteeRecords.reduce(
      (total, record) => total + toNumber(record.yogaExercise),
      0
    );

    const totalCollegeWork = devoteeRecords.reduce(
      (total, record) => total + toNumber(record.collegeWork),
      0
    );

    const totalStudyWork = devoteeRecords.reduce(
      (total, record) => total + toNumber(record.studyXWork),
      0
    );

    return {
      Devotee: getDisplayName(devotee),
      Email: devotee.email || "",
      Department: devotee.department || "",
      "Days Covered": monthDates.length,
      "Sadhana Submitted": devoteeRecords.length,
      "Sadhana Not Submitted": Math.max(
        0,
        monthDates.length - devoteeRecords.length
      ),
      "Japa Total": rounds,
      "Japa Average / Submitted Day":
        devoteeRecords.length > 0
          ? Math.round((rounds / devoteeRecords.length) * 10) / 10
          : 0,
      "Mangal Arti Present": mangalArtiPresent,
      "Mangal Arti Absent": mangalArtiAbsent,
      "Morning Class Present": morningClassPresent,
      "Morning Class Absent": morningClassAbsent,
      "Morning Program Recorded": morningProgram,
      "Adhyayan Entries": devoteeRecords.filter(
        (record) => safeText(record.adhyyanBookTopic)
      ).length,
      "Shravan Entries": devoteeRecords.filter(
        (record) => safeText(record.shravanSpeakerTopic)
      ).length,
      "Seva Entries": devoteeRecords.filter(
        (record) => safeText(record.sevaDescription)
      ).length,
      "Yoga / Exercise Total (min)": totalExercise,
      "College / Work Total (hrs)": totalCollegeWork,
      "Study / X-Work Total (hrs)": totalStudyWork,
      "Reading Total (min)": reading,
      "Meditation Total (min)": meditation,
    };
  });
}

function createSummaryRows(summaryRows) {
  const totals = summaryRows.reduce(
    (total, row) => {
      total.devotees += 1;
      total.submitted += row["Sadhana Submitted"];
      total.notSubmitted += row["Sadhana Not Submitted"];
      total.rounds += row["Japa Total"];
      total.mangalPresent += row["Mangal Arti Present"];
      total.mangalAbsent += row["Mangal Arti Absent"];
      total.classPresent += row["Morning Class Present"];
      total.classAbsent += row["Morning Class Absent"];
      return total;
    },
    {
      devotees: 0,
      submitted: 0,
      notSubmitted: 0,
      rounds: 0,
      mangalPresent: 0,
      mangalAbsent: 0,
      classPresent: 0,
      classAbsent: 0,
    }
  );

  return [
    { Metric: "Devotees in report", Value: totals.devotees },
    { Metric: "Sadhana submissions", Value: totals.submitted },
    { Metric: "Days not submitted", Value: totals.notSubmitted },
    { Metric: "Total Japa rounds", Value: totals.rounds },
    { Metric: "Mangal Arti marked Present", Value: totals.mangalPresent },
    { Metric: "Mangal Arti marked Absent", Value: totals.mangalAbsent },
    { Metric: "Morning Class marked Present", Value: totals.classPresent },
    { Metric: "Morning Class marked Absent", Value: totals.classAbsent },
  ];
}

function exportDailyExcel({
  selectedDate,
  reportDevotees,
  records,
}) {
  const recordMap = new Map(
    records
      .filter((record) => record.date === selectedDate)
      .map((record) => [`${record.devoteeId}_${record.date}`, record])
  );

  const rows = buildDailyReportRows({
    monthDates: [selectedDate],
    reportDevotees,
    recordMap,
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);

  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 18 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 35 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Report");
  downloadWorkbook(
    workbook,
    createDownloadName("BACE-Sadhana-Daily", selectedDate)
  );
}

function exportMonthlyExcel({
  monthKey,
  reportDevotees,
  records,
  trackingStartDate,
}) {
  const monthDates = getReportDays(monthKey, trackingStartDate);
  const calendarDays = getDaysInMonth(monthKey);
  const monthRecords = records.filter((record) =>
    String(record.date || "").startsWith(`${monthKey}-`)
  );

  const recordMap = new Map(
    monthRecords.map((record) => [`${record.devoteeId}_${record.date}`, record])
  );

  const summaryRows = buildMonthlySummaryRows({
    monthDates,
    reportDevotees,
    recordMap,
  });

  const dailyRows = buildDailyReportRows({
    monthDates,
    reportDevotees,
    recordMap,
  });

  const workbook = XLSX.utils.book_new();

  const overviewRows = [
    { Field: "Report", Value: "BACE Monthly Sadhana Report" },
    { Field: "Month", Value: formatMonthYear(`${monthKey}-01`) },
    {
      Field: "Report Status",
      Value: isCompletedMonth(monthKey) ? "Month Completed" : "Month In Progress",
    },
    { Field: "Generated On", Value: formatDate(getToday()) },
    { Field: "Devotees Included", Value: reportDevotees.length },
    { Field: "Calendar Days in Month", Value: calendarDays.length },
    { Field: "Tracking Start Date", Value: trackingStartDate ? formatDate(trackingStartDate) : "Not set" },
    { Field: "Days Covered by Report", Value: monthDates.length },
    {
      Field: "Future Dates Excluded",
      Value: calendarDays.length > monthDates.length ? calendarDays.length - monthDates.length : 0,
    },
  ];

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  const dailySheet = XLSX.utils.json_to_sheet(dailyRows);
  const totalsSheet = XLSX.utils.json_to_sheet(createSummaryRows(summaryRows));

  overviewSheet["!cols"] = [{ wch: 24 }, { wch: 34 }];
  summarySheet["!cols"] = [
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
  ];

  dailySheet["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 18 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 15 },
    { wch: 24 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 35 },
  ];

  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Monthly Summary");
  XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Details");
  XLSX.utils.book_append_sheet(workbook, totalsSheet, "Totals");

  downloadWorkbook(
    workbook,
    createDownloadName("BACE-Sadhana-Monthly", monthKey)
  );
}

function Sadhana() {
  const { user, isAdministrator, isDevotee, authLoading } = useAuth();

  const [devotees, setDevotees] = useState([]);
  const [records, setRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [reportMonth, setReportMonth] = useState(getMonthKey(getToday()));
  const [ownRecord, setOwnRecord] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [trackingStartDate, setTrackingStartDate] = useState(getToday());

  const todayDate = getToday();

  useEffect(() => {
    if (!isAdministrator || !user?.uid) return undefined;

    let cancelled = false;

    async function loadTrackingStartDate() {
      try {
        const settingsRef = doc(db, "settings", "sadhana");
        const settingsSnapshot = await getDoc(settingsRef);

        if (cancelled) return;

        if (settingsSnapshot.exists() && settingsSnapshot.data().trackingStartDate) {
          setTrackingStartDate(String(settingsSnapshot.data().trackingStartDate));
          return;
        }

        const launchDate = getToday();
        await setDoc(
          settingsRef,
          {
            trackingStartDate: launchDate,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        );

        if (!cancelled) setTrackingStartDate(launchDate);
      } catch (settingsError) {
        console.error("Failed to load Sadhana tracking start date:", settingsError);
        if (!cancelled) setTrackingStartDate(getToday());
      }
    }

    loadTrackingStartDate();

    return () => {
      cancelled = true;
    };
  }, [isAdministrator, user?.uid]);
  const isToday = selectedDate === todayDate;
  const isPastDate = selectedDate < todayDate;
  const isFutureDate = selectedDate > todayDate;
  const canEditToday = isDevotee && !!user?.uid && isToday;

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
        const devoteeData = snapshot.docs.map((item) => ({
          uid: item.id,
          ...item.data(),
        }));

        devoteeData.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          })
        );

        setDevotees(devoteeData);
      },
      (firebaseError) => {
        console.error("Failed to load devotees:", firebaseError);
        setDevotees([]);
        setError(
          firebaseError.code === "permission-denied"
            ? "Firebase permission denied while loading devotees."
            : "Unable to load devotees. Please try again."
        );
      }
    );

    return () => unsubscribe();
  }, [isAdministrator]);

  const activeDevotees = useMemo(
    () =>
      devotees.filter(
        (devotee) =>
          normalizeStatus(devotee.status || "active") === "active"
      ),
    [devotees]
  );

  const reportDevotees = useMemo(() => {
    // For the current month, only active devotees are expected to submit.
    // For completed months, keep non-deleted devotees so historical records
    // remain available in the report.
    if (reportMonth === getCurrentMonthKey()) {
      return activeDevotees;
    }

    return devotees.filter(
      (devotee) => normalizeStatus(devotee.status) !== "deleted"
    );
  }, [devotees, activeDevotees, reportMonth]);

  const devoteeMap = useMemo(() => {
    const map = {};
    activeDevotees.forEach((devotee) => {
      map[devotee.uid] = devotee;
    });
    return map;
  }, [activeDevotees]);

  useEffect(() => {
    if (!isAdministrator) return undefined;

    let cancelled = false;

    async function cleanupOrphanRecords() {
      try {
        const [usersSnapshot, sadhanaSnapshot] = await Promise.all([
          getDocs(query(collection(db, "users"), where("role", "==", "devotee"))),
          getDocs(collection(db, "sadhana")),
        ]);

        if (cancelled) return;

        const existingDevoteeIds = new Set(
          usersSnapshot.docs.map((item) => item.id)
        );

        const orphanRecords = sadhanaSnapshot.docs.filter((item) => {
          const data = item.data();
          return !data.devoteeId || !existingDevoteeIds.has(data.devoteeId);
        });

        if (orphanRecords.length === 0) return;

        await Promise.all(orphanRecords.map((item) => deleteDoc(item.ref)));
      } catch (cleanupError) {
        console.error("Failed to clean orphan Sadhana records:", cleanupError);
      }
    }

    cleanupOrphanRecords();

    return () => {
      cancelled = true;
    };
  }, [isAdministrator]);

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
          setRecords(
            snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }))
          );
          setLoading(false);
        },
        (firebaseError) => {
          console.error("Failed to load Sadhana records:", firebaseError);
          setRecords([]);
          setLoading(false);
          setError(
            firebaseError.code === "permission-denied"
              ? "Firebase permission denied while loading Sadhana records."
              : "Unable to load Sadhana records. Please try again."
          );
        }
      );
    } else {
      const ownQuery = query(
        collection(db, "sadhana"),
        where("devoteeId", "==", user.uid)
      );

      unsubscribe = onSnapshot(
        ownQuery,
        (snapshot) => {
          setRecords(
            snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }))
          );
          setLoading(false);
        },
        (firebaseError) => {
          console.error("Failed to load your Sadhana records:", firebaseError);
          setRecords([]);
          setLoading(false);
          setError(
            firebaseError.code === "permission-denied"
              ? "Firebase permission denied while loading your Sadhana records."
              : "Unable to load your Sadhana records. Please try again."
          );
        }
      );
    }

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [user?.uid, isAdministrator]);

  const validRecords = useMemo(() => {
    if (!isAdministrator) {
      return records.filter((record) => record.devoteeId === user?.uid);
    }

    return records.filter(
      (record) => !!record.devoteeId && !!devoteeMap[record.devoteeId]
    );
  }, [records, devoteeMap, isAdministrator, user?.uid]);

  useEffect(() => {
    if (!isDevotee || !user?.uid) {
      setOwnRecord(null);
      return;
    }

    setOwnRecord(
      validRecords.find(
        (item) => item.devoteeId === user.uid && item.date === selectedDate
      ) || null
    );
  }, [isDevotee, user?.uid, selectedDate, validRecords]);

  useEffect(() => {
    if (!isDevotee) return;

    if (ownRecord) {
      setForm({
        toBed: ownRecord.toBed || "",
        wakeUp: ownRecord.wakeUp || "",
        dayRest: toNumber(ownRecord.dayRest),
        morningProgramReport: ownRecord.morningProgramReport || "",
        rounds: toNumber(ownRecord.rounds),
        mangalArti: ownRecord.mangalArti || "",
        morningClass: ownRecord.morningClass || "",
        adhyyanBookTopic: ownRecord.adhyyanBookTopic || "",
        adhyyanTime: ownRecord.adhyyanTime || "",
        shravanSpeakerTopic: ownRecord.shravanSpeakerTopic || "",
        shravanTime: ownRecord.shravanTime || "",
        sevaDescription: ownRecord.sevaDescription || "",
        sevaTime: ownRecord.sevaTime || "",
        yogaExercise: toNumber(ownRecord.yogaExercise),
        collegeWork: toNumber(ownRecord.collegeWork),
        studyXWork: toNumber(ownRecord.studyXWork),
        reason: ownRecord.reason || "",
        reading: toNumber(ownRecord.reading),
        meditation: toNumber(ownRecord.meditation),
        notes: ownRecord.notes || "",
      });
    } else {
      setForm({ ...EMPTY_FORM });
    }

    setError("");
    setSuccess("");
  }, [ownRecord, isDevotee, selectedDate]);

  const handleChange = (event) => {
    if (!canEditToday) return;

    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: NUMBER_FIELDS.includes(name)
        ? value === ""
          ? ""
          : Number(value)
        : value,
    }));

    setError("");
    setSuccess("");
  };

  const saveSadhana = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!isDevotee) return;

    if (!user?.uid) {
      setError("Your account could not be verified.");
      return;
    }

    if (!isToday) {
      setError("Only today's Sadhana record can be edited.");
      return;
    }

    try {
      setSaving(true);

      const recordId = `${user.uid}_${selectedDate}`;
      const recordRef = doc(db, "sadhana", recordId);

      await setDoc(
        recordRef,
        {
          devoteeId: user.uid,
          date: selectedDate,
          toBed: safeText(form.toBed),
          wakeUp: safeText(form.wakeUp),
          dayRest: toNumber(form.dayRest),
          morningProgramReport: safeText(form.morningProgramReport),
          rounds: toNumber(form.rounds),
          mangalArti: safeText(form.mangalArti),
          morningClass: safeText(form.morningClass),
          adhyyanBookTopic: safeText(form.adhyyanBookTopic),
          adhyyanTime: safeText(form.adhyyanTime),
          shravanSpeakerTopic: safeText(form.shravanSpeakerTopic),
          shravanTime: safeText(form.shravanTime),
          sevaDescription: safeText(form.sevaDescription),
          sevaTime: safeText(form.sevaTime),
          yogaExercise: toNumber(form.yogaExercise),
          collegeWork: toNumber(form.collegeWork),
          studyXWork: toNumber(form.studyXWork),
          reason: safeText(form.reason),
          reading: toNumber(form.reading),
          meditation: toNumber(form.meditation),
          notes: safeText(form.notes),
          updatedAt: serverTimestamp(),
          createdAt: ownRecord?.createdAt || serverTimestamp(),
        },
        { merge: true }
      );

      setSuccess("Today's Sadhana record has been saved.");
    } catch (firebaseError) {
      console.error("Failed to save Sadhana:", firebaseError);
      setError(
        firebaseError.code === "permission-denied"
          ? "Firebase permission denied. Please check the Sadhana Firestore rules."
          : "Unable to save today's Sadhana. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const recordsForDate = useMemo(
    () => validRecords.filter((record) => record.date === selectedDate),
    [validRecords, selectedDate]
  );

  const totalRounds = recordsForDate.reduce(
    (total, record) => total + toNumber(record.rounds),
    0
  );

  const practiceRecorded = recordsForDate.filter(
    (record) => toNumber(record.rounds) > 0
  ).length;

  const averageRounds =
    practiceRecorded > 0
      ? Math.round((totalRounds / practiceRecorded) * 10) / 10
      : 0;

  const completedMonth = isCompletedMonth(reportMonth);
  const selectedReportRecords = useMemo(
    () =>
      records.filter((record) =>
        String(record.date || "").startsWith(`${reportMonth}-`)
      ),
    [records, reportMonth]
  );

  const reportRecordMap = useMemo(
    () =>
      new Map(
        selectedReportRecords.map((record) => [
          `${record.devoteeId}_${record.date}`,
          record,
        ])
      ),
    [selectedReportRecords]
  );

  const reportDays = useMemo(
    () => getReportDays(reportMonth, trackingStartDate),
    [reportMonth, trackingStartDate]
  );
  const reportIsFutureMonth = reportMonth > getCurrentMonthKey();

  const reportSubmitted = useMemo(
    () =>
      reportDays.reduce(
        (total, date) =>
          total +
          reportDevotees.filter((devotee) =>
            reportRecordMap.has(`${devotee.uid}_${date}`)
          ).length,
        0
      ),
    [reportDays, reportDevotees, reportRecordMap]
  );

  const reportPossible = reportDays.length * reportDevotees.length;
  const reportNotSubmitted = Math.max(0, reportPossible - reportSubmitted);
  const reportCompletion =
    reportPossible > 0
      ? Math.round((reportSubmitted / reportPossible) * 100)
      : 0;

  const handleDailyExport = () => {
    if (isFutureDate) {
      setError("Daily reports are available only through today.");
      return;
    }

    try {
      setExporting(true);
      exportDailyExcel({
        selectedDate,
        reportDevotees,
        records,
      });
      setSuccess(`Daily Excel report downloaded for ${formatDate(selectedDate)}.`);
    } catch (exportError) {
      console.error("Failed to export daily Sadhana report:", exportError);
      setError("Unable to create the Excel report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleMonthlyExport = () => {
    try {
      setExporting(true);
      exportMonthlyExcel({
        monthKey: reportMonth,
        reportDevotees,
        records,
        trackingStartDate,
      });
      setSuccess(
        `${formatMonthYear(`${reportMonth}-01`)} Excel report downloaded.`
      );
    } catch (exportError) {
      console.error("Failed to export monthly Sadhana report:", exportError);
      setError("Unable to create the monthly Excel report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || loading) {
    return <Loader text="Loading Sadhana..." />;
  }

  if (isDevotee) {
    const history = [...validRecords].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );

    return (
      <div className="sadhana-page">
        <header className="sadhana-header">
          <div>
            <span className="sadhana-eyebrow">MY DAILY PRACTICE</span>
            <h1>Sadhana</h1>
            <p>
              Record your daily practice in a simple step-by-step format.
            </p>
          </div>
        </header>

        {error && <div className="sadhana-error">{error}</div>}
        {success && <div className="sadhana-success">{success}</div>}

        <section className="sadhana-devotee-guide">
          <div className="sadhana-guide-heading">
            <div className="sadhana-guide-icon">?</div>
            <div>
              <strong>How to complete today's card</strong>
              <p>
                Fill what applies to you. Use the short descriptions below
                instead of guessing what a field means.
              </p>
            </div>
          </div>

          <div className="sadhana-guide-grid">
            <div>
              <span>01</span>
              <strong>Sleep &amp; rest</strong>
              <small>Bedtime, wake-up and daytime rest.</small>
            </div>
            <div>
              <span>02</span>
              <strong>Morning program</strong>
              <small>M.P. report time, Japa, Mangal Arti and class.</small>
            </div>
            <div>
              <span>03</span>
              <strong>Adhyayan</strong>
              <small>Book or topic studied and time spent.</small>
            </div>
            <div>
              <span>04</span>
              <strong>Shravan</strong>
              <small>Speaker or topic heard and time spent.</small>
            </div>
            <div>
              <span>05</span>
              <strong>Seva</strong>
              <small>Service performed and time spent.</small>
            </div>
            <div>
              <span>06</span>
              <strong>Work-life</strong>
              <small>Exercise, college/work and study hours.</small>
            </div>
            <div>
              <span>07</span>
              <strong>Reflection</strong>
              <small>Reading, meditation, reason and notes.</small>
            </div>
          </div>
        </section>

        <section className="sadhana-card sadhana-card-sheet">
          <div className="sadhana-sheet-heading">
            <div>
              <strong>SADHANA CARD</strong>
              <span>- for the pleasure of Sri Guru &amp; Gauranga</span>
            </div>
            <small>
              Today's card is editable. Previous days can be viewed but not
              changed.
            </small>
          </div>

          <div className="sadhana-verse">
            युक्ताहारविहारस्य युक्तचेष्टस्य कर्मसु। युक्तस्वप्नावबोधस्य योगो भवति दुःखहा ॥
            <span>Bg. 6.17</span>
          </div>

          <div className="sadhana-motto">
            I WOULD PREFER EVEN TO FAIL WITH HONOR THAN TO WIN BY CHEATING.
          </div>

          <div className="sadhana-identity-row">
            <label>
              <span>Name</span>
              <strong>{user?.name || user?.email || "Devotee"}</strong>
            </label>
            <label>
              <span>Month-Year</span>
              <strong>{formatMonthYear(selectedDate)}</strong>
            </label>
          </div>

          <div className="sadhana-mobile-note">
            <strong>Mobile tip:</strong> Complete each section below. Swipe
            left/right only if you need to see the original card table.
          </div>

          <div className="sadhana-sheet-scroll">
            <table className="sadhana-sheet-table">
              <thead>
                <tr>
                  <th rowSpan="2">Date</th>
                  <th colSpan="3">NIDRA</th>
                  <th colSpan="4">MORNING PROGRAM</th>
                  <th colSpan="2">ADHYAYAN</th>
                  <th colSpan="2">SHRAVAN</th>
                  <th colSpan="2">SEVA</th>
                  <th colSpan="3">WORK-LIFE</th>
                  <th rowSpan="2">
                    Reason
                    <br />
                    (If any)
                  </th>
                </tr>
                <tr>
                  <th title="Time you went to bed">To Bed</th>
                  <th title="Time you woke up">Wake Up</th>
                  <th title="Daytime rest in hours">Day Rest</th>
                  <th title="Morning program reporting time">M.P. Report</th>
                  <th title="Number of Japa rounds">Japa</th>
                  <th title="Mangal Arti attendance">M.A.</th>
                  <th title="Morning class attendance">M. Class</th>
                  <th title="Book name or study topic">Book / Topic</th>
                  <th>Time</th>
                  <th title="Speaker name or hearing topic">
                    Speaker / Topic
                  </th>
                  <th>Time</th>
                  <th title="Description of service performed">Seva</th>
                  <th>Time</th>
                  <th title="Yoga or exercise duration in minutes">Yoga / Exercise<br />(min)</th>
                  <th title="College or work duration in hours">College / Work<br />(hrs)</th>
                  <th title="Study or extra work duration in hours">Study / X-Work<br />(hrs)</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>{formatDate(selectedDate)}</td>
                  <td>
                    <input
                      type="time"
                      name="toBed"
                      value={form.toBed}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name="wakeUp"
                      value={form.wakeUp}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      name="dayRest"
                      value={form.dayRest}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name="morningProgramReport"
                      value={form.morningProgramReport}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      name="rounds"
                      value={form.rounds}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <select
                      name="mangalArti"
                      value={form.mangalArti}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    >
                      <option value="">—</option>
                      <option value="present">P</option>
                      <option value="absent">A</option>
                    </select>
                  </td>
                  <td>
                    <select
                      name="morningClass"
                      value={form.morningClass}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    >
                      <option value="">—</option>
                      <option value="present">P</option>
                      <option value="absent">A</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      name="adhyyanBookTopic"
                      value={form.adhyyanBookTopic}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Book / topic"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name="adhyyanTime"
                      value={form.adhyyanTime}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Time"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name="shravanSpeakerTopic"
                      value={form.shravanSpeakerTopic}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Speaker / topic"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name="shravanTime"
                      value={form.shravanTime}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Time"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name="sevaDescription"
                      value={form.sevaDescription}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Seva"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name="sevaTime"
                      value={form.sevaTime}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Time"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      name="yogaExercise"
                      value={form.yogaExercise}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      name="collegeWork"
                      value={form.collegeWork}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      name="studyXWork"
                      value={form.studyXWork}
                      onChange={handleChange}
                      disabled={!canEditToday}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name="reason"
                      value={form.reason}
                      onChange={handleChange}
                      disabled={!canEditToday}
                      placeholder="Reason"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="sadhana-mobile-fields">
            <MobileFieldSection
              title="01 · Sleep & Rest"
              description="Record your sleep timing and daytime rest."
            >
              <MobileField
                label="To bed"
                hint="When you went to sleep"
                type="time"
                name="toBed"
                value={form.toBed}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Wake up"
                hint="When you woke up"
                type="time"
                name="wakeUp"
                value={form.wakeUp}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Day rest"
                hint="Hours, e.g. 0.5"
                type="number"
                min="0"
                step="0.5"
                name="dayRest"
                value={form.dayRest}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="02 · Morning Program"
              description="Enter reporting time, Japa and attendance."
            >
              <MobileField
                label="M.P. Report time"
                hint="Your morning program report time"
                type="time"
                name="morningProgramReport"
                value={form.morningProgramReport}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Japa rounds"
                hint="Number of rounds"
                type="number"
                min="0"
                name="rounds"
                value={form.rounds}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileSelect
                label="Mangal Arti"
                hint="Choose Present or Absent"
                name="mangalArti"
                value={form.mangalArti}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileSelect
                label="Morning class"
                hint="Choose Present or Absent"
                name="morningClass"
                value={form.morningClass}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="03 · Adhyayan"
              description="Record what you studied and how long."
            >
              <MobileField
                label="Book / topic"
                hint="What did you study?"
                name="adhyyanBookTopic"
                value={form.adhyyanBookTopic}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Study time"
                hint="How long?"
                name="adhyyanTime"
                value={form.adhyyanTime}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="04 · Shravan"
              description="Record the speaker or topic you heard."
            >
              <MobileField
                label="Speaker / topic"
                hint="Who or what did you hear?"
                name="shravanSpeakerTopic"
                value={form.shravanSpeakerTopic}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Hearing time"
                hint="How long?"
                name="shravanTime"
                value={form.shravanTime}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="05 · Seva"
              description="Record the service you performed."
            >
              <MobileField
                label="Seva description"
                hint="What service did you do?"
                name="sevaDescription"
                value={form.sevaDescription}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Seva time"
                hint="How long?"
                name="sevaTime"
                value={form.sevaTime}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="06 · Work-Life"
              description="Use minutes for exercise and hours for work or study."
            >
              <MobileField
                label="Yoga / exercise (min)"
                hint="Minutes, e.g. 30"
                type="number"
                min="0"
                step="5"
                name="yogaExercise"
                value={form.yogaExercise}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="College / work (hrs)"
                hint="Hours, e.g. 8"
                type="number"
                min="0"
                step="0.5"
                name="collegeWork"
                value={form.collegeWork}
                onChange={handleChange}
                disabled={!canEditToday}
              />
              <MobileField
                label="Study / X-Work (hrs)"
                hint="Hours, e.g. 2"
                type="number"
                min="0"
                step="0.5"
                name="studyXWork"
                value={form.studyXWork}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="07 · Reflection"
              description="Add anything useful for your daily record."
            >
              <MobileField
                label="Reason, if any"
                hint="Optional"
                name="reason"
                value={form.reason}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </MobileFieldSection>
          </div>

          <div className="sadhana-sheet-footer">
            <span>P = Present</span>
            <span>A = Absent</span>
            <span>Day Rest = hours</span>
            <span>Yoga / Exercise = minutes</span>
            <span>College / Work = hours</span>
            <span>X-Work = study / extra work hours</span>
            <span>Optional fields may be left blank</span>
          </div>
        </section>

        <section className="sadhana-card sadhana-extra-card">
          <div className="sadhana-card-header">
            <div>
              <span className="sadhana-card-eyebrow">ADDITIONAL PRACTICE</span>
              <h2>Personal Practice &amp; Notes</h2>
              <p>Use these fields for activities not covered in the main card.</p>
            </div>
            {isToday && (
              <span className="sadhana-date-badge">{formatDate(selectedDate)}</span>
            )}
          </div>

          <div className="sadhana-extra-grid">
            <label>
              <span>Reading (minutes)</span>
              <small>Time spent reading</small>
              <input
                type="number"
                min="0"
                name="reading"
                value={form.reading}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </label>

            <label>
              <span>Meditation (minutes)</span>
              <small>Time spent meditating</small>
              <input
                type="number"
                min="0"
                name="meditation"
                value={form.meditation}
                onChange={handleChange}
                disabled={!canEditToday}
              />
            </label>

            <label className="sadhana-full-field">
              <span>Notes</span>
              <small>Optional reflection or important detail</small>
              <textarea
                name="notes"
                rows="4"
                value={form.notes}
                onChange={handleChange}
                disabled={!canEditToday}
                placeholder="Add a note about today's practice..."
              />
            </label>
          </div>

          {isPastDate && (
            <div className="sadhana-readonly-notice">
              This is a past record. Past Sadhana records are read-only.
            </div>
          )}

          {isFutureDate && (
            <div className="sadhana-readonly-notice">
              Future Sadhana records cannot be created yet.
            </div>
          )}

          <div className="sadhana-date-selector">
            <label>
              <span>View another date</span>
              <small>Past dates can be reviewed.</small>
              <input
                type="date"
                value={selectedDate}
                max={todayDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
          </div>

          {canEditToday && (
            <div className="sadhana-form-actions">
              <button
                type="button"
                className="sadhana-primary-button"
                onClick={saveSadhana}
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
        </section>

        <section className="sadhana-card">
          <div className="sadhana-card-header">
            <div>
              <span className="sadhana-card-eyebrow">HISTORY</span>
              <h2>My Sadhana History</h2>
              <p>Select a previous date to review your submitted record.</p>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="sadhana-empty">
              <h3>No Sadhana records yet</h3>
              <p>Your completed daily records will appear here.</p>
            </div>
          ) : (
            <div className="sadhana-history-list">
              {history.map((record) => (
                <button
                  type="button"
                  className={
                    record.date === selectedDate
                      ? "sadhana-history-item selected"
                      : "sadhana-history-item"
                  }
                  key={record.id}
                  onClick={() => setSelectedDate(record.date)}
                >
                  <div>
                    <strong>{formatDate(record.date)}</strong>
                    <span>{toNumber(record.rounds)} Japa rounds</span>
                  </div>
                  <div>
                    <span>Reading</span>
                    <strong>{toNumber(record.reading)} min</strong>
                  </div>
                  <div>
                    <span>Meditation</span>
                    <strong>{toNumber(record.meditation)} min</strong>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (isAdministrator) {
    const selectedMonthLabel = formatMonthYear(`${reportMonth}-01`);

    return (
      <div className="sadhana-page">
        <header className="sadhana-header sadhana-admin-header">
          <div>
            <span className="sadhana-eyebrow">BACE COMMUNITY MONITORING</span>
            <h1>Sadhana</h1>
            <p>
              Monitor daily records, attendance markings and monthly completion
              across the devotee community.
            </p>
          </div>
        </header>

        {error && <div className="sadhana-error">{error}</div>}
        {success && <div className="sadhana-success">{success}</div>}

        <section className="sadhana-stats">
          <article className="sadhana-stat">
            <span>Records</span>
            <strong>{recordsForDate.length}</strong>
            <small>Submitted for selected date</small>
          </article>
          <article className="sadhana-stat">
            <span>Active Devotees</span>
            <strong>{activeDevotees.length}</strong>
            <small>Current active accounts</small>
          </article>
          <article className="sadhana-stat">
            <span>Total Japa</span>
            <strong>{totalRounds}</strong>
            <small>Selected date</small>
          </article>
          <article className="sadhana-stat">
            <span>Submission Rate</span>
            <strong>
              {activeDevotees.length
                ? Math.round(
                    (recordsForDate.length / activeDevotees.length) * 100
                  )
                : 0}
              %
            </strong>
            <small>Selected date</small>
          </article>
        </section>

        <section className="sadhana-toolbar sadhana-admin-toolbar">
          <label>
            <span>Daily view</span>
            <small>Choose a day to monitor.</small>
            <input
              type="date"
              value={selectedDate}
              max={todayDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <label className="sadhana-search">
            <span>Search devotee</span>
            <small>Name, email, phone or department</small>
            <input
              type="search"
              value={searchTerm}
              placeholder="Search..."
              onChange={(event) =>
                setSearchTerm(event.target.value.trim().toLowerCase())
              }
            />
          </label>
        </section>

        <section className="sadhana-report-card">
          <div className="sadhana-report-heading">
            <div>
              <span className="sadhana-card-eyebrow">REPORTS &amp; EXPORT</span>
              <h2>Excel Reports</h2>
              <p>
                Reports include only dates from the community tracking start date.
              </p>
            </div>
            {completedMonth ? (
              <span className="sadhana-complete-badge">
                Month completed
              </span>
            ) : reportIsFutureMonth ? (
              <span className="sadhana-progress-badge">
                Future month
              </span>
            ) : (
              <span className="sadhana-progress-badge">
                Month in progress
              </span>
            )}
          </div>

          <div className="sadhana-report-controls">
            <label>
              <span>Report month</span>
              <small>{selectedMonthLabel}</small>
              <input
                type="month"
                value={reportMonth}
                max={getCurrentMonthKey()}
                onChange={(event) => setReportMonth(event.target.value)}
              />
            </label>

            <div className="sadhana-report-actions">
              <button
                type="button"
                className="sadhana-secondary-button"
                onClick={handleDailyExport}
                disabled={exporting || isFutureDate}
              >
                {exporting ? "Preparing..." : "Export Daily Excel"}
              </button>

              <button
                type="button"
                className="sadhana-primary-button"
                onClick={handleMonthlyExport}
                disabled={exporting || !reportMonth || reportIsFutureMonth}
              >
                {exporting
                  ? "Preparing..."
                  : reportIsFutureMonth
                    ? "No Future Report"
                    : completedMonth
                      ? "Generate Completed Month"
                      : "Export Monthly Excel"}
              </button>
            </div>
          </div>

          <div className="sadhana-report-start">
            <span>Tracking started</span>
            <strong>{formatDate(trackingStartDate)}</strong>
            <small>Earlier dates are not included in completion totals.</small>
          </div>

          <div className="sadhana-report-metrics">
            <div>
              <span>Days counted</span>
              <strong>{reportDays.length}</strong>
            </div>
            <div>
              <span>Devotees</span>
              <strong>{reportDevotees.length}</strong>
            </div>
            <div>
              <span>Submitted</span>
              <strong>{reportSubmitted}</strong>
            </div>
            <div>
              <span>Not submitted</span>
              <strong>{reportNotSubmitted}</strong>
            </div>
            <div>
              <span>Completion</span>
              <strong>{reportCompletion}%</strong>
            </div>
          </div>

        </section>

        <AdminSadhanaTable
          records={recordsForDate}
          devotees={activeDevotees}
          devoteeMap={devoteeMap}
          searchTerm={searchTerm}
          selectedDate={selectedDate}
        />

      </div>
    );
  }

  return null;
}

function MobileFieldSection({ title, description, children }) {
  return (
    <section className="sadhana-mobile-section">
      <div className="sadhana-mobile-section-heading">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className="sadhana-mobile-grid">{children}</div>
    </section>
  );
}

function MobileField({
  label,
  hint,
  type = "text",
  min,
  step,
  name,
  value,
  onChange,
  disabled,
}) {
  return (
    <label className="sadhana-mobile-field">
      <span>{label}</span>
      <small>{hint}</small>
      <input
        type={type}
        min={min}
        step={step}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}

function MobileSelect({
  label,
  hint,
  name,
  value,
  onChange,
  disabled,
}) {
  return (
    <label className="sadhana-mobile-field">
      <span>{label}</span>
      <small>{hint}</small>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        <option value="">Select</option>
        <option value="present">Present</option>
        <option value="absent">Absent</option>
      </select>
    </label>
  );
}

function AdminSadhanaTable({
  records,
  devotees,
  devoteeMap,
  searchTerm,
  selectedDate,
}) {
  const recordMap = useMemo(
    () =>
      new Map(
        records.map((record) => [
          `${record.devoteeId}_${record.date}`,
          record,
        ])
      ),
    [records]
  );

  const filteredDevotees = useMemo(() => {
    if (!searchTerm) return devotees;

    return devotees.filter((devotee) => {
      const searchable = [
        devotee.name,
        devotee.email,
        devotee.phone,
        devotee.department,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(searchTerm);
    });
  }, [devotees, searchTerm]);

  if (filteredDevotees.length === 0) {
    return (
      <section className="sadhana-card">
        <div className="sadhana-empty">
          <h3>No matching devotees</h3>
          <p>
            No active devotee matches the current search or no active devotees
            are available.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="sadhana-card sadhana-admin-table-card">
      <div className="sadhana-card-header">
        <div>
          <span className="sadhana-card-eyebrow">DAILY MONITORING</span>
          <h2>Community Sadhana</h2>
          <p>{formatDate(selectedDate)} · Daily submission status</p>
        </div>
      </div>

      <div className="sadhana-admin-summary">
        <div>
          <span>Submitted</span>
          <strong>{records.length}</strong>
        </div>
        <div>
          <span>Not submitted</span>
          <strong>{Math.max(0, filteredDevotees.length - records.length)}</strong>
        </div>
        <div>
          <span>Japa</span>
          <strong>
            {records.reduce((sum, record) => sum + toNumber(record.rounds), 0)}
          </strong>
        </div>
      </div>

      <div className="sadhana-admin-mobile-list">
        {filteredDevotees.map((devotee) => {
          const record = recordMap.get(`${devotee.uid}_${selectedDate}`);
          const name = getDisplayName(devotee);

          return (
            <article className="sadhana-admin-mobile-card" key={devotee.uid}>
              <div className="sadhana-admin-person">
                <div className="sadhana-avatar">{getInitials(name)}</div>
                <div>
                  <strong>{name}</strong>
                  <small>Daily Sadhana</small>
                </div>
              </div>

              <div
                className={
                  record
                    ? "sadhana-submission-status submitted"
                    : "sadhana-submission-status missing"
                }
              >
                {record ? "Submitted" : "Not submitted"}
              </div>

              <div className="sadhana-admin-mobile-values">
                <div>
                  <span>Japa</span>
                  <strong>{record ? toNumber(record.rounds) : 0}</strong>
                </div>
                <div>
                  <span>M.A.</span>
                  <strong>{record ? statusLabel(record.mangalArti) : "—"}</strong>
                </div>
                <div>
                  <span>M. Class</span>
                  <strong>
                    {record ? statusLabel(record.morningClass) : "—"}
                  </strong>
                </div>
                <div>
                  <span>M.P. Report</span>
                  <strong>{record?.morningProgramReport || "—"}</strong>
                </div>
                <div>
                  <span>Seva</span>
                  <strong>{record?.sevaDescription || "—"}</strong>
                </div>
                <div>
                  <span>Work-Life</span>
                  <strong>
                    {record
                      ? `${toNumber(record.yogaExercise)} min yoga · ${toNumber(record.collegeWork)} hrs work · ${toNumber(record.studyXWork)} hrs study`
                      : "—"}
                  </strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="sadhana-table-wrapper sadhana-admin-desktop-table">
        <table className="sadhana-table">
          <thead>
            <tr>
              <th>Devotee</th>
              <th>Status</th>
              <th>Japa</th>
              <th>M.A.</th>
              <th>M. Class</th>
              <th>M.P. Report</th>
              <th>Adhyayan</th>
              <th>Shravan</th>
              <th>Seva</th>
              <th>Work-Life</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevotees.map((devotee) => {
              const record = recordMap.get(`${devotee.uid}_${selectedDate}`);
              const name = getDisplayName(devotee);

              return (
                <tr key={devotee.uid}>
                  <td>
                    <div className="sadhana-devotee">
                      <div className="sadhana-avatar">
                        {getInitials(name)}
                      </div>
                      <div>
                        <strong>{name}</strong>
                        <small>
                          {devotee.email || "No email available"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        record
                          ? "sadhana-submission-status submitted"
                          : "sadhana-submission-status missing"
                      }
                    >
                      {record ? "Submitted" : "Not submitted"}
                    </span>
                  </td>
                  <td>
                    <span className="sadhana-rounds">
                      {record ? toNumber(record.rounds) : 0}
                    </span>
                  </td>
                  <td>{record ? statusLabel(record.mangalArti) : "—"}</td>
                  <td>{record ? statusLabel(record.morningClass) : "—"}</td>
                  <td>{record?.morningProgramReport || "—"}</td>
                  <td>
                    {record?.adhyyanBookTopic || "—"}
                    {record?.adhyyanTime ? ` · ${record.adhyyanTime}` : ""}
                  </td>
                  <td>
                    {record?.shravanSpeakerTopic || "—"}
                    {record?.shravanTime ? ` · ${record.shravanTime}` : ""}
                  </td>
                  <td>
                    {record?.sevaDescription || "—"}
                    {record?.sevaTime ? ` · ${record.sevaTime}` : ""}
                  </td>
                  <td>
                    Yoga {record ? toNumber(record.yogaExercise) : 0} min ·
                    College/Work {record ? toNumber(record.collegeWork) : 0} hrs ·
                    Study/X-Work {record ? toNumber(record.studyXWork) : 0} hrs
                  </td>
                  <td>{record?.reason || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default Sadhana;
