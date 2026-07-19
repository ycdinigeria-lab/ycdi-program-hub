import { describe, it, expect } from "vitest";
import {
  quarterRange, ytdRange, quarterOfDate, quarterTarget, ytdTarget,
  variance, statusOf, STATUS, formatValue, formatVariance,
  buildBoardRows, splitRows, csvCell, toCsv, buildBoardCsvRows,
  buildChapterCsvRows, yearOptions, numOrNull,
} from "../src/lib/kpi.js";

// BATCH5-MARKER kpi-tests

describe("quarter and year-to-date ranges", () => {
  it("gives the Board's own quarters", () => {
    expect(quarterRange(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(quarterRange(2026, 2)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(quarterRange(2026, 3)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(quarterRange(2026, 4)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("gets February right in a leap year", () => {
    expect(quarterRange(2024, 1).to).toBe("2024-03-31");
    expect(ytdRange(2024, 1).to).toBe("2024-03-31");
  });

  it("runs year to date from January to the end of the quarter, not to today", () => {
    expect(ytdRange(2026, 3)).toEqual({ from: "2026-01-01", to: "2026-09-30" });
  });

  it("refuses a quarter that does not exist rather than inventing one", () => {
    expect(quarterRange(2026, 5)).toBeNull();
    expect(ytdRange(2026, 0)).toBeNull();
  });

  it("works out which quarter a date falls in", () => {
    expect(quarterOfDate("2026-01-15")).toBe(1);
    expect(quarterOfDate("2026-03-31")).toBe(1);
    expect(quarterOfDate("2026-04-01")).toBe(2);
    expect(quarterOfDate("2026-12-31")).toBe(4);
  });
});

describe("targets", () => {
  const counted = { annual_target: 40, q1_target: 10, q2_target: 10, q3_target: 10, q4_target: 10 };
  const standing = { annual_target: 80 };

  it("adds counts up across the quarters reported so far", () => {
    expect(ytdTarget(counted, 1, "count")).toBe(10);
    expect(ytdTarget(counted, 3, "count")).toBe(30);
    expect(ytdTarget(counted, 4, "count")).toBe(40);
  });

  it("does NOT add percentages up, because four quarters at 80% is not 320%", () => {
    expect(ytdTarget({ ...counted, q1_target: 80, q2_target: 80, q3_target: 80, q4_target: 80 }, 4, "percent")).toBe(80);
  });

  it("carries a standing percentage into every quarter", () => {
    expect(quarterTarget(standing, 2, "percent")).toBe(80);
    expect(ytdTarget(standing, 2, "percent")).toBe(80);
  });

  it("does not spread an annual count across quarters nobody split", () => {
    // Twelve schools for the year is not twelve schools in Q1.
    expect(quarterTarget({ annual_target: 12 }, 1, "count")).toBeNull();
    expect(ytdTarget({ annual_target: 12 }, 1, "count")).toBeNull();
    // At Q4 the year is the year, so the annual figure applies.
    expect(ytdTarget({ annual_target: 12 }, 4, "count")).toBe(12);
  });

  it("treats a missing target as missing, not as zero", () => {
    expect(quarterTarget(null, 1, "count")).toBeNull();
    expect(ytdTarget(null, 1, "count")).toBeNull();
    expect(numOrNull("")).toBeNull();
    expect(numOrNull(0)).toBe(0);
  });
});

describe("variance", () => {
  it("is positive when ahead and negative when behind", () => {
    expect(variance(45, 40)).toBe(5);
    expect(variance(35, 40)).toBe(-5);
  });

  it("is null when either side is missing, because no target is not a zero variance", () => {
    expect(variance(45, null)).toBeNull();
    expect(variance(null, 40)).toBeNull();
  });

  it("formats percentage variance in points, not percent of a percent", () => {
    expect(formatVariance(-3.3, "percent")).toBe("-3.3 pts");
    expect(formatVariance(5, "count")).toBe("+5");
  });
});

describe("status wording", () => {
  it("is On track when the target is met or beaten", () => {
    expect(statusOf("schools_reached", "computed", 40, 40)).toBe(STATUS.ON_TRACK);
    expect(statusOf("schools_reached", "computed", 41, 40)).toBe(STATUS.ON_TRACK);
  });

  it("tells a near miss apart from a real shortfall", () => {
    expect(statusOf("participant_satisfaction", "computed", 76, 80)).toBe(STATUS.SLIGHTLY_BEHIND);
    expect(statusOf("participant_satisfaction", "computed", 30, 80)).toBe(STATUS.BEHIND);
  });

  it("gives safeguarding no amber band at all", () => {
    // 97% resolved in 30 days is not nearly there. It is a case that sat
    // open past the deadline, and the Board should read it as Behind.
    expect(statusOf("safeguarding_resolution", "computed", 97, 100)).toBe(STATUS.BEHIND);
    expect(statusOf("safeguarding_resolution", "computed", 100, 100)).toBe(STATUS.ON_TRACK);
  });

  it("says Not captured rather than pretending a gap is a failure", () => {
    expect(statusOf("volunteer_retention", "not_captured", null, 60)).toBe(STATUS.NOT_CAPTURED);
  });

  it("distinguishes no target from no data", () => {
    expect(statusOf("schools_reached", "computed", 12, null)).toBe(STATUS.NO_TARGET);
    expect(statusOf("schools_reached", "computed", null, 12)).toBe(STATUS.NO_DATA);
  });

  it("leaves supporting figures without a status, so they cannot read as KPIs", () => {
    expect(statusOf("attendance_headcount", "secondary", 180, null)).toBe("");
  });
});

describe("building the Board table", () => {
  const snapQ = [
    { kpi_key: "schools_reached", label: "Schools", unit: "count", status: "computed", value: 3, note: "n" },
    { kpi_key: "attendance_headcount", label: "Attendance", unit: "count", status: "secondary", value: 180, note: "seats" },
    // Deliberately carries a value. If a stray figure ever arrives on a
    // not_captured line, the table must blank it rather than print it.
    { kpi_key: "volunteer_retention", label: "Retention", unit: "percent", status: "not_captured", value: 62, note: "no register" },
  ];
  const snapY = [
    { kpi_key: "schools_reached", value: 5, numerator: null, denominator: null },
    { kpi_key: "attendance_headcount", value: 400 },
    { kpi_key: "volunteer_retention", value: 62 },
  ];
  // A target row exists for the headcount too. It must be ignored: seats are
  // not a KPI, and a target against them invites somebody to chase it.
  const targets = [
    { kpi_key: "schools_reached", annual_target: 8, q1_target: 4, q2_target: 4 },
    { kpi_key: "attendance_headcount", annual_target: 999, q1_target: 250, q2_target: 250 },
  ];
  const rows = buildBoardRows(snapQ, snapY, targets, 2);

  it("puts the quarter and the year to date side by side", () => {
    const s = rows.find((r) => r.kpi_key === "schools_reached");
    expect(s.qActual).toBe(3);
    expect(s.ytdActual).toBe(5);
    expect(s.qTarget).toBe(4);
    expect(s.ytdTarget).toBe(8);
    expect(s.variance).toBe(-3);
  });

  it("never lets a not-captured KPI carry a number", () => {
    const v = rows.find((r) => r.kpi_key === "volunteer_retention");
    expect(v.qActual).toBeNull();
    expect(v.ytdActual).toBeNull();
    expect(v.variance).toBeNull();
    expect(v.status).toBe(STATUS.NOT_CAPTURED);
  });

  it("never attaches a target to a supporting figure", () => {
    const a = rows.find((r) => r.kpi_key === "attendance_headcount");
    expect(a.qTarget).toBeNull();
    expect(a.ytdTarget).toBeNull();
    expect(a.secondary).toBe(true);
  });

  it("keeps the supporting figures out of the KPI list", () => {
    const { kpis, secondary } = splitRows(rows);
    expect(kpis.map((r) => r.kpi_key)).toEqual(["schools_reached", "volunteer_retention"]);
    expect(secondary.map((r) => r.kpi_key)).toEqual(["attendance_headcount"]);
  });

  it("survives an empty snapshot instead of throwing at the Board meeting", () => {
    expect(buildBoardRows(null, null, null, 1)).toEqual([]);
  });
});

describe("formatting", () => {
  it("shows a missing value as a dash, never as zero", () => {
    expect(formatValue(null, "count")).toBe("—");
    expect(formatValue(undefined, "percent")).toBe("—");
    expect(formatValue(0, "count")).toBe("0");
  });

  it("marks percentages as percentages", () => {
    expect(formatValue(76.7, "percent")).toBe("76.7%");
  });
});

describe("CSV export", () => {
  it("defuses a cell Excel would otherwise run as a formula", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("\"'=SUM(A1:A9)\"");
    expect(csvCell("-3 pts")).toBe("\"'-3 pts\"");
  });

  it("escapes quotes rather than breaking the row", () => {
    expect(csvCell('Ade said "yes"')).toBe('"Ade said ""yes"""');
  });

  it("writes an empty cell for a missing value", () => {
    expect(csvCell(null)).toBe('""');
  });

  it("separates rows the way Excel expects", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe('"a","b"\r\n"c","d"');
  });

  it("labels the supporting figures in the file itself, not just on screen", () => {
    const rows = buildBoardRows(
      [{ kpi_key: "attendance_headcount", label: "Attendance", unit: "count", status: "secondary", value: 180, note: "seats" }],
      [{ kpi_key: "attendance_headcount", value: 400 }], [], 1
    );
    const text = toCsv(buildBoardCsvRows(rows, {
      year: 2026, quarter: 1, months: "Jan to Mar",
      qFrom: "2026-01-01", qTo: "2026-03-31", yFrom: "2026-01-01", yTo: "2026-03-31",
    }));
    expect(text).toContain("SUPPORTING FIGURES, NOT KPI LINES");
    expect(text).toContain("Template 2, YCDI-PROG-003");
  });

  it("names both attendance columns in the chapter export so they cannot be confused", () => {
    const text = toCsv(buildChapterCsvRows([{ chapter_name: "Benin", activities: 3, beneficiaries: 2, attendance_headcount: 150 }]));
    expect(text).toContain("Beneficiaries (deduplicated)");
    expect(text).toContain("Attendance recorded (NOT deduplicated)");
  });
});

describe("year options", () => {
  it("offers next year through 2024, newest first", () => {
    const ys = yearOptions("2026-07-19");
    expect(ys[0]).toBe(2027);
    expect(ys[ys.length - 1]).toBe(2024);
  });
});
