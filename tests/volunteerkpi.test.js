import { describe, it, expect } from "vitest";
import {
  volunteerGap, gapReading, GAP_BANDS, YEAR_TO_DATE_ONLY,
  ACTIVE_RATE_REGISTER, ACTIVE_RATE_OBSERVED,
  buildBoardRows, splitRows, statusOf, STATUS, TARGETABLE,
  buildBoardCsvRows, formatValue,
  // BATCH11-MARKER volunteer-chapter-tests
  countOrDash, chapterVolunteerRates, hasChapterVolunteers, chaptersByGap,
  buildChapterCsvRows, windowReading, windowError, WINDOW_MAX, toCsv,
  ACTIVITY_WINDOW_KEY,
} from "../src/lib/kpi.js";

// BATCH7C-MARKER kpi-volunteer-tests
//
// The figures these are built from are the ones the database suite
// proves: nine volunteers on the books, seven of them marked active,
// three of them actually seen doing something.

// One line of kpi_snapshot, shaped the way the RPC returns it.
function line(kpi_key, over) {
  return {
    sort_order: 1, kpi_key, label: kpi_key, numerator: null, denominator: null,
    value: null, unit: "percent", status: "computed", note: "n", ...over,
  };
}

function snapshot(register, observed) {
  return [
    line(ACTIVE_RATE_REGISTER, { numerator: 7, denominator: 9, value: register }),
    line(ACTIVE_RATE_OBSERVED, { numerator: 3, denominator: 9, value: observed, status: "secondary" }),
    line("volunteers_on_books", { value: 9, unit: "count", status: "secondary" }),
    line("volunteer_retention", { numerator: 4, denominator: 6, value: 66.7 }),
    line("volunteer_retention_new", { numerator: 1, denominator: 2, value: 50, status: "secondary" }),
  ];
}

describe("the distance between the register and the record of work", () => {
  it("reports both figures and the gap between them", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), [], 4);
    expect(volunteerGap(rows)).toEqual({
      register: 77.8, observed: 33.3, gap: 44.5, band: "wide",
    });
  });

  // 77.8 minus 33.3 happens to come out clean in floating point, so a
  // test built on it proves nothing about the rounding. 77.7 minus 33.3
  // gives 44.400000000000006, which is what would otherwise reach the
  // Board pack.
  it("rounds the gap rather than trailing a long decimal into a Board paper", () => {
    const rows = buildBoardRows(snapshot(77.7, 33.3), snapshot(77.7, 33.3), [], 4);
    expect(77.7 - 33.3).not.toBe(44.4);
    expect(volunteerGap(rows).gap).toBe(44.4);
  });

  it("says nothing at all when the observed line is missing", () => {
    const only = [line(ACTIVE_RATE_REGISTER, { value: 77.8 })];
    expect(volunteerGap(buildBoardRows(only, only, [], 4))).toBeNull();
  });

  it("and nothing when the register line is missing", () => {
    const only = [line(ACTIVE_RATE_OBSERVED, { value: 33.3, status: "secondary" })];
    expect(volunteerGap(buildBoardRows(only, only, [], 4))).toBeNull();
  });

  it("refuses to guess when one of the two figures is blank", () => {
    const rows = buildBoardRows(snapshot(77.8, null), snapshot(77.8, null), [], 4);
    expect(volunteerGap(rows)).toBeNull();
  });

  it("copes with no rows at all", () => {
    expect(volunteerGap([])).toBeNull();
    expect(volunteerGap(null)).toBeNull();
  });

  it("calls a small gap the reassuring case", () => {
    const rows = buildBoardRows(snapshot(77.8, 70), snapshot(77.8, 70), [], 4);
    expect(volunteerGap(rows).band).toBe("close");
  });

  it("treats a gap sitting exactly on the band edge as the calmer reading", () => {
    const a = buildBoardRows(snapshot(80, 80 - GAP_BANDS.close), snapshot(80, 80 - GAP_BANDS.close), [], 4);
    expect(volunteerGap(a).band).toBe("close");
    const b = buildBoardRows(snapshot(80, 80 - GAP_BANDS.widening), snapshot(80, 80 - GAP_BANDS.widening), [], 4);
    expect(volunteerGap(b).band).toBe("widening");
  });

  it("moves up a band once the edge is passed", () => {
    const a = buildBoardRows(snapshot(80, 80 - GAP_BANDS.close - 0.1), snapshot(80, 80 - GAP_BANDS.close - 0.1), [], 4);
    expect(volunteerGap(a).band).toBe("widening");
    const b = buildBoardRows(snapshot(80, 80 - GAP_BANDS.widening - 0.1), snapshot(80, 80 - GAP_BANDS.widening - 0.1), [], 4);
    expect(volunteerGap(b).band).toBe("wide");
  });

  it("handles the register reading lower than the record of work", () => {
    const rows = buildBoardRows(snapshot(30, 40), snapshot(30, 40), [], 4);
    const g = volunteerGap(rows);
    expect(g.gap).toBe(-10);
    expect(g.band).toBe("close");
  });
});

describe("what the gap is allowed to say", () => {
  it("blames the register rather than the volunteers when the gap is wide", () => {
    const words = gapReading({ band: "wide" });
    expect(words).toMatch(/register has not been kept up/);
    expect(words).not.toMatch(/stopped working/);
  });

  it("mentions the attendance limitation when the gap is middling", () => {
    expect(gapReading({ band: "widening" })).toMatch(/once per volunteer per programme/);
  });

  it("is plainly positive when the two agree", () => {
    expect(gapReading({ band: "close" })).toMatch(/broadly agree/);
  });

  it("says nothing when there is nothing to read", () => {
    expect(gapReading(null)).toBe("");
  });
});

describe("retention is reported year to date only", () => {
  const targets = [
    { kpi_key: "volunteer_retention", annual_target: 60 },
    { kpi_key: "volunteer_active_rate", annual_target: 70 },
  ];

  it("names the lines that a single quarter would flatter", () => {
    expect(YEAR_TO_DATE_ONLY).toContain("volunteer_retention");
    expect(YEAR_TO_DATE_ONLY).toContain("volunteer_retention_new");
    expect(YEAR_TO_DATE_ONLY).not.toContain("volunteer_active_rate");
  });

  it("leaves the quarter figure blank rather than showing a shorter question", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), targets, 1);
    const ret = rows.find((r) => r.kpi_key === "volunteer_retention");
    expect(ret.qActual).toBeNull();
    expect(ret.ytdActual).toBe(66.7);
  });

  it("withholds the quarter target too, so a target never sits beside a blank", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), targets, 1);
    const ret = rows.find((r) => r.kpi_key === "volunteer_retention");
    expect(ret.qTarget).toBeNull();
    expect(ret.ytdTarget).toBe(60);
  });

  it("flags those rows so the screen can explain the blank", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), targets, 1);
    expect(rows.find((r) => r.kpi_key === "volunteer_retention").ytdOnly).toBe(true);
    expect(rows.find((r) => r.kpi_key === "volunteer_retention_new").ytdOnly).toBe(true);
  });

  it("does not withhold the active rate, which a quarter answers honestly", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), targets, 1);
    const act = rows.find((r) => r.kpi_key === "volunteer_active_rate");
    expect(act.ytdOnly).toBe(false);
    expect(act.qActual).toBe(77.8);
    expect(act.qTarget).toBe(70);
  });

  it("still measures the year to date figure against the target", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), targets, 4);
    const ret = rows.find((r) => r.kpi_key === "volunteer_retention");
    expect(ret.variance).toBe(6.7);
    expect(ret.status).toBe(STATUS.ON_TRACK);
  });
});

describe("the new lines sit in the right half of the report", () => {
  it("keeps the two KPI lines above the fold and the rest below it", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), [], 4);
    const { kpis, secondary } = splitRows(rows);
    expect(kpis.map((r) => r.kpi_key)).toEqual(["volunteer_active_rate", "volunteer_retention"]);
    expect(secondary.map((r) => r.kpi_key)).toEqual([
      "volunteer_active_rate_observed", "volunteers_on_books", "volunteer_retention_new",
    ]);
  });

  it("hangs no target on a supporting figure", () => {
    const keys = TARGETABLE.map((t) => t.key);
    expect(keys).toContain("volunteer_active_rate");
    expect(keys).toContain("volunteer_retention");
    expect(keys).not.toContain("volunteer_active_rate_observed");
    expect(keys).not.toContain("volunteer_retention_new");
    expect(keys).not.toContain("volunteers_on_books");
  });

  it("gives a supporting figure no status pill to be misread as a verdict", () => {
    expect(statusOf("volunteer_active_rate_observed", "secondary", 33.3, 70)).toBe("");
  });

  it("no longer calls the two volunteer KPIs not captured", () => {
    expect(statusOf("volunteer_active_rate", "computed", 77.8, 70)).toBe(STATUS.ON_TRACK);
    expect(statusOf("volunteer_retention", "computed", 55, 60)).toBe(STATUS.SLIGHTLY_BEHIND);
  });

  it("puts the supporting lines under their own heading in the export", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), [], 4);
    const csv = buildBoardCsvRows(rows, { year: 2026, quarter: 4, months: "Oct to Dec" });
    const flat = csv.map((r) => (r || []).join("|"));
    const heading = flat.findIndex((r) => r.startsWith("SUPPORTING FIGURES"));
    const observed = flat.findIndex((r) => r.startsWith("volunteer_active_rate_observed"));
    expect(heading).toBeGreaterThan(-1);
    expect(observed).toBeGreaterThan(heading);
  });

  it("writes a withheld quarter figure as a dash, not as a nought", () => {
    const rows = buildBoardRows(snapshot(77.8, 33.3), snapshot(77.8, 33.3), [], 1);
    const ret = rows.find((r) => r.kpi_key === "volunteer_retention");
    expect(formatValue(ret.qActual, ret.unit)).toBe("—");
  });
});


// ---------------------------------------------------------------
// Batch 11
// ---------------------------------------------------------------
//
// BATCH11-MARKER chapter-volunteer-unit-tests
//
// The distinction these are all circling is between a zero and a blank.
// A chapter with nobody on the books and a chapter whose figures are
// withheld from the reader look identical if either one is allowed to
// become the other, and the reader has no way of asking which they got.

function chapter(name, onBooks, active, involved, over) {
  return {
    chapter_id: name, chapter_name: name,
    activities: 0, schools: 0, beneficiaries: 0, attendance_headcount: 0,
    forms_returned: 0, feedback_positive: 0, satisfaction_pct: null,
    budget: 0, spent: 0,
    volunteer_on_books: onBooks, volunteer_active: active, volunteer_involved: involved,
    ...over,
  };
}
const DASH = "—";

describe("a withheld figure and a zero", () => {
  it("shows a dash for a withheld figure", () => {
    expect(countOrDash(null)).toBe(DASH);
    expect(countOrDash(undefined)).toBe(DASH);
    expect(countOrDash("")).toBe(DASH);
  });

  it("shows a zero for a zero, which is a different statement", () => {
    expect(countOrDash(0)).toBe("0");
  });

  it("formats a real count the way the rest of the screen does", () => {
    expect(countOrDash(8)).toBe("8");
    expect(countOrDash(1234)).toBe("1,234");
  });
});

describe("the per-chapter volunteer rates", () => {
  it("works out both readings and the distance between them", () => {
    const r = chapterVolunteerRates(chapter("Benin", 8, 6, 2));
    expect(r.register).toBe(75);
    expect(r.observed).toBe(25);
    expect(r.gap).toBe(50);
    expect(r.onBooks).toBe(8);
  });

  it("keeps one decimal place on a rate that does not divide cleanly", () => {
    const r = chapterVolunteerRates(chapter("Nine", 9, 7, 3));
    expect(r.register).toBe(77.8);
    expect(r.observed).toBe(33.3);
    expect(r.gap).toBe(44.5);
  });

  it("rounds rather than truncating", () => {
    const r = chapterVolunteerRates(chapter("Three", 3, 2, 1));
    expect(r.register).toBe(66.7);
    expect(r.observed).toBe(33.3);
  });

  it("returns nothing when the denominator is withheld", () => {
    expect(chapterVolunteerRates(chapter("X", null, 6, 2))).toBe(null);
  });

  it("returns nothing when the register figure alone is withheld", () => {
    expect(chapterVolunteerRates(chapter("X", 8, null, 2))).toBe(null);
  });

  it("returns nothing when the observed figure alone is withheld", () => {
    expect(chapterVolunteerRates(chapter("X", 8, 6, null))).toBe(null);
  });

  it("returns nothing for a chapter with nobody on the books", () => {
    // Not zero percent. A rate out of nobody is not a small number.
    expect(chapterVolunteerRates(chapter("Lagos", 0, 0, 0))).toBe(null);
  });

  it("calls a small gap close", () => {
    expect(chapterVolunteerRates(chapter("A", 100, 80, 75)).band).toBe("close");
  });

  it("treats the close edge as exclusive, so exactly 15 is still close", () => {
    const r = chapterVolunteerRates(chapter("A", 100, 80, 80 - GAP_BANDS.close));
    expect(r.gap).toBe(GAP_BANDS.close);
    expect(r.band).toBe("close");
  });

  it("calls a point past the close edge widening", () => {
    expect(chapterVolunteerRates(chapter("A", 100, 80, 64)).band).toBe("widening");
  });

  it("treats the wide edge as exclusive too", () => {
    const r = chapterVolunteerRates(chapter("A", 100, 90, 90 - GAP_BANDS.widening));
    expect(r.gap).toBe(GAP_BANDS.widening);
    expect(r.band).toBe("widening");
  });

  it("calls the largest gap wide, not the smallest", () => {
    expect(chapterVolunteerRates(chapter("A", 100, 90, 10)).band).toBe("wide");
    expect(chapterVolunteerRates(chapter("A", 100, 90, 85)).band).toBe("close");
  });

  it("uses the same bands as the national panel", () => {
    const c = chapterVolunteerRates(chapter("A", 100, 80, 40));
    const n = volunteerGap([
      line(ACTIVE_RATE_REGISTER, { value: 80 }),
      line(ACTIVE_RATE_OBSERVED, { value: 40 }),
    ]);
    expect(c.band).toBe(n.band);
    expect(c.gap).toBe(n.gap);
  });
});

describe("whether there is a volunteer table to draw", () => {
  it("is true when any chapter has figures", () => {
    expect(hasChapterVolunteers([chapter("A", 8, 6, 2)])).toBe(true);
  });

  it("is true when only some chapters have them", () => {
    expect(hasChapterVolunteers([
      chapter("A", null, null, null),
      chapter("B", 8, 6, 2),
    ])).toBe(true);
  });

  it("is false when every figure is withheld", () => {
    expect(hasChapterVolunteers([
      chapter("A", null, null, null),
      chapter("B", null, null, null),
    ])).toBe(false);
  });

  it("is false for nothing at all", () => {
    expect(hasChapterVolunteers([])).toBe(false);
    expect(hasChapterVolunteers(null)).toBe(false);
  });

  it("counts a genuine zero as something to show", () => {
    expect(hasChapterVolunteers([chapter("Lagos", 0, 0, 0)])).toBe(true);
  });
});

describe("ranking the chapters by gap", () => {
  const rows = [
    chapter("Small", 100, 80, 75),
    chapter("Big", 100, 90, 20),
    chapter("Middle", 100, 80, 55),
    chapter("Withheld", null, null, null),
    chapter("Empty", 0, 0, 0),
  ];

  it("puts the widest gap first", () => {
    expect(chaptersByGap(rows)[0].chapter.chapter_name).toBe("Big");
  });

  it("orders the rest behind it", () => {
    expect(chaptersByGap(rows).map((x) => x.chapter.chapter_name))
      .toEqual(["Big", "Middle", "Small"]);
  });

  it("leaves out chapters with no rate to rank", () => {
    const names = chaptersByGap(rows).map((x) => x.chapter.chapter_name);
    expect(names).not.toContain("Withheld");
    expect(names).not.toContain("Empty");
  });

  it("returns nothing when there is nothing to rank", () => {
    expect(chaptersByGap([chapter("Withheld", null, null, null)])).toEqual([]);
    expect(chaptersByGap(null)).toEqual([]);
  });
});

describe("the chapter CSV", () => {
  const header = buildChapterCsvRows([])[1];

  it("names the volunteer columns", () => {
    expect(header).toContain("Volunteers on books");
    expect(header).toContain("Active on register");
    expect(header).toContain("Seen in recorded work");
    expect(header).toContain("Gap (pts)");
  });

  it("keeps the programme columns it always had", () => {
    expect(header).toContain("Activities");
    expect(header).toContain("Beneficiaries (deduplicated)");
    expect(header).toContain("Spent");
  });

  it("writes the counts and both rates for a chapter", () => {
    const row = buildChapterCsvRows([chapter("Benin", 8, 6, 2)])[2];
    expect(row).toContain("8");
    expect(row).toContain("75%");
    expect(row).toContain("25%");
    expect(row).toContain(50);
  });

  it("writes a dash, never a zero, where the figures are withheld", () => {
    const row = buildChapterCsvRows([chapter("Benin", null, null, null)])[2];
    const tail = row.slice(10);
    expect(tail).toEqual([DASH, DASH, DASH, DASH, DASH, DASH]);
    expect(tail).not.toContain(0);
  });

  it("writes a zero for a chapter that really has nobody", () => {
    const row = buildChapterCsvRows([chapter("Lagos", 0, 0, 0)])[2];
    expect(row[10]).toBe("0");
    expect(row[13]).toBe(DASH);
  });

  it("defuses a chapter name that Excel would run as a formula", () => {
    const csv = toCsv(buildChapterCsvRows([chapter("=cmd", 8, 6, 2)]));
    expect(csv).toContain("'=cmd");
  });
});

describe("the activity window setting", () => {
  it("keys off the name the database uses", () => {
    expect(ACTIVITY_WINDOW_KEY).toBe("volunteer_activity_window_days");
  });

  it("describes the whole period without inventing a day count", () => {
    const t = windowReading(null);
    expect(t).toContain("any point in the reporting period");
    expect(t).not.toContain("days");
  });

  it("names the number of days when there is one", () => {
    expect(windowReading(90)).toContain("last 90 days");
    expect(windowReading(30)).toContain("last 30 days");
  });

  it("says the window never reaches outside the period", () => {
    expect(windowReading(365)).toContain("never reaches outside");
  });

  it("treats an empty box as something to answer, not as a day count", () => {
    expect(windowError("")).not.toBe("");
    expect(windowError(null)).not.toBe("");
    expect(windowError("abc")).not.toBe("");
  });

  it("refuses part of a day", () => {
    expect(windowError(1.5)).toContain("whole number");
    expect(windowError("7.2")).toContain("whole number");
  });

  it("refuses zero and negative days", () => {
    expect(windowError(0)).toContain("at least 1");
    expect(windowError(-30)).toContain("at least 1");
  });

  it("refuses a window longer than the ceiling", () => {
    expect(windowError(WINDOW_MAX + 1)).toContain("or fewer");
    expect(windowError(100000)).toContain("or fewer");
  });

  it("accepts the ordinary answers", () => {
    expect(windowError(1)).toBe("");
    expect(windowError(90)).toBe("");
    expect(windowError("90")).toBe("");
    expect(windowError(WINDOW_MAX)).toBe("");
  });
});
