// The arithmetic and the wording behind the Board KPI report, kept away
// from React and Supabase so it can be tested without either.
//
// BATCH5-MARKER kpi-lib-v2
//
// Everything here is a plain function of its arguments. Same input, same
// answer, every time. That matters more than usual because these numbers
// end up in a Board paper and in front of funders, and "it looked right
// on my phone" is not evidence of anything.
//
// Output shape is YCDI-PROG-003 Template 2, Section A:
// KPI | Q Target | Q Actual | YTD Target | YTD Actual | Variance | Status

// YCDI's financial year is the calendar year, and the Board's planning
// cycle in YCDI-GOV-002 is quartered the same way. These are the Board's
// own quarters, not an arbitrary split.
export const QUARTERS = [
  { id: 1, label: "Q1", months: "Jan to Mar", endMonth: 3 },
  { id: 2, label: "Q2", months: "Apr to Jun", endMonth: 6 },
  { id: 3, label: "Q3", months: "Jul to Sep", endMonth: 9 },
  { id: 4, label: "Q4", months: "Oct to Dec", endMonth: 12 },
];

function pad(n) {
  return String(n).padStart(2, "0");
}

// Day zero of the next month is the last day of this one. Gets February
// right in a leap year without anybody having to remember that it is one.
function lastDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function spec(quarter) {
  return QUARTERS.find((q) => q.id === Number(quarter)) || null;
}

export function quarterRange(year, quarter) {
  const q = spec(quarter);
  if (!q) return null;
  const startMonth = q.endMonth - 2;
  return {
    from: `${year}-${pad(startMonth)}-01`,
    to: `${year}-${pad(q.endMonth)}-${pad(lastDay(year, q.endMonth))}`,
  };
}

// Year to date runs from 1 January to the end of the quarter being
// reported, not to today. A Q2 paper written in August still covers
// January to June, or the figures stop agreeing with the narrative
// sitting next to them.
export function ytdRange(year, quarter) {
  const q = spec(quarter);
  if (!q) return null;
  return {
    from: `${year}-01-01`,
    to: `${year}-${pad(q.endMonth)}-${pad(lastDay(year, q.endMonth))}`,
  };
}

export function quarterOfDate(d) {
  const m = Number(String(d).slice(5, 7));
  if (!m || m < 1 || m > 12) return null;
  return Math.floor((m - 1) / 3) + 1;
}

export function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function quarterTarget(target, quarter, unit) {
  if (!target) return null;
  const q = numOrNull(target[`q${quarter}_target`]);
  if (q !== null) return q;
  // A standing percentage applies to every quarter whether or not
  // somebody typed it into all four boxes. A count does not, because
  // "twelve schools this year" is not "twelve schools this quarter".
  if (unit === "percent") return numOrNull(target.annual_target);
  return null;
}

// A percentage does not accumulate. If the standing target is 80% positive
// feedback then the year-to-date target is still 80%, not 320%. A count
// does accumulate: four quarters of ten schools is forty for the year.
// Getting this the wrong way round produces a Board paper where every
// percentage KPI looks catastrophic, which is the kind of mistake that
// only reveals itself once it is already on the table.
export function ytdTarget(target, quarter, unit) {
  if (!target) return null;
  if (unit === "percent") {
    for (let i = Number(quarter); i >= 1; i--) {
      const v = numOrNull(target[`q${i}_target`]);
      if (v !== null) return v;
    }
    return numOrNull(target.annual_target);
  }
  let sum = null;
  for (let i = 1; i <= Number(quarter); i++) {
    const v = numOrNull(target[`q${i}_target`]);
    if (v !== null) sum = (sum || 0) + v;
  }
  // With no quarterly split entered at all, fall back to the annual
  // figure only when the whole year is being reported. Showing a
  // full-year target beside one quarter's actual reads as a failure that
  // has not happened.
  if (sum === null && Number(quarter) === 4) return numOrNull(target.annual_target);
  return sum;
}

export function variance(actual, target) {
  const a = numOrNull(actual);
  const t = numOrNull(target);
  if (a === null || t === null) return null;
  return Math.round((a - t) * 10) / 10;
}

// Safeguarding is the one KPI with no room underneath it. The policy
// target is 100% resolved within 30 days, and 97% is not "nearly there",
// it is a case that sat open past the deadline. So it gets no amber band.
export const STRICT_KPIS = ["safeguarding_resolution"];

export const STATUS = {
  ON_TRACK: "On track",
  SLIGHTLY_BEHIND: "Slightly behind",
  BEHIND: "Behind",
  NOT_CAPTURED: "Not captured",
  NO_TARGET: "No target set",
  NO_DATA: "No data",
};

export function statusOf(kpiKey, snapshotStatus, actual, target) {
  if (snapshotStatus === "not_captured") return STATUS.NOT_CAPTURED;
  if (snapshotStatus === "secondary") return "";
  const t = numOrNull(target);
  if (t === null) return STATUS.NO_TARGET;
  const a = numOrNull(actual);
  if (a === null) return STATUS.NO_DATA;
  if (a >= t) return STATUS.ON_TRACK;
  if (STRICT_KPIS.includes(kpiKey)) return STATUS.BEHIND;
  // Within a tenth of the target is worth telling apart from a real
  // shortfall. A Board reading "Behind" against 78% on an 80% target
  // reacts the same way it would to 30%, and those are not the same
  // problem at all.
  if (t > 0 && a >= t * 0.9) return STATUS.SLIGHTLY_BEHIND;
  return STATUS.BEHIND;
}

export const STATUS_COLOURS = {
  "On track": { bg: "#E8F5E9", text: "#1a6b2f" },
  "Slightly behind": { bg: "#FFFDE6", text: "#7a5c00" },
  Behind: { bg: "#FDEAED", text: "#8b0a1c" },
  "Not captured": { bg: "#F2F2F2", text: "#5a5a5a" },
  "No target set": { bg: "#F2F2F2", text: "#5a5a5a" },
  "No data": { bg: "#F2F2F2", text: "#5a5a5a" },
};

export function formatValue(value, unit) {
  const n = numOrNull(value);
  if (n === null) return "—";
  if (unit === "percent") return `${n}%`;
  if (unit === "yesno") return n ? "Yes" : "No";
  if (unit === "currency") return `NGN ${n.toLocaleString()}`;
  return n.toLocaleString();
}

export function formatVariance(v, unit) {
  const n = numOrNull(v);
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  if (unit === "percent") return `${sign}${n} pts`;
  return `${sign}${n.toLocaleString()}`;
}

// Joins the two snapshots and the targets into the rows Template 2 wants.
// snapQ and snapYtd are whatever kpi_snapshot returned for the quarter and
// for the year to date. targets is the kpi_targets rows for that year.
export function buildBoardRows(snapQ, snapYtd, targets, quarter) {
  const ytdBy = {};
  (snapYtd || []).forEach((r) => { ytdBy[r.kpi_key] = r; });
  const tgtBy = {};
  (targets || []).forEach((t) => { tgtBy[t.kpi_key] = t; });

  return (snapQ || []).map((r) => {
    const secondary = r.status === "secondary";
    const t = secondary ? null : (tgtBy[r.kpi_key] || null);
    const y = ytdBy[r.kpi_key] || {};
    const qT = quarterTarget(t, quarter, r.unit);
    const yT = ytdTarget(t, quarter, r.unit);
    const qA = r.status === "not_captured" ? null : numOrNull(r.value);
    const yA = r.status === "not_captured" ? null : numOrNull(y.value);
    return {
      kpi_key: r.kpi_key,
      label: r.label,
      unit: r.unit,
      snapshotStatus: r.status,
      note: r.note,
      numerator: numOrNull(y.numerator !== undefined ? y.numerator : r.numerator),
      denominator: numOrNull(y.denominator !== undefined ? y.denominator : r.denominator),
      qTarget: qT,
      qActual: qA,
      ytdTarget: yT,
      ytdActual: yA,
      variance: variance(yA, yT),
      status: statusOf(r.kpi_key, r.status, yA, yT),
      secondary,
    };
  });
}

// The supporting figures are real and useful, but they are not KPIs. They
// go underneath rather than mixed in, so nobody can read one as the other.
export function splitRows(rows) {
  return {
    kpis: (rows || []).filter((r) => !r.secondary),
    secondary: (rows || []).filter((r) => r.secondary),
  };
}

// A cell starting with =, +, - or @ is run as a formula by Excel when the
// file is opened. A KPI note is not a spreadsheet instruction, so the
// leading character is defused before it gets the chance.
export function csvCell(v) {
  if (v === null || v === undefined) return '""';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(rows) {
  return (rows || []).map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// Builds the whole export including a header block, so the file still
// explains itself six months later when it is opened by somebody who was
// not in the room.
export function buildBoardCsvRows(rows, meta) {
  const out = [];
  out.push(["YOUNG CHRISTIAN DEVELOPMENT INITIATIVE"]);
  out.push(["Quarterly NEC Report to Board, Section A: Programme Performance"]);
  out.push(["Template 2, YCDI-PROG-003. KPI definitions from YCDI-PROG-002."]);
  out.push([]);
  out.push(["Financial year", String(meta.year)]);
  out.push(["Quarter", `Q${meta.quarter} (${meta.months})`]);
  out.push(["Quarter covered", `${meta.qFrom} to ${meta.qTo}`]);
  out.push(["Year to date", `${meta.yFrom} to ${meta.yTo}`]);
  out.push(["Scope", meta.scope || ""]);
  out.push(["Prepared by", meta.preparedBy || ""]);
  out.push(["Generated", meta.generatedOn || ""]);
  out.push([]);
  out.push(["KPI", "Q Target", "Q Actual", "YTD Target", "YTD Actual",
            "Variance (YTD)", "Status", "Notes"]);

  const { kpis, secondary } = splitRows(rows);
  kpis.forEach((r) => {
    out.push([
      r.label,
      formatValue(r.qTarget, r.unit),
      formatValue(r.qActual, r.unit),
      formatValue(r.ytdTarget, r.unit),
      formatValue(r.ytdActual, r.unit),
      formatVariance(r.variance, r.unit),
      r.status,
      r.note || "",
    ]);
  });

  if (secondary.length) {
    out.push([]);
    out.push(["SUPPORTING FIGURES, NOT KPI LINES"]);
    out.push(["Figure", "This quarter", "Year to date", "", "", "", "", "Notes"]);
    secondary.forEach((r) => {
      out.push([r.label, formatValue(r.qActual, r.unit),
                formatValue(r.ytdActual, r.unit), "", "", "", "", r.note || ""]);
    });
  }
  return out;
}

export function buildChapterCsvRows(breakdown) {
  const out = [["CHAPTER BREAKDOWN"]];
  out.push(["Chapter", "Activities", "Schools", "Beneficiaries (deduplicated)",
            "Attendance recorded (NOT deduplicated)", "Forms returned",
            "Positive replies", "Satisfaction", "Budget", "Spent"]);
  (breakdown || []).forEach((c) => {
    out.push([
      c.chapter_name,
      c.activities ?? 0,
      c.schools ?? 0,
      c.beneficiaries ?? 0,
      c.attendance_headcount ?? 0,
      c.forms_returned ?? 0,
      c.feedback_positive ?? 0,
      c.satisfaction_pct === null || c.satisfaction_pct === undefined
        ? "—" : `${c.satisfaction_pct}%`,
      c.budget ?? 0,
      c.spent ?? 0,
    ]);
  });
  return out;
}

export function csvFilename(year, quarter, kind) {
  return `YCDI_KPI_${kind}_${year}_Q${quarter}.csv`;
}

export function downloadCsv(filename, text) {
  // The byte order mark is there so Excel reads the file as UTF-8 rather
  // than turning Nigerian names and the en dashes into mojibake.
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function yearOptions(today) {
  const now = (today ? new Date(today) : new Date()).getUTCFullYear();
  const out = [];
  for (let y = now + 1; y >= 2024; y--) out.push(y);
  return out;
}

// The KPIs the National Coordinator can set a target against. The
// supporting figures are deliberately absent: a target on "seats filled"
// would invite somebody to go and chase it.
export const TARGETABLE = [
  { key: "schools_reached", label: "Total schools reached", unit: "count" },
  { key: "student_beneficiaries", label: "Student beneficiaries (deduplicated)", unit: "count" },
  { key: "activities_conducted", label: "Program activities conducted", unit: "count" },
  { key: "volunteer_active_rate", label: "Volunteer active rate", unit: "percent" },
  { key: "volunteer_retention", label: "Volunteer retention rate", unit: "percent" },
  { key: "chapters_active", label: "Active chapters", unit: "count" },
  { key: "participant_satisfaction", label: "Participant satisfaction", unit: "percent" },
  { key: "safeguarding_resolution", label: "Safeguarding resolved in 30 days", unit: "percent" },
  { key: "budget_utilisation", label: "Budget utilisation", unit: "percent" },
];
