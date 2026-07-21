import { describe, it, expect } from "vitest";
import {
  volunteerGap, gapReading, GAP_BANDS, YEAR_TO_DATE_ONLY,
  ACTIVE_RATE_REGISTER, ACTIVE_RATE_OBSERVED,
  buildBoardRows, splitRows, statusOf, STATUS, TARGETABLE,
  buildBoardCsvRows, formatValue,
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
