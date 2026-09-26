import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
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
  eveningProgramReport: "",
  rounds: 0,
  mangalArti: "",
  morningClass: "",
  eveningClass: "",
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
    return `${year}-${String(month).padStart(2, "0")}-${String(
      index + 1
    ).padStart(2, "0")}`;
  });
}

function getReportDays(monthKey, trackingStartDate = "") {
  const allDays = getDaysInMonth(monthKey);
  const today = getToday();
  const currentMonth = getCurrentMonthKey();

  if (!monthKey || !allDays.length) return [];

  /*
   * ONE GLOBAL TRACKING RULE
   *
   * The trackingStartDate comes from settings/general and is shared by
   * Monthly reports.
   *
   * Therefore:
   * - dates before trackingStartDate are never reportable;
   * - completed months after the tracking start use the full calendar month;
   * - the current month uses trackingStartDate -> today;
   * - future months have no reportable dates.
   */
  if (monthKey > currentMonth) {
    return [];
  }

  return allDays.filter((date) => {
    if (date > today) return false;

    if (
      trackingStartDate &&
      date < trackingStartDate
    ) {
      return false;
    }

    return true;
  });
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function statusLabel(value) {
  const status = normalizeStatus(value);

  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  if (status === "late") return "Late";

  return "Not marked";
}

function statusShort(value) {
  const status = normalizeStatus(value);

  if (status === "present") return "P";
  if (status === "absent") return "A";
  if (status === "late") return "L";

  return "—";
}

/*
 * Attendance logic:
 *
 * Present = attended
 * Late    = attended
 * Absent  = not attended
 * Blank   = not included in attendance denominator
 *
 * This means an old record containing "present" or "absent"
 * continues to work exactly as before.
 */
function isAttendedStatus(value) {
  const status = normalizeStatus(value);

  return status === "present" || status === "late";
}

function isMarkedStatus(value) {
  const status = normalizeStatus(value);

  return (
    status === "present" ||
    status === "late" ||
    status === "absent"
  );
}

function calculateAttendanceStats(records, field) {
  const present = records.filter(
    (record) =>
      normalizeStatus(record[field]) === "present"
  ).length;

  const late = records.filter(
    (record) =>
      normalizeStatus(record[field]) === "late"
  ).length;

  const absent = records.filter(
    (record) =>
      normalizeStatus(record[field]) === "absent"
  ).length;

  const marked = present + late + absent;
  const attended = present + late;

  const percentage =
    marked > 0
      ? Math.round((attended / marked) * 100)
      : 0;

  return {
    present,
    late,
    absent,
    marked,
    attended,
    percentage,
  };
}

function calculateCombinedAttendanceStats(records) {
  const mangal = calculateAttendanceStats(
    records,
    "mangalArti"
  );

  const morningClass = calculateAttendanceStats(
    records,
    "morningClass"
  );

  const eveningClass = calculateAttendanceStats(
    records,
    "eveningClass"
  );

  const attended =
    mangal.attended +
    morningClass.attended +
    eveningClass.attended;

  const marked =
    mangal.marked +
    morningClass.marked +
    eveningClass.marked;

  const percentage =
    marked > 0
      ? Math.round((attended / marked) * 100)
      : 0;

  return {
    attended,
    marked,
    percentage,
  };
}

function calculateSubmissionStats(
  monthDates,
  records
) {
  const submitted = records.length;

  const possible = monthDates.length;

  const notSubmitted = Math.max(
    0,
    possible - submitted
  );

  const percentage =
    possible > 0
      ? Math.round((submitted / possible) * 100)
      : 0;

  return {
    submitted,
    notSubmitted,
    possible,
    percentage,
  };
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
      const record = recordMap.get(
        `${devotee.uid}_${date}`
      );

      rows.push({
        Date: date,
        "Display Date": formatDate(date),
        Devotee: getDisplayName(devotee),
        Email: devotee.email || "",
        Department: devotee.department || "",

        "Sadhana Status": record
          ? "Submitted"
          : "Not Submitted",

        "Japa Rounds": record
          ? toNumber(record.rounds)
          : 0,

        "Mangal Arti": record
          ? statusLabel(record.mangalArti)
          : "Not marked",

        "Mangal Arti Code": record
          ? statusShort(record.mangalArti)
          : "—",

        "Morning Class": record
          ? statusLabel(record.morningClass)
          : "Not marked",

        "Morning Class Code": record
          ? statusShort(record.morningClass)
          : "—",

        "Evening Class": record
          ? statusLabel(record.eveningClass)
          : "Not marked",

        "Evening Class Code": record
          ? statusShort(record.eveningClass)
          : "—",

        "To Bed": record?.toBed || "",
        "Wake Up": record?.wakeUp || "",

        "Day Rest (hrs)": record
          ? toNumber(record.dayRest)
          : 0,

        "M.P. Report":
          record?.morningProgramReport || "",

        "E.P. Report":
          record?.eveningProgramReport || "",

        "Adhyayan Topic":
          record?.adhyyanBookTopic || "",

        "Adhyayan Time":
          record?.adhyyanTime || "",

        "Shravan Topic":
          record?.shravanSpeakerTopic || "",

        "Shravan Time":
          record?.shravanTime || "",

        Seva:
          record?.sevaDescription || "",

        "Seva Time":
          record?.sevaTime || "",

        "Yoga / Exercise (min)": record
          ? toNumber(record.yogaExercise)
          : 0,

        "College / Work (hrs)": record
          ? toNumber(record.collegeWork)
          : 0,

        "Study / X-Work (hrs)": record
          ? toNumber(record.studyXWork)
          : 0,

        Reading: record
          ? toNumber(record.reading)
          : 0,

        Meditation: record
          ? toNumber(record.meditation)
          : 0,

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
      .map((date) =>
        recordMap.get(
          `${devotee.uid}_${date}`
        )
      )
      .filter(Boolean);

    const rounds = devoteeRecords.reduce(
      (total, record) =>
        total + toNumber(record.rounds),
      0
    );

    const reading = devoteeRecords.reduce(
      (total, record) =>
        total + toNumber(record.reading),
      0
    );

    const meditation = devoteeRecords.reduce(
      (total, record) =>
        total + toNumber(record.meditation),
      0
    );

    const morningProgram =
      devoteeRecords.filter((record) =>
        safeText(record.morningProgramReport)
      ).length;

    const mangalArtiStats =
      calculateAttendanceStats(
        devoteeRecords,
        "mangalArti"
      );

    const morningClassStats =
      calculateAttendanceStats(
        devoteeRecords,
        "morningClass"
      );

    const eveningClassStats =
      calculateAttendanceStats(
        devoteeRecords,
        "eveningClass"
      );

    const combinedAttendanceStats =
      calculateCombinedAttendanceStats(
        devoteeRecords
      );

    const submissionStats =
      calculateSubmissionStats(
        monthDates,
        devoteeRecords
      );

    const totalExercise = devoteeRecords.reduce(
      (total, record) =>
        total + toNumber(record.yogaExercise),
      0
    );

    const totalCollegeWork =
      devoteeRecords.reduce(
        (total, record) =>
          total + toNumber(record.collegeWork),
        0
      );

    const totalStudyWork =
      devoteeRecords.reduce(
        (total, record) =>
          total + toNumber(record.studyXWork),
        0
      );

    return {
      Devotee: getDisplayName(devotee),
      Email: devotee.email || "",
      Department: devotee.department || "",

      "Days Covered": monthDates.length,

      "Sadhana Submitted":
        submissionStats.submitted,

      "Sadhana Not Submitted":
        submissionStats.notSubmitted,

      "Sadhana Submission %":
        submissionStats.percentage,

      "Japa Total": rounds,

      "Japa Average / Submitted Day":
        devoteeRecords.length > 0
          ? Math.round(
              (rounds /
                devoteeRecords.length) *
                10
            ) / 10
          : 0,

      "Mangal Arti Present":
        mangalArtiStats.present,

      "Mangal Arti Late":
        mangalArtiStats.late,

      "Mangal Arti Absent":
        mangalArtiStats.absent,

      "Mangal Arti Marked":
        mangalArtiStats.marked,

      "Mangal Arti Attendance %":
        mangalArtiStats.percentage,

      "Morning Class Present":
        morningClassStats.present,

      "Morning Class Late":
        morningClassStats.late,

      "Morning Class Absent":
        morningClassStats.absent,

      "Morning Class Marked":
        morningClassStats.marked,

      "Morning Class Attendance %":
        morningClassStats.percentage,

      "Evening Class Present":
        eveningClassStats.present,

      "Evening Class Late":
        eveningClassStats.late,

      "Evening Class Absent":
        eveningClassStats.absent,

      "Evening Class Marked":
        eveningClassStats.marked,

      "Evening Class Attendance %":
        eveningClassStats.percentage,

      "Overall Attendance %":
        combinedAttendanceStats.percentage,

      "Morning Program Recorded":
        morningProgram,

      "Evening Program Recorded":
        devoteeRecords.filter((record) =>
          safeText(record.eveningProgramReport)
        ).length,

      "Adhyayan Entries":
        devoteeRecords.filter((record) =>
          safeText(record.adhyyanBookTopic)
        ).length,

      "Shravan Entries":
        devoteeRecords.filter((record) =>
          safeText(record.shravanSpeakerTopic)
        ).length,

      "Seva Entries":
        devoteeRecords.filter((record) =>
          safeText(record.sevaDescription)
        ).length,

      "Yoga / Exercise Total (min)":
        totalExercise,

      "College / Work Total (hrs)":
        totalCollegeWork,

      "Study / X-Work Total (hrs)":
        totalStudyWork,

      "Reading Total (min)":
        reading,

      "Meditation Total (min)":
        meditation,
    };
  });
}

function createSummaryRows(summaryRows) {
  const totals = summaryRows.reduce(
    (total, row) => {
      total.devotees += 1;

      total.submitted +=
        row["Sadhana Submitted"];

      total.notSubmitted +=
        row["Sadhana Not Submitted"];

      total.rounds +=
        row["Japa Total"];

      total.mangalPresent +=
        row["Mangal Arti Present"];

      total.mangalLate +=
        row["Mangal Arti Late"];

      total.mangalAbsent +=
        row["Mangal Arti Absent"];

      total.classPresent +=
        row["Morning Class Present"];

      total.classLate +=
        row["Morning Class Late"];

      total.classAbsent +=
        row["Morning Class Absent"];

      total.eveningClassPresent +=
        row["Evening Class Present"];

      total.eveningClassLate +=
        row["Evening Class Late"];

      total.eveningClassAbsent +=
        row["Evening Class Absent"];

      return total;
    },
    {
      devotees: 0,
      submitted: 0,
      notSubmitted: 0,
      rounds: 0,
      mangalPresent: 0,
      mangalLate: 0,
      mangalAbsent: 0,
      classPresent: 0,
      classLate: 0,
      classAbsent: 0,
      eveningClassPresent: 0,
      eveningClassLate: 0,
      eveningClassAbsent: 0,
    }
  );

  return [
    {
      Metric: "Devotees in report",
      Value: totals.devotees,
    },
    {
      Metric: "Sadhana submissions",
      Value: totals.submitted,
    },
    {
      Metric: "Days not submitted",
      Value: totals.notSubmitted,
    },
    {
      Metric: "Total Japa rounds",
      Value: totals.rounds,
    },
    {
      Metric: "Mangal Arti marked Present",
      Value: totals.mangalPresent,
    },
    {
      Metric: "Mangal Arti marked Late",
      Value: totals.mangalLate,
    },
    {
      Metric: "Mangal Arti marked Absent",
      Value: totals.mangalAbsent,
    },
    {
      Metric: "Morning Class marked Present",
      Value: totals.classPresent,
    },
    {
      Metric: "Morning Class marked Late",
      Value: totals.classLate,
    },
    {
      Metric: "Morning Class marked Absent",
      Value: totals.classAbsent,
    },
    {
      Metric: "Evening Class marked Present",
      Value: totals.eveningClassPresent,
    },
    {
      Metric: "Evening Class marked Late",
      Value: totals.eveningClassLate,
    },
    {
      Metric: "Evening Class marked Absent",
      Value: totals.eveningClassAbsent,
    },
  ];
}

function exportDailyExcel({
  selectedDate,
  reportDevotees,
  records,
}) {
  const recordMap = new Map(
    records
      .filter(
        (record) =>
          record.date === selectedDate
      )
      .map((record) => [
        `${record.devoteeId}_${record.date}`,
        record,
      ])
  );

  const rows = buildDailyReportRows({
    monthDates: [selectedDate],
    reportDevotees,
    recordMap,
  });

  const workbook = XLSX.utils.book_new();

  const worksheet =
    XLSX.utils.json_to_sheet(rows);

  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
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

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Daily Report"
  );

  downloadWorkbook(
    workbook,
    createDownloadName(
      "BACE-Sadhana-Daily",
      selectedDate
    )
  );
}

function exportMonthlyExcel({
  monthKey,
  reportDevotees,
  records,
  trackingStartDate,
}) {
  const monthDates = getReportDays(
    monthKey,
    trackingStartDate
  );

  if (!monthDates.length) {
    throw new Error(
      "No reportable dates are available for this month. The selected month may be before the tracking start date or in the future."
    );
  }

  const calendarDays =
    getDaysInMonth(monthKey);

  const monthRecords = records.filter(
    (record) =>
      String(record.date || "").startsWith(
        `${monthKey}-`
      )
  );

  const recordMap = new Map(
    monthRecords.map((record) => [
      `${record.devoteeId}_${record.date}`,
      record,
    ])
  );

  const summaryRows =
    buildMonthlySummaryRows({
      monthDates,
      reportDevotees,
      recordMap,
    });

  const dailyRows =
    buildDailyReportRows({
      monthDates,
      reportDevotees,
      recordMap,
    });

  const workbook = XLSX.utils.book_new();

  const overviewRows = [
    {
      Field: "Report",
      Value:
        "BACE Monthly Sadhana Report",
    },
    {
      Field: "Month",
      Value: formatMonthYear(
        `${monthKey}-01`
      ),
    },
    {
      Field: "Report Status",
      Value: isCompletedMonth(monthKey)
        ? "Month Completed"
        : "Month In Progress",
    },
    {
      Field: "Generated On",
      Value: formatDate(getToday()),
    },
    {
      Field: "Devotees Included",
      Value: reportDevotees.length,
    },
    {
      Field: "Calendar Days in Month",
      Value: calendarDays.length,
    },
    {
      Field: "Tracking Start Date",
      Value: trackingStartDate
        ? formatDate(trackingStartDate)
        : "Not set",
    },
    {
      Field: "Tracking Start Date",
      Value: trackingStartDate
        ? formatDate(trackingStartDate)
        : "Not set",
    },
    {
      Field: "Days Covered by Report",
      Value: monthDates.length,
    },
    {
      Field: "Future Dates Excluded",
      Value:
        calendarDays.length >
        monthDates.length
          ? calendarDays.length -
            monthDates.length
          : 0,
    },
    {
      Field: "Overall Attendance %",
      Value: (() => {
        const attendanceRecords = reportDevotees.flatMap((devotee) =>
          monthDates
            .map((date) =>
              recordMap.get(`${devotee.uid}_${date}`)
            )
            .filter(Boolean)
        );

        return calculateCombinedAttendanceStats(
          attendanceRecords
        ).percentage;
      })(),
    },
    {
      Field: "Attendance Rule",
      Value:
        "Present + Late = Attended; Absent = Not Attended; Blank = Not Marked",
    },
  ];

  const overviewSheet =
    XLSX.utils.json_to_sheet(
      overviewRows
    );

  const summarySheet =
    XLSX.utils.json_to_sheet(
      summaryRows
    );

  const dailySheet =
    XLSX.utils.json_to_sheet(
      dailyRows
    );

  const totalsSheet =
    XLSX.utils.json_to_sheet(
      createSummaryRows(summaryRows)
    );

  overviewSheet["!cols"] = [
    { wch: 26 },
    { wch: 80 },
  ];

  summarySheet["!cols"] = [
    { wch: 24 },
    { wch: 30 },
    { wch: 18 },
    { wch: 15 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
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
    { wch: 18 },
    { wch: 20 },
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

  XLSX.utils.book_append_sheet(
    workbook,
    overviewSheet,
    "Overview"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    "Monthly Summary"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    dailySheet,
    "Daily Details"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    totalsSheet,
    "Totals"
  );

  downloadWorkbook(
    workbook,
    createDownloadName(
      "BACE-Sadhana-Monthly",
      monthKey
    )
  );
}


/*
 * MONTHLY ATTENDANCE EXPORT
 *
 * Attendance is exported separately from the Monthly Sadhana report.
 * One row = one devotee with the complete month attendance calculation.
 * A second sheet keeps the day-by-day attendance status so the admin can
 * audit exactly how each monthly total was calculated.
 */
function exportMonthlyAttendanceExcel({
  monthKey,
  reportDevotees,
  records,
  trackingStartDate,
}) {
  const monthDates = getReportDays(
    monthKey,
    trackingStartDate
  );

  if (!monthDates.length) {
    throw new Error(
      "No reportable dates are available for attendance export."
    );
  }

  /*
   * ATTENDANCE EXPORT
   *
   * The export uses the exact same live report date range and records
   * used by Monthly Performance.
   *
   * Current month:
   *   tracking start date -> today
   * Completed month:
   *   first day -> last day of that calendar month
   *
   * The first Excel sheet is intentionally ONLY the attendance table
   * requested by the admin. No Overview sheet is placed before it.
   */
  const reportDateSet = new Set(monthDates);

  const monthRecords = records.filter((record) =>
    reportDateSet.has(String(record.date || ""))
  );

  // One live record per devotee/date so duplicate documents cannot
  // inflate the monthly attendance numbers.
  const recordMap = new Map();

  monthRecords.forEach((record) => {
    const devoteeId = String(record.devoteeId || "");
    const date = String(record.date || "");

    if (!devoteeId || !reportDateSet.has(date)) {
      return;
    }

    recordMap.set(`${devoteeId}_${date}`, record);
  });

  /*
   * THIS IS THE MAIN ATTENDANCE EXPORT TABLE.
   *
   * Keep these columns exactly as requested by the admin.
   */
  const attendanceRows = reportDevotees.map((devotee) => {
    const devoteeRecords = monthDates
      .map((date) =>
        recordMap.get(`${devotee.uid}_${date}`)
      )
      .filter(Boolean);

    const mangalArti = calculateAttendanceStats(
      devoteeRecords,
      "mangalArti"
    );

    const morningClass = calculateAttendanceStats(
      devoteeRecords,
      "morningClass"
    );

    const eveningClass = calculateAttendanceStats(
      devoteeRecords,
      "eveningClass"
    );

    const overall = calculateCombinedAttendanceStats(
      devoteeRecords
    );

    const submission = calculateSubmissionStats(
      monthDates,
      devoteeRecords
    );

    return {
      "Devotee Name": getDisplayName(devotee),
      "Days Covered": monthDates.length,
      "Sadhana Submitted": submission.submitted,
      "Sadhana Missed": submission.notSubmitted,
      "M.A. Present": mangalArti.present,
      "M.A. Late": mangalArti.late,
      "M.A. Absent": mangalArti.absent,
      "M.A. %": `${mangalArti.percentage}%`,
      "M. Class Present": morningClass.present,
      "M. Class Late": morningClass.late,
      "M. Class Absent": morningClass.absent,
      "M. Class %": `${morningClass.percentage}%`,
      "E. Class Present": eveningClass.present,
      "E. Class Late": eveningClass.late,
      "E. Class Absent": eveningClass.absent,
      "E. Class %": `${eveningClass.percentage}%`,
      "Overall %": `${overall.percentage}%`,
    };
  });

  /*
   * SECOND SHEET: DAY-BY-DAY ATTENDANCE
   *
   * This is only for verification. It contains every reportable date
   * through today for the current month, or every date for a completed
   * month, and one row per devotee/date.
   */
  const dailyAttendanceRows = [];

  for (const date of monthDates) {
    for (const devotee of reportDevotees) {
      const record = recordMap.get(
        `${devotee.uid}_${date}`
      );

      dailyAttendanceRows.push({
        Date: formatDate(date),
        "Date (ISO)": date,
        "Devotee Name": getDisplayName(devotee),
        "Sadhana Submitted": record ? "Yes" : "No",
        "M.A.": record
          ? statusShort(record.mangalArti)
          : "—",
        "M. Class": record
          ? statusShort(record.morningClass)
          : "—",
        "E. Program Report":
          record?.eveningProgramReport || "",
        "E. Class": record
          ? statusShort(record.eveningClass)
          : "—",
      });
    }
  }

  const workbook = XLSX.utils.book_new();

  // FIRST SHEET = the exact attendance summary requested by admin.
  const attendanceSheet = XLSX.utils.json_to_sheet(
    attendanceRows,
    {
      header: [
        "Devotee Name",
        "Days Covered",
        "Sadhana Submitted",
        "Sadhana Missed",
        "M.A. Present",
        "M.A. Late",
        "M.A. Absent",
        "M.A. %",
        "M. Class Present",
        "M. Class Late",
        "M. Class Absent",
        "M. Class %",
        "E. Class Present",
        "E. Class Late",
        "E. Class Absent",
        "E. Class %",
        "Overall %",
      ],
    }
  );

  const dailySheet = XLSX.utils.json_to_sheet(
    dailyAttendanceRows,
    {
      header: [
        "Date",
        "Date (ISO)",
        "Devotee Name",
        "Sadhana Submitted",
        "M.A.",
        "M. Class",
        "E. Program Report",
        "E. Class",
      ],
    }
  );

  attendanceSheet["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 20 },
    { wch: 16 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
  ];

  dailySheet["!cols"] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
    { wch: 20 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    attendanceSheet,
    "Attendance"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    dailySheet,
    "Daily Attendance"
  );

  downloadWorkbook(
    workbook,
    createDownloadName(
      "BACE-Attendance",
      monthKey
    )
  );
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
  const [reportRecords, setReportRecords] =
    useState([]);

  /*
   * Existing `records` powers the current daily
   * admin screen and devotee screen.
   */
  const [selectedDate, setSelectedDate] =
    useState(getToday());

  const [reportMonth, setReportMonth] =
    useState(getMonthKey(getToday()));


  const lastAutomaticMonth = useRef(
    getCurrentMonthKey()
  );

  // When the calendar moves into a new month, automatically move the
  // report selector to that new current month if the admin was viewing
  // the previous current month. Manually selected past months stay
  // selectable/exportable and are never overwritten.
  useEffect(() => {
    const syncCurrentMonth = () => {
      const currentMonth = getCurrentMonthKey();

      if (
        currentMonth ===
        lastAutomaticMonth.current
      ) {
        return;
      }

      setReportMonth((previousMonth) => {
        if (
          previousMonth ===
          lastAutomaticMonth.current
        ) {
          return currentMonth;
        }

        return previousMonth;
      });

      lastAutomaticMonth.current =
        currentMonth;
    };

    syncCurrentMonth();

    const intervalId = window.setInterval(
      syncCurrentMonth,
      60 * 1000
    );

    return () =>
      window.clearInterval(intervalId);
  }, []);

  const [ownRecord, setOwnRecord] =
    useState(null);

  const [form, setForm] =
    useState(EMPTY_FORM);

  const [loading, setLoading] =
    useState(true);

  const [reportLoading, setReportLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [exporting, setExporting] =
    useState(false);

  const [trackingStartDate, setTrackingStartDate] =
    useState(getToday());

  const [refreshNonce, setRefreshNonce] =
    useState(0);

  const todayDate = getToday();

  useEffect(() => {
    if (
      !isAdministrator ||
      !user?.uid
    ) {
      return undefined;
    }

    let cancelled = false;

    const settingsRef = doc(
      db,
      "settings",
      "general"
    );

    const unsubscribe = onSnapshot(
      settingsRef,
      async (settingsSnapshot) => {
        if (cancelled) return;

        if (
          settingsSnapshot.exists() &&
          settingsSnapshot.data()
            .trackingStartDate
        ) {
          setTrackingStartDate(
            String(
              settingsSnapshot.data()
                .trackingStartDate
            )
          );

          return;
        }

        const launchDate = getToday();

        try {
          await setDoc(
            settingsRef,
            {
              trackingStartDate: launchDate,
              updatedAt:
                serverTimestamp(),
              updatedBy: user.uid,
            },
            { merge: true }
          );

          if (!cancelled) {
            setTrackingStartDate(
              launchDate
            );
          }
        } catch (settingsError) {
          console.error(
            "Failed to save Sadhana tracking start date:",
            settingsError
          );

          if (!cancelled) {
            setTrackingStartDate(
              getToday()
            );
          }
        }
      },
      (settingsError) => {
        console.error(
          "Failed to load Sadhana tracking start date:",
          settingsError
        );

        if (!cancelled) {
          setTrackingStartDate(
            getToday()
          );
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isAdministrator, user?.uid]);

  const isToday =
    selectedDate === todayDate;

  const isPastDate =
    selectedDate < todayDate;

  const isFutureDate =
    selectedDate > todayDate;

  const canEditToday =
    isDevotee &&
    !!user?.uid &&
    isToday;

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
        const devoteeData =
          snapshot.docs.map(
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

        setError(
          firebaseError.code ===
            "permission-denied"
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
          normalizeStatus(
            devotee.status || "active"
          ) === "active"
      ),
    [devotees]
  );

  const reportDevotees = useMemo(() => {
    if (
      reportMonth ===
      getCurrentMonthKey()
    ) {
      return activeDevotees;
    }

    return devotees.filter(
      (devotee) =>
        normalizeStatus(
          devotee.status
        ) !== "deleted"
    );
  }, [
    devotees,
    activeDevotees,
    reportMonth,
  ]);

  const devoteeMap = useMemo(() => {
    const map = {};

    activeDevotees.forEach(
      (devotee) => {
        map[devotee.uid] = devotee;
      }
    );

    return map;
  }, [activeDevotees]);

  useEffect(() => {
    if (!user?.uid) {
      setRecords([]);
      setLoading(false);

      return undefined;
    }

    setLoading(true);
    setError("");

    let cancelled = false;

    if (isAdministrator) {
      const dailyQuery = query(
        collection(db, "sadhana"),
        where("date", "==", selectedDate)
      );

      const unsubscribe = onSnapshot(
        dailyQuery,
        (snapshot) => {
          if (cancelled) return;

          setRecords(
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            )
          );

          setLoading(false);
        },
        (firebaseError) => {
          if (cancelled) return;

          console.error(
            "Failed to load daily Sadhana records:",
            firebaseError
          );

          setRecords([]);
          setLoading(false);

          setError(
            firebaseError.code ===
              "permission-denied"
              ? "Firebase permission denied while loading daily Sadhana records."
              : "Unable to load daily Sadhana records. Please try again."
          );
        }
      );

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    const ownQuery = query(
      collection(db, "sadhana"),
      where(
        "devoteeId",
        "==",
        user.uid
      )
    );

    const unsubscribe = onSnapshot(
      ownQuery,
      (snapshot) => {
        if (cancelled) return;

        setRecords(
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          )
        );

        setLoading(false);
      },
      (firebaseError) => {
        if (cancelled) return;

        console.error(
          "Failed to load your Sadhana records:",
          firebaseError
        );

        setRecords([]);
        setLoading(false);

        setError(
          firebaseError.code ===
            "permission-denied"
            ? "Firebase permission denied while loading your Sadhana records."
            : "Unable to load your Sadhana records. Please try again."
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    user?.uid,
    isAdministrator,
    selectedDate,
    refreshNonce,
  ]);

  useEffect(() => {
    if (
      !isAdministrator ||
      !reportMonth ||
      !trackingStartDate
    ) {
      setReportRecords([]);
      setReportLoading(false);

      return undefined;
    }

    const reportDaysForQuery =
      getReportDays(
        reportMonth,
        trackingStartDate
      );

    if (!reportDaysForQuery.length) {
      setReportRecords([]);
      setReportLoading(false);

      return undefined;
    }

    let cancelled = false;

    const startDate =
      reportDaysForQuery[0];

    const endDate =
      reportDaysForQuery[
        reportDaysForQuery.length - 1
      ];

    const reportQuery = query(
      collection(db, "sadhana"),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );

    setReportLoading(true);

    const unsubscribe = onSnapshot(
      reportQuery,
      (snapshot) => {
        if (cancelled) return;

        setReportRecords(
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          )
        );

        setReportLoading(false);
      },
      (firebaseError) => {
        if (cancelled) return;

        console.error(
          "Failed to load monthly Sadhana report data:",
          firebaseError
        );

        setReportRecords([]);
        setReportLoading(false);

        setError(
          firebaseError.code ===
            "permission-denied"
            ? "Firebase permission denied while loading the monthly report."
            : "Unable to load monthly report data. Please try again."
        );
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    isAdministrator,
    reportMonth,
    trackingStartDate,
    refreshNonce,
  ]);

  const validRecords = useMemo(() => {
    if (!isAdministrator) {
      return records.filter(
        (record) =>
          record.devoteeId ===
          user?.uid
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

  useEffect(() => {
    if (
      !isDevotee ||
      !user?.uid
    ) {
      setOwnRecord(null);
      return;
    }

    setOwnRecord(
      validRecords.find(
        (item) =>
          item.devoteeId ===
            user.uid &&
          item.date === selectedDate
      ) || null
    );
  }, [
    isDevotee,
    user?.uid,
    selectedDate,
    validRecords,
  ]);

  useEffect(() => {
    if (!isDevotee) return;

    if (ownRecord) {
      setForm({
        toBed:
          ownRecord.toBed || "",

        wakeUp:
          ownRecord.wakeUp || "",

        dayRest:
          toNumber(
            ownRecord.dayRest
          ),

        morningProgramReport:
          ownRecord.morningProgramReport ||
          "",

        eveningProgramReport:
          ownRecord.eveningProgramReport ||
          "",

        rounds:
          toNumber(
            ownRecord.rounds
          ),

        mangalArti:
          ownRecord.mangalArti ||
          "",

        morningClass:
          ownRecord.morningClass ||
          "",

        eveningClass:
          ownRecord.eveningClass ||
          "",

        adhyyanBookTopic:
          ownRecord.adhyyanBookTopic ||
          "",

        adhyyanTime:
          ownRecord.adhyyanTime ||
          "",

        shravanSpeakerTopic:
          ownRecord.shravanSpeakerTopic ||
          "",

        shravanTime:
          ownRecord.shravanTime ||
          "",

        sevaDescription:
          ownRecord.sevaDescription ||
          "",

        sevaTime:
          ownRecord.sevaTime ||
          "",

        yogaExercise:
          toNumber(
            ownRecord.yogaExercise
          ),

        collegeWork:
          toNumber(
            ownRecord.collegeWork
          ),

        studyXWork:
          toNumber(
            ownRecord.studyXWork
          ),

        reason:
          ownRecord.reason || "",

        reading:
          toNumber(
            ownRecord.reading
          ),

        meditation:
          toNumber(
            ownRecord.meditation
          ),

        notes:
          ownRecord.notes || "",
      });
    } else {
      setForm({
        ...EMPTY_FORM,
      });
    }

    setError("");
    setSuccess("");
  }, [
    ownRecord,
    isDevotee,
    selectedDate,
  ]);

  const handleChange = (event) => {
    if (!canEditToday) return;

    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,

      [name]:
        NUMBER_FIELDS.includes(
          name
        )
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

          toBed:
            safeText(form.toBed),

          wakeUp:
            safeText(form.wakeUp),

          dayRest:
            toNumber(form.dayRest),

          morningProgramReport:
            safeText(
              form.morningProgramReport
            ),

          eveningProgramReport:
            safeText(
              form.eveningProgramReport
            ),

          rounds:
            toNumber(form.rounds),

          /*
           * Existing values remain:
           * present / absent
           *
           * New value:
           * late
           */
          mangalArti:
            safeText(form.mangalArti),

          morningClass:
            safeText(form.morningClass),

          eveningClass:
            safeText(form.eveningClass),

          adhyyanBookTopic:
            safeText(
              form.adhyyanBookTopic
            ),

          adhyyanTime:
            safeText(
              form.adhyyanTime
            ),

          shravanSpeakerTopic:
            safeText(
              form.shravanSpeakerTopic
            ),

          shravanTime:
            safeText(
              form.shravanTime
            ),

          sevaDescription:
            safeText(
              form.sevaDescription
            ),

          sevaTime:
            safeText(
              form.sevaTime
            ),

          yogaExercise:
            toNumber(
              form.yogaExercise
            ),

          collegeWork:
            toNumber(
              form.collegeWork
            ),

          studyXWork:
            toNumber(
              form.studyXWork
            ),

          reason:
            safeText(form.reason),

          reading:
            toNumber(
              form.reading
            ),

          meditation:
            toNumber(
              form.meditation
            ),

          notes:
            safeText(form.notes),

          updatedAt:
            serverTimestamp(),

          createdAt:
            ownRecord?.createdAt ||
            serverTimestamp(),
        },
        { merge: true }
      );

      setSuccess(
        "Today's Sadhana record has been saved."
      );
    } catch (firebaseError) {
      console.error(
        "Failed to save Sadhana:",
        firebaseError
      );

      setError(
        firebaseError.code ===
          "permission-denied"
          ? "Firebase permission denied. Please check the Sadhana Firestore rules."
          : "Unable to save today's Sadhana. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const recordsForDate = useMemo(
    () =>
      validRecords.filter(
        (record) =>
          record.date ===
          selectedDate
      ),
    [
      validRecords,
      selectedDate,
    ]
  );

  const totalRounds =
    recordsForDate.reduce(
      (total, record) =>
        total +
        toNumber(record.rounds),
      0
    );

  const practiceRecorded =
    recordsForDate.filter(
      (record) =>
        toNumber(record.rounds) > 0
    ).length;

  const averageRounds =
    practiceRecorded > 0
      ? Math.round(
          (totalRounds /
            practiceRecorded) *
            10
        ) / 10
      : 0;

  const completedMonth =
    isCompletedMonth(reportMonth);

  const selectedReportRecords =
    useMemo(
      () =>
        reportRecords.filter(
          (record) =>
            String(
              record.date || ""
            ).startsWith(
              `${reportMonth}-`
            )
        ),
      [
        reportRecords,
        reportMonth,
      ]
    );

  const reportRecordMap =
    useMemo(
      () =>
        new Map(
          selectedReportRecords.map(
            (record) => [
              `${record.devoteeId}_${record.date}`,
              record,
            ]
          )
        ),
      [selectedReportRecords]
    );

  const reportDays = useMemo(
    () =>
      getReportDays(
        reportMonth,
        trackingStartDate
      ),
    [
      reportMonth,
      trackingStartDate,
    ]
  );

  const reportIsFutureMonth =
    reportMonth >
    getCurrentMonthKey();

  const reportSubmitted =
    reportDays.reduce(
      (total, date) =>
        total +
        reportDevotees.filter(
          (devotee) =>
            reportRecordMap.has(
              `${devotee.uid}_${date}`
            )
        ).length,
      0
    );

  const reportPossible =
    reportDays.length *
    reportDevotees.length;

  const reportNotSubmitted =
    Math.max(
      0,
      reportPossible -
        reportSubmitted
    );

  const reportCompletion =
    reportPossible > 0
      ? Math.round(
          (reportSubmitted /
            reportPossible) *
            100
        )
      : 0;

  /*
   * Monthly performance data for admin.
   *
   * This is calculated from the same live reportRecords
   * used by Excel, so the UI and Excel stay consistent.
   */
  const monthlyPerformance =
    useMemo(() => {
      return reportDevotees.map(
        (devotee) => {
          const devoteeRecords =
            reportDays
              .map((date) =>
                reportRecordMap.get(
                  `${devotee.uid}_${date}`
                )
              )
              .filter(Boolean);

          const submissionStats =
            calculateSubmissionStats(
              reportDays,
              devoteeRecords
            );

          const mangalArtiStats =
            calculateAttendanceStats(
              devoteeRecords,
              "mangalArti"
            );

          const morningClassStats =
            calculateAttendanceStats(
              devoteeRecords,
              "morningClass"
            );

          const eveningClassStats =
            calculateAttendanceStats(
              devoteeRecords,
              "eveningClass"
            );

          const combinedStats =
            calculateCombinedAttendanceStats(
              devoteeRecords
            );

          const rounds =
            devoteeRecords.reduce(
              (total, record) =>
                total +
                toNumber(record.rounds),
              0
            );

          const averageRounds =
            devoteeRecords.length >
            0
              ? Math.round(
                  (rounds /
                    devoteeRecords.length) *
                    10
                ) / 10
              : 0;

          return {
            uid: devotee.uid,
            name:
              getDisplayName(
                devotee
              ),
            email:
              devotee.email ||
              "",
            department:
              devotee.department ||
              "",

            submitted:
              submissionStats.submitted,

            submissionPercentage:
              submissionStats.percentage,

            mangalArti:
              mangalArtiStats,

            morningClass:
              morningClassStats,

            eveningClass:
              eveningClassStats,

            overallAttendance:
              combinedStats.percentage,

            rounds,
            averageRounds,
          };
        }
      );
    }, [
      reportDevotees,
      reportDays,
      reportRecordMap,
    ]);

  const handleDailyExport =
    () => {
      if (isFutureDate) {
        setError(
          "Daily reports are available only through today."
        );
        return;
      }

      try {
        setExporting(true);

        exportDailyExcel({
          selectedDate,
          reportDevotees,
          records,
        });

        setSuccess(
          `Daily Excel report downloaded for ${formatDate(
            selectedDate
          )}.`
        );
      } catch (exportError) {
        console.error(
          "Failed to export daily Sadhana report:",
          exportError
        );

        setError(
          "Unable to create the Excel report. Please try again."
        );
      } finally {
        setExporting(false);
      }
    };


  const handleMonthlyAttendanceExport =
    () => {
      try {
        setExporting(true);

        exportMonthlyAttendanceExcel({
          monthKey: reportMonth,
          reportDevotees,
          records: reportRecords,
          trackingStartDate,
        });

        setSuccess(
          `${formatMonthYear(
            `${reportMonth}-01`
          )} attendance Excel report downloaded.`
        );
      } catch (exportError) {
        console.error(
          "Failed to export monthly attendance report:",
          exportError
        );

        setError(
          "Unable to create the monthly attendance Excel report. Please try again."
        );
      } finally {
        setExporting(false);
      }
    };

  const handleMonthlyExport =
    () => {
      if (!completedMonth) {
        setError(
          reportIsFutureMonth
            ? "Monthly export is available only for completed months."
            : "Monthly export becomes available after the selected month is complete."
        );
        return;
      }

      try {
        setExporting(true);

        exportMonthlyExcel({
          monthKey: reportMonth,
          reportDevotees,
          records:
            reportRecords,
          trackingStartDate,
        });

        setSuccess(
          `${formatMonthYear(
            `${reportMonth}-01`
          )} Excel report downloaded.`
        );
      } catch (exportError) {
        console.error(
          "Failed to export monthly Sadhana report:",
          exportError
        );

        setError(
          "Unable to create the monthly Excel report. Please try again."
        );
      } finally {
        setExporting(false);
      }
    };

  if (authLoading || loading) {
    return (
      <Loader text="Loading Sadhana..." />
    );
  }

  if (isDevotee) {
    const history = [
      ...validRecords,
    ].sort((a, b) =>
      String(
        b.date || ""
      ).localeCompare(
        String(a.date || "")
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
              Record your daily practice
              in a simple step-by-step
              format.
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

        <section className="sadhana-devotee-guide">
          <div className="sadhana-guide-heading">
            <div className="sadhana-guide-icon">
              ?
            </div>

            <div>
              <strong>
                How to complete today's
                card
              </strong>

              <p>
                Fill what applies to you.
                Use the short descriptions
                below instead of guessing
                what a field means.
              </p>
            </div>
          </div>

          <div className="sadhana-guide-grid">
            <div>
              <span>01</span>
              <strong>
                Sleep &amp; rest
              </strong>
              <small>
                Bedtime, wake-up and
                daytime rest.
              </small>
            </div>

            <div>
              <span>02</span>
              <strong>
                Morning program
              </strong>
              <small>
                M.P. report time, Japa,
                Mangal Arti and class.
              </small>
            </div>

            <div>
              <span>03</span>
              <strong>
                Evening program
              </strong>
              <small>
                E.P. report time and class
                attendance.
              </small>
            </div>

            <div>
              <span>04</span>
              <strong>
                Adhyayan
              </strong>
              <small>
                Book or topic studied and
                time spent.
              </small>
            </div>

            <div>
              <span>05</span>
              <strong>
                Shravan
              </strong>
              <small>
                Speaker or topic heard
                and time spent.
              </small>
            </div>

            <div>
              <span>06</span>
              <strong>
                Seva
              </strong>
              <small>
                Service performed and
                time spent.
              </small>
            </div>

            <div>
              <span>07</span>
              <strong>
                Work-life
              </strong>
              <small>
                Exercise, college/work
                and study hours.
              </small>
            </div>

            <div>
              <span>08</span>
              <strong>
                Daily reflection
              </strong>
              <small>
                Record a reason when needed.
              </small>
            </div>
          </div>
        </section>

        <section className="sadhana-card sadhana-card-sheet">
          <div className="sadhana-sheet-heading">
            <div>
              <strong>
                SADHANA CARD
              </strong>

              <span>
                - for the pleasure of Sri
                Guru &amp; Gauranga
              </span>
            </div>

            <small>
              Today's card is editable.
              Previous days can be viewed
              but not changed.
            </small>
          </div>

          <div className="sadhana-verse">
            युक्ताहारविहारस्य युक्तचेष्टस्य कर्मसु।
            युक्तस्वप्नावबोधस्य योगो भवति दुःखहा ॥
            <span>Bg. 6.17</span>
          </div>

          <div className="sadhana-motto">
            I WOULD PREFER EVEN TO FAIL
            WITH HONOR THAN TO WIN BY
            CHEATING.
          </div>

          <div className="sadhana-identity-row">
            <label>
              <span>Name</span>

              <strong>
                {user?.name ||
                  user?.email ||
                  "Devotee"}
              </strong>
            </label>

            <label>
              <span>
                Month-Year
              </span>

              <strong>
                {formatMonthYear(
                  selectedDate
                )}
              </strong>
            </label>
          </div>

          <div className="sadhana-mobile-note">
            <strong>
              Mobile filling:
            </strong>{" "}
            Fill each section one by one. All fields below use the same saved Sadhana record as the desktop form.
          </div>

          <div className="sadhana-sheet-scroll">
            <table className="sadhana-sheet-table">
              <thead>
                <tr>
                  <th rowSpan="2">
                    Date
                  </th>

                  <th colSpan="3">
                    NIDRA
                  </th>

                  <th colSpan="4">
                    MORNING PROGRAM
                  </th>

                  <th colSpan="2">
                    EVENING PROGRAM
                  </th>

                  <th colSpan="2">
                    ADHYAYAN
                  </th>

                  <th colSpan="2">
                    SHRAVAN
                  </th>

                  <th colSpan="2">
                    SEVA
                  </th>

                  <th colSpan="3">
                    WORK-LIFE
                  </th>

                  <th rowSpan="2">
                    Reason
                    <br />
                    (If any)
                  </th>
                </tr>

                <tr>
                  <th>
                    To Bed
                  </th>

                  <th>
                    Wake Up
                  </th>

                  <th>
                    Day Rest
                  </th>

                  <th>
                    M.P. Report
                  </th>

                  <th>
                    Japa
                  </th>

                  <th>
                    M.A.
                  </th>

                  <th>
                    M. Class
                  </th>

                  <th>
                    E.P. Report
                  </th>

                  <th>
                    E. Class
                  </th>

                  <th>
                    Book / Topic
                  </th>

                  <th>
                    Time
                  </th>

                  <th>
                    Speaker / Topic
                  </th>

                  <th>
                    Time
                  </th>

                  <th>
                    Seva
                  </th>

                  <th>
                    Time
                  </th>

                  <th>
                    Yoga / Exercise
                    <br />
                    (min)
                  </th>

                  <th>
                    College / Work
                    <br />
                    (hrs)
                  </th>

                  <th>
                    Study / X-Work
                    <br />
                    (hrs)
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>
                    {formatDate(
                      selectedDate
                    )}
                  </td>

                  <td>
                    <input
                      type="time"
                      name="toBed"
                      value={
                        form.toBed
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="time"
                      name="wakeUp"
                      value={
                        form.wakeUp
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      name="dayRest"
                      value={
                        form.dayRest
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="time"
                      name="morningProgramReport"
                      value={
                        form.morningProgramReport
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      name="rounds"
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
                  </td>

                  <td>
                    <AttendanceSelect
                      name="mangalArti"
                      value={
                        form.mangalArti
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <AttendanceSelect
                      name="morningClass"
                      value={
                        form.morningClass
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="time"
                      name="eveningProgramReport"
                      value={
                        form.eveningProgramReport
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <AttendanceSelect
                      name="eveningClass"
                      value={
                        form.eveningClass
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="adhyyanBookTopic"
                      value={
                        form.adhyyanBookTopic
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                      placeholder="Book / topic"
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="adhyyanTime"
                      value={
                        form.adhyyanTime
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                      placeholder="Time"
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="shravanSpeakerTopic"
                      value={
                        form.shravanSpeakerTopic
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                      placeholder="Speaker / topic"
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="shravanTime"
                      value={
                        form.shravanTime
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                      placeholder="Time"
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="sevaDescription"
                      value={
                        form.sevaDescription
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                      placeholder="Seva"
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="sevaTime"
                      value={
                        form.sevaTime
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                      placeholder="Time"
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      name="yogaExercise"
                      value={
                        form.yogaExercise
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      name="collegeWork"
                      value={
                        form.collegeWork
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      name="studyXWork"
                      value={
                        form.studyXWork
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      name="reason"
                      value={
                        form.reason
                      }
                      onChange={
                        handleChange
                      }
                      disabled={
                        !canEditToday
                      }
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
                value={
                  form.toBed
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Wake up"
                hint="When you woke up"
                type="time"
                name="wakeUp"
                value={
                  form.wakeUp
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Day rest"
                hint="Hours, e.g. 0.5"
                type="number"
                min="0"
                step="0.5"
                name="dayRest"
                value={
                  form.dayRest
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
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
                value={
                  form.morningProgramReport
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Japa rounds"
                hint="Number of rounds"
                type="number"
                min="0"
                name="rounds"
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

              <MobileAttendanceSelect
                label="Mangal Arti"
                name="mangalArti"
                value={
                  form.mangalArti
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileAttendanceSelect
                label="Morning class"
                name="morningClass"
                value={
                  form.morningClass
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="03 · Evening Program"
              description="Enter your evening report time and class attendance."
            >
              <MobileField
                label="E.P. Report time"
                hint="Your evening program report time"
                type="time"
                name="eveningProgramReport"
                value={
                  form.eveningProgramReport
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileAttendanceSelect
                label="Evening class"
                name="eveningClass"
                value={
                  form.eveningClass
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="04 · Adhyayan"
              description="Record what you studied and how long."
            >
              <MobileField
                label="Book / topic"
                hint="What did you study?"
                name="adhyyanBookTopic"
                value={
                  form.adhyyanBookTopic
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Study time"
                hint="How long?"
                name="adhyyanTime"
                value={
                  form.adhyyanTime
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="05 · Shravan"
              description="Record the speaker or topic you heard."
            >
              <MobileField
                label="Speaker / topic"
                hint="Who or what did you hear?"
                name="shravanSpeakerTopic"
                value={
                  form.shravanSpeakerTopic
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Hearing time"
                hint="How long?"
                name="shravanTime"
                value={
                  form.shravanTime
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="06 · Seva"
              description="Record the service you performed."
            >
              <MobileField
                label="Seva description"
                hint="What service did you do?"
                name="sevaDescription"
                value={
                  form.sevaDescription
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Seva time"
                hint="How long?"
                name="sevaTime"
                value={
                  form.sevaTime
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="07 · Work-Life"
              description="Use minutes for exercise and hours for work or study."
            >
              <MobileField
                label="Yoga / exercise (min)"
                hint="Minutes, e.g. 30"
                type="number"
                min="0"
                step="5"
                name="yogaExercise"
                value={
                  form.yogaExercise
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="College / work (hrs)"
                hint="Hours, e.g. 8"
                type="number"
                min="0"
                step="0.5"
                name="collegeWork"
                value={
                  form.collegeWork
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />

              <MobileField
                label="Study / X-Work (hrs)"
                hint="Hours, e.g. 2"
                type="number"
                min="0"
                step="0.5"
                name="studyXWork"
                value={
                  form.studyXWork
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>

            <MobileFieldSection
              title="08 · Reflection"
              description="Add anything useful for your daily record."
            >
              <MobileField
                label="Reason, if any"
                hint="Optional"
                name="reason"
                value={
                  form.reason
                }
                onChange={
                  handleChange
                }
                disabled={
                  !canEditToday
                }
              />
            </MobileFieldSection>
          </div>

          <div className="sadhana-sheet-footer">
            <span>
              P = Present
            </span>

            <span>
              L = Late
            </span>

            <span>
              A = Absent
            </span>

            <span>
              P + L = Attended
            </span>

            <span>
              Day Rest = hours
            </span>

            <span>
              Yoga / Exercise = minutes
            </span>

            <span>
              College / Work = hours
            </span>

            <span>
              X-Work = study / extra
              work hours
            </span>

            <span>
              Optional fields may be
              left blank
            </span>
          </div>

          <div className="sadhana-bottom-bar">
            <div className="sadhana-date-selector">
              <label>
                <span>
                  View another date
                </span>

                <small>
                  Past dates can be reviewed.
                </small>

                <input
                  type="date"
                  value={
                    selectedDate
                  }
                  max={todayDate}
                  onChange={(event) =>
                    setSelectedDate(
                      event.target.value
                    )
                  }
                />
              </label>
            </div>

            <div className="sadhana-bottom-status">
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
            </div>

            {canEditToday && (
              <div className="sadhana-form-actions">
                <button
                  type="button"
                  className="sadhana-primary-button"
                  onClick={
                    saveSadhana
                  }
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Saving..."
                    : ownRecord
                      ? "Update Today's Record"
                      : "Save Today's Record"}
                </button>
              </div>
            )}
          </div>
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

              <p>
                Select a previous date to
                review your submitted
                record.
              </p>
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
                        {toNumber(
                          record.rounds
                        )}{" "}
                        Japa rounds
                      </span>
                    </div>

                    <div>
                      <span>
                        M.A.
                      </span>

                      <strong>
                        {statusShort(
                          record.mangalArti
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        M. Class
                      </span>

                      <strong>
                        {statusShort(
                          record.morningClass
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        E. Class
                      </span>

                      <strong>
                        {statusShort(
                          record.eveningClass
                        )}
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

  if (isAdministrator) {
    const selectedMonthLabel =
      formatMonthYear(
        `${reportMonth}-01`
      );

    return (
      <div className="sadhana-page">
        <header className="sadhana-header sadhana-admin-header">
          <div>
            <span className="sadhana-eyebrow">
              BACE COMMUNITY MONITORING
            </span>

            <h1>Sadhana</h1>

            <p>
              Monitor daily records,
              attendance markings and
              monthly completion across
              the devotee community.
            </p>
          </div>

          <button
            type="button"
            className="sadhana-secondary-button sadhana-refresh-button"
            onClick={() =>
              setRefreshNonce(
                (value) =>
                  value + 1
              )
            }
            disabled={loading}
          >
            {loading
              ? "Refreshing..."
              : "Refresh data"}
          </button>
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

        <section className="sadhana-stats">
          <article className="sadhana-stat">
            <span>Records</span>

            <strong>
              {
                recordsForDate.length
              }
            </strong>

            <small>
              Submitted for selected
              date
            </small>
          </article>

          <article className="sadhana-stat">
            <span>
              Active Devotees
            </span>

            <strong>
              {
                activeDevotees.length
              }
            </strong>

            <small>
              Current active accounts
            </small>
          </article>

          <article className="sadhana-stat">
            <span>
              Total Japa
            </span>

            <strong>
              {totalRounds}
            </strong>

            <small>
              Selected date
            </small>
          </article>

          <article className="sadhana-stat">
            <span>
              Submission Rate
            </span>

            <strong>
              {activeDevotees.length
                ? Math.round(
                    (recordsForDate.length /
                      activeDevotees.length) *
                      100
                  )
                : 0}
              %
            </strong>

            <small>
              Selected date
            </small>
          </article>
        </section>

        <section className="sadhana-toolbar sadhana-admin-toolbar">
          <label>
            <span>
              Daily view
            </span>

            <small>
              Choose a day to monitor.
            </small>

            <input
              type="date"
              value={
                selectedDate
              }
              max={todayDate}
              onChange={(event) =>
                setSelectedDate(
                  event.target.value
                )
              }
            />
          </label>

          <label className="sadhana-search">
            <span>
              Search devotee
            </span>

            <small>
              Name, email, phone or
              department
            </small>

            <input
              type="search"
              value={
                searchTerm
              }
              placeholder="Search..."
              onChange={(event) =>
                setSearchTerm(
                  event.target.value
                    .trim()
                    .toLowerCase()
                )
              }
            />
          </label>
        </section>

        <section className="sadhana-report-card">
          <div className="sadhana-report-heading">
            <div>
              <span className="sadhana-card-eyebrow">
                REPORTS &amp; EXPORT
              </span>

              <h2>
                Excel Reports
              </h2>

              <p>
                Monthly attendance and Sadhana
                reports follow the community
                tracking start date. The current
                month updates through today, and
                completed past months remain
                available for export.
              </p>
            </div>

            {completedMonth && reportDays.length ? (
              <span className="sadhana-complete-badge">
                Month completed
              </span>
            ) : reportIsFutureMonth || !reportDays.length ? (
              <span className="sadhana-progress-badge">
                {reportIsFutureMonth
                  ? "Future month"
                  : "Before tracking start"}
              </span>
            ) : (
              <span className="sadhana-progress-badge">
                Month in progress
              </span>
            )}
          </div>

          <div className="sadhana-report-controls">
            <label>
              <span>
                Report month
              </span>

              <small>
                {selectedMonthLabel}
                {completedMonth
                  ? " · Completed month"
                  : reportIsFutureMonth
                    ? " · Future month"
                    : " · Current month (through today)"}
              </small>

              <input
                type="month"
                value={
                  reportMonth
                }
                max={
                  getCurrentMonthKey()
                }
                onChange={(event) =>
                  setReportMonth(
                    event.target.value
                  )
                }
              />
            </label>

            <div className="sadhana-report-actions">
              <button
                type="button"
                className="sadhana-secondary-button"
                onClick={
                  handleDailyExport
                }
                disabled={
                  exporting ||
                  isFutureDate
                }
              >
                {exporting
                  ? "Preparing..."
                  : "Export Daily Excel"}
              </button>

              <button
                type="button"
                className="sadhana-secondary-button"
                onClick={
                  handleMonthlyAttendanceExport
                }
                disabled={
                  exporting ||
                  reportLoading ||
                  !reportMonth ||
                  reportIsFutureMonth ||
                  !reportDays.length
                }
              >
                {exporting
                  ? "Preparing..."
                  : reportLoading
                    ? "Loading attendance..."
                    : reportIsFutureMonth
                      ? "No Attendance Report"
                      : "Export Attendance Excel"}
              </button>

              <button
                type="button"
                className="sadhana-primary-button"
                onClick={
                  handleMonthlyExport
                }
                disabled={
                  exporting ||
                  reportLoading ||
                  !reportMonth ||
                  !completedMonth ||
                  !reportDays.length
                }
              >
                {exporting
                  ? "Preparing..."
                  : reportLoading
                    ? "Loading report data..."
                    : !completedMonth
                      ? reportIsFutureMonth
                        ? "No Future Report"
                        : "Complete Month to Export"
                      : "Export Monthly Excel"}
              </button>
            </div>
          </div>

          <div className="sadhana-report-start">
            <span>
              Tracking started
            </span>

            <strong>
              {formatDate(
                trackingStartDate
              )}
            </strong>

            <small>
              This date controls Monthly
              reporting. Dates before the
              tracking start are excluded.
              The current month updates through
              today; completed past months
              remain available for export.
            </small>
          </div>

          <div className="sadhana-report-metrics">
            <div>
              <span>
                Days counted
              </span>

              <strong>
                {reportDays.length}
              </strong>
            </div>

            <div>
              <span>
                Devotees
              </span>

              <strong>
                {
                  reportDevotees.length
                }
              </strong>
            </div>

            <div>
              <span>
                Submitted
              </span>

              <strong>
                {reportSubmitted}
              </strong>
            </div>

            <div>
              <span>
                Not submitted
              </span>

              <strong>
                {
                  reportNotSubmitted
                }
              </strong>
            </div>

            <div>
              <span>
                Completion
              </span>

              <strong>
                {reportCompletion}%
              </strong>
            </div>
          </div>
        </section>

        {/* MONTHLY PERFORMANCE */}
        <MonthlyPerformanceTable
          performance={
            monthlyPerformance
          }
          monthLabel={
            selectedMonthLabel
          }
          searchTerm={
            searchTerm
          }
          loading={
            reportLoading
          }
        />

        <AdminSadhanaTable
          records={
            recordsForDate
          }
          devotees={
            activeDevotees
          }
          devoteeMap={
            devoteeMap
          }
          searchTerm={
            searchTerm
          }
          selectedDate={
            selectedDate
          }
        />
      </div>
    );
  }

  return null;
}

function AttendanceSelect({
  name,
  value,
  onChange,
  disabled,
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`sadhana-attendance-select sadhana-attendance-${normalizeStatus(
        value
      )}`}
    >
      <option value="">
        —
      </option>

      <option value="present">
        P
      </option>

      <option value="late">
        L
      </option>

      <option value="absent">
        A
      </option>
    </select>
  );
}

function MobileAttendanceSelect({
  label,
  name,
  value,
  onChange,
  disabled,
}) {
  return (
    <label className="sadhana-mobile-field">
      <span>
        {label}
      </span>

      <small>
        P = Present · L = Late · A =
        Absent
      </small>

      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`sadhana-attendance-select sadhana-attendance-${normalizeStatus(
          value
        )}`}
      >
        <option value="">
          Select
        </option>

        <option value="present">
          Present (P)
        </option>

        <option value="late">
          Late (L)
        </option>

        <option value="absent">
          Absent (A)
        </option>
      </select>
    </label>
  );
}

function MobileFieldSection({
  title,
  description,
  children,
}) {
  return (
    <section className="sadhana-mobile-section">
      <div className="sadhana-mobile-section-heading">
        <strong>
          {title}
        </strong>

        <span>
          {description}
        </span>
      </div>

      <div className="sadhana-mobile-grid">
        {children}
      </div>
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
      <span>
        {label}
      </span>

      <small>
        {hint}
      </small>

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

function MonthlyPerformanceTable({
  performance,
  monthLabel,
  searchTerm,
  loading,
}) {
  const filteredPerformance =
    useMemo(() => {
      if (!searchTerm) {
        return performance;
      }

      return performance.filter(
        (item) => {
          const searchable = [
            item.name,
            item.email,
            item.department,
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
      performance,
      searchTerm,
    ]);

  return (
    <section className="sadhana-card sadhana-performance-card">
      <div className="sadhana-card-header">
        <div>
          <span className="sadhana-card-eyebrow">
            MONTHLY PERFORMANCE
          </span>

          <h2>
            Devotee Attendance
            Performance
          </h2>

          <p>
            {monthLabel} · Late counts as
            attended. Blank attendance is
            not included in the attendance
            percentage.
          </p>
        </div>

        {loading && (
          <span className="sadhana-progress-badge">
            Updating...
          </span>
        )}
      </div>

      <div className="sadhana-performance-legend">
        <span>
          <strong>P</strong>{" "}
          Present
        </span>

        <span>
          <strong>L</strong>{" "}
          Late
        </span>

        <span>
          <strong>A</strong>{" "}
          Absent
        </span>

        <span>
          <strong>Overall %</strong>{" "}
          M.A. + Morning Class + Evening Class
        </span>
      </div>

      {filteredPerformance.length ===
      0 ? (
        <div className="sadhana-empty">
          <h3>
            No performance data
          </h3>

          <p>
            No devotee records match the
            selected month or search.
          </p>
        </div>
      ) : (
        <div className="sadhana-performance-scroll">
          <table className="sadhana-performance-table">
            <thead>
              <tr>
                <th>
                  Devotee Name
                </th>

                <th>
                  Sadhana
                </th>

                <th>
                  M.A.
                  <br />
                  P / L / A
                </th>

                <th>
                  M.A.
                  <br />
                  Attendance
                </th>

                <th>
                  M. Class
                  <br />
                  P / L / A
                </th>

                <th>
                  M. Class
                  <br />
                  Attendance
                </th>

                <th>
                  E. Class
                  <br />
                  P / L / A
                </th>

                <th>
                  E. Class
                  <br />
                  Attendance
                </th>

                <th>
                  Overall
                  <br />
                  Attendance
                </th>

                <th>
                  Japa
                  <br />
                  Avg.
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredPerformance.map(
                (student) => (
                  <tr
                    key={
                      student.uid
                    }
                  >
                    <td>
                      <div className="sadhana-performance-person">
                        <div className="sadhana-avatar">
                          {getInitials(
                            student.name
                          )}
                        </div>

                        <div>
                          <strong>
                            {
                              student.name
                            }
                          </strong>

                          <small>
                            {
                              student.department ||
                              student.email ||
                              "Devotee"
                            }
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong>
                        {
                          student.submissionPercentage
                        }%
                      </strong>

                      <small className="sadhana-performance-subtext">
                        {
                          student.submitted
                        }{" "}
                        submitted
                      </small>
                    </td>

                    <td>
                      <span className="sadhana-attendance-counts">
                        <b>
                          {
                            student
                              .mangalArti
                              .present
                          }
                        </b>
                        /
                        <b>
                          {
                            student
                              .mangalArti
                              .late
                          }
                        </b>
                        /
                        <b>
                          {
                            student
                              .mangalArti
                              .absent
                          }
                        </b>
                      </span>
                    </td>

                    <td>
                      <span className="sadhana-percentage-badge">
                        {
                          student
                            .mangalArti
                            .percentage
                        }%
                      </span>
                    </td>

                    <td>
                      <span className="sadhana-attendance-counts">
                        <b>
                          {
                            student
                              .morningClass
                              .present
                          }
                        </b>
                        /
                        <b>
                          {
                            student
                              .morningClass
                              .late
                          }
                        </b>
                        /
                        <b>
                          {
                            student
                              .morningClass
                              .absent
                          }
                        </b>
                      </span>
                    </td>

                    <td>
                      <span className="sadhana-percentage-badge">
                        {
                          student
                            .morningClass
                            .percentage
                        }%
                      </span>
                    </td>

                    <td>
                      <span className="sadhana-attendance-counts">
                        <b>
                          {
                            student
                              .eveningClass
                              .present
                          }
                        </b>
                        /
                        <b>
                          {
                            student
                              .eveningClass
                              .late
                          }
                        </b>
                        /
                        <b>
                          {
                            student
                              .eveningClass
                              .absent
                          }
                        </b>
                      </span>
                    </td>

                    <td>
                      <span className="sadhana-percentage-badge">
                        {
                          student
                            .eveningClass
                            .percentage
                        }%
                      </span>
                    </td>

                    <td>
                      <strong className="sadhana-overall-percentage">
                        {
                          student.overallAttendance
                        }%
                      </strong>
                    </td>

                    <td>
                      {
                        student.averageRounds
                      }
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="sadhana-performance-note">
        <strong>
          Attendance calculation:
        </strong>{" "}
        Present and Late are treated as
        attended. Attendance % =
        (Present + Late) ÷ (Present + Late
        + Absent) × 100. Days where no
        attendance was marked are excluded
        from that attendance denominator.
      </div>
    </section>
  );
}

function AdminSadhanaTable({
  records,
  devotees,
  devoteeMap,
  searchTerm,
  selectedDate,
}) {
  const recordMap =
    useMemo(
      () =>
        new Map(
          records.map(
            (record) => [
              `${record.devoteeId}_${record.date}`,
              record,
            ]
          )
        ),
      [records]
    );

  const filteredDevotees =
    useMemo(() => {
      if (!searchTerm)
        return devotees;

      return devotees.filter(
        (devotee) => {
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
      devotees,
      searchTerm,
    ]);

  if (
    filteredDevotees.length ===
    0
  ) {
    return (
      <section className="sadhana-card">
        <div className="sadhana-empty">
          <h3>
            No matching devotees
          </h3>

          <p>
            No active devotee matches
            the current search or no
            active devotees are available.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="sadhana-card sadhana-admin-table-card">
      <div className="sadhana-card-header">
        <div>
          <span className="sadhana-card-eyebrow">
            DAILY MONITORING
          </span>

          <h2>
            Community Sadhana
          </h2>

          <p>
            {formatDate(
              selectedDate
            )}{" "}
            · Daily submission status
          </p>
        </div>
      </div>

      <div className="sadhana-admin-summary">
        <div>
          <span>
            Submitted
          </span>

          <strong>
            {records.length}
          </strong>
        </div>

        <div>
          <span>
            Not submitted
          </span>

          <strong>
            {Math.max(
              0,
              filteredDevotees.length -
                records.length
            )}
          </strong>
        </div>

        <div>
          <span>
            Japa
          </span>

          <strong>
            {records.reduce(
              (sum, record) =>
                sum +
                toNumber(
                  record.rounds
                ),
              0
            )}
          </strong>
        </div>
      </div>

      <div className="sadhana-admin-mobile-list">
        {filteredDevotees.map(
          (devotee) => {
            const record =
              recordMap.get(
                `${devotee.uid}_${selectedDate}`
              );

            const name =
              getDisplayName(
                devotee
              );

            return (
              <article
                className="sadhana-admin-mobile-card"
                key={
                  devotee.uid
                }
              >
                <div className="sadhana-admin-person">
                  <div className="sadhana-avatar">
                    {getInitials(
                      name
                    )}
                  </div>

                  <div>
                    <strong>
                      {name}
                    </strong>

                    <small>
                      Daily Sadhana
                    </small>
                  </div>
                </div>

                <div
                  className={
                    record
                      ? "sadhana-submission-status submitted"
                      : "sadhana-submission-status missing"
                  }
                >
                  {record
                    ? "Submitted"
                    : "Not submitted"}
                </div>

                <div className="sadhana-admin-mobile-values">
                  <div>
                    <span>
                      To bed
                    </span>

                    <strong>
                      {record?.toBed || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Wake up
                    </span>

                    <strong>
                      {record?.wakeUp || "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Japa
                    </span>

                    <strong>
                      {record
                        ? toNumber(
                            record.rounds
                          )
                        : 0}
                    </strong>
                  </div>

                  <div>
                    <span>
                      M.A.
                    </span>

                    <strong
                      className={`sadhana-status-value sadhana-status-${normalizeStatus(
                        record?.mangalArti
                      )}`}
                    >
                      {record
                        ? statusShort(
                            record.mangalArti
                          )
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      M. Class
                    </span>

                    <strong
                      className={`sadhana-status-value sadhana-status-${normalizeStatus(
                        record?.morningClass
                      )}`}
                    >
                      {record
                        ? statusShort(
                            record.morningClass
                          )
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      E. Class
                    </span>

                    <strong
                      className={`sadhana-status-value sadhana-status-${normalizeStatus(
                        record?.eveningClass
                      )}`}
                    >
                      {record
                        ? statusShort(
                            record.eveningClass
                          )
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      M.P. Report
                    </span>

                    <strong>
                      {record?.morningProgramReport ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      E.P. Report
                    </span>

                    <strong>
                      {record?.eveningProgramReport ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Seva
                    </span>

                    <strong>
                      {record?.sevaDescription ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Work-Life
                    </span>

                    <strong>
                      {record
                        ? `${toNumber(
                            record.yogaExercise
                          )} min yoga · ${toNumber(
                            record.collegeWork
                          )} hrs work · ${toNumber(
                            record.studyXWork
                          )} hrs study`
                        : "—"}
                    </strong>
                  </div>
                </div>
              </article>
            );
          }
        )}
      </div>

      <div className="sadhana-table-wrapper sadhana-admin-desktop-table">
        <table className="sadhana-table">
          <thead>
            <tr>
              <th>
                Devotee
              </th>

              <th>
                Status
              </th>

              <th>
                To Bed
              </th>

              <th>
                Wake Up
              </th>

              <th>
                Japa
              </th>

              <th>
                M.A.
              </th>

              <th>
                M. Class
              </th>

              <th>
                E. Class
              </th>

              <th>
                M.P. Report
              </th>

              <th>
                E.P. Report
              </th>

              <th>
                Adhyayan
              </th>

              <th>
                Shravan
              </th>

              <th>
                Seva
              </th>

              <th>
                Work-Life
              </th>

              <th>
                Reason
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredDevotees.map(
              (devotee) => {
                const record =
                  recordMap.get(
                    `${devotee.uid}_${selectedDate}`
                  );

                const name =
                  getDisplayName(
                    devotee
                  );

                return (
                  <tr
                    key={
                      devotee.uid
                    }
                  >
                    <td>
                      <div className="sadhana-devotee">
                        <div className="sadhana-avatar">
                          {getInitials(
                            name
                          )}
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
                      <span
                        className={
                          record
                            ? "sadhana-submission-status submitted"
                            : "sadhana-submission-status missing"
                        }
                      >
                        {record
                          ? "Submitted"
                          : "Not submitted"}
                      </span>
                    </td>

                    <td>
                      {record?.toBed || "—"}
                    </td>

                    <td>
                      {record?.wakeUp || "—"}
                    </td>

                    <td>
                      <span className="sadhana-rounds">
                        {record
                          ? toNumber(
                              record.rounds
                            )
                          : 0}
                      </span>
                    </td>

                    <td>
                      {record ? (
                        <span
                          className={`sadhana-status-value sadhana-status-${normalizeStatus(
                            record.mangalArti
                          )}`}
                        >
                          {statusShort(
                            record.mangalArti
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      {record ? (
                        <span
                          className={`sadhana-status-value sadhana-status-${normalizeStatus(
                            record.morningClass
                          )}`}
                        >
                          {statusShort(
                            record.morningClass
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      {record ? (
                        <span
                          className={`sadhana-status-value sadhana-status-${normalizeStatus(
                            record.eveningClass
                          )}`}
                        >
                          {statusShort(
                            record.eveningClass
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      {record?.morningProgramReport ||
                        "—"}
                    </td>

                    <td>
                      {record?.eveningProgramReport ||
                        "—"}
                    </td>

                    <td>
                      {record?.adhyyanBookTopic ||
                        "—"}

                      {record?.adhyyanTime
                        ? ` · ${record.adhyyanTime}`
                        : ""}
                    </td>

                    <td>
                      {record?.shravanSpeakerTopic ||
                        "—"}

                      {record?.shravanTime
                        ? ` · ${record.shravanTime}`
                        : ""}
                    </td>

                    <td>
                      {record?.sevaDescription ||
                        "—"}

                      {record?.sevaTime
                        ? ` · ${record.sevaTime}`
                        : ""}
                    </td>

                    <td>
                      Yoga{" "}
                      {record
                        ? toNumber(
                            record.yogaExercise
                          )
                        : 0}{" "}
                      min · College/Work{" "}
                      {record
                        ? toNumber(
                            record.collegeWork
                          )
                        : 0}{" "}
                      hrs · Study/X-Work{" "}
                      {record
                        ? toNumber(
                            record.studyXWork
                          )
                        : 0}{" "}
                      hrs
                    </td>

                    <td>
                      {record?.reason ||
                        "—"}
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