// The KPI screen rendered, not just the arithmetic behind it.
//
// BATCH11-MARKER kpi-screen-tests
//
// Nothing in tests/ rendered KpiReportSection at all before this. That
// predates Batch 10, but Batch 10 put a panel on the screen with three
// colour branches and a null case and shipped it with no component
// coverage, which is how a panel that silently stops appearing goes
// unnoticed: every arithmetic test still passes.
//
// These render real components against rows built by buildBoardRows, so
// a change to the shape of a row breaks them the same way it would break
// the screen.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import KpiReportSection, {
  VolunteerGapPanel, BoardRowsDesktop, BoardRowsMobile,
  ChapterTable, ChapterVolunteerTable, ActivityWindowControl,
} from "../src/sections/KpiReportSection.jsx";
import { buildBoardRows, GAP_BANDS } from "../src/lib/kpi.js";

const noop = () => {};
const DASH = "—";

// Two active rate lines and one retention line, which is the smallest
// set that exercises everything on the screen.
function snap(register, observed) {
  return [
    { sort_order: 5, kpi_key: "volunteer_active_rate", label: "Volunteer active rate (% of registered volunteers active)",
      numerator: 7, denominator: 9, value: register, unit: "percent", status: "computed", note: "From the volunteer register." },
    { sort_order: 6, kpi_key: "volunteer_active_rate_observed", label: "Volunteer active rate, observed from recorded work",
      numerator: 3, denominator: 9, value: observed, unit: "percent", status: "secondary", note: "The same denominator." },
    { sort_order: 8, kpi_key: "volunteer_retention", label: "Volunteer retention rate (year-on-year)",
      numerator: 2, denominator: 3, value: 66.7, unit: "percent", status: "computed", note: "Continuing volunteers." },
  ];
}
const targets = [{ kpi_key: "volunteer_active_rate", annual_target: 70, q1_target: 70 },
                 { kpi_key: "volunteer_retention", annual_target: 60, q1_target: 60 }];
const rowsFor = (reg, obs) => buildBoardRows(snap(reg, obs), snap(reg, obs), targets, 1);

describe("the volunteer gap panel", () => {
  it("shows both figures and the distance between them", () => {
    const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.8, 33.3)} />);
    expect(html).toContain("77.8%");
    expect(html).toContain("33.3%");
    expect(html).toContain("44.5 pts");
    expect(html).toContain("marked active on the register");
    expect(html).toContain("seen in recorded work");
  });

  it("reads a close gap as the reassuring case", () => {
    const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.8, 70.0)} />);
    expect(html).toContain("broadly agree");
  });

  it("reads a middling gap as worth checking chapter by chapter", () => {
    const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.8, 50.0)} />);
    expect(html).toContain("chapter by chapter");
    expect(html).not.toContain("broadly agree");
  });

  it("reads a wide gap as the register being stale", () => {
    const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.8, 20.0)} />);
    expect(html).toContain("disagree sharply");
    expect(html).toContain("register has not been kept up");
  });

  // The wide-band wording does mention the work stopping, but only to
  // rule it out. Asserting the phrase is absent would be a test that
  // passes on a rewrite saying the opposite, so this checks the negation
  // travels with it.
  it("never blames the volunteers, at any width", () => {
    for (const obs of [70.0, 50.0, 20.0, 0]) {
      const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.8, obs)} />);
      expect(html).not.toContain("volunteers stopped");
      expect(html).not.toContain("volunteers have stopped");
      if (html.includes("work stopped")) {
        expect(html).toContain("not that the work stopped");
      }
    }
  });

  // 77.7 minus 33.3 is 44.400000000000006 in floating point. 77.8 minus
  // 33.3 is exactly 44.5 and proves nothing about rounding, which is how
  // an earlier version of this passed for the wrong reason.
  it("rounds a gap that does not divide cleanly", () => {
    const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.7, 33.3)} />);
    expect(html).toContain("44.4 pts");
    expect(html).not.toContain("44.400000000000006");
  });

  it("gives the three bands three different sentences", () => {
    const said = [70.0, 50.0, 20.0].map((obs) =>
      renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(77.8, obs)} />));
    expect(new Set(said).size).toBe(3);
  });

  it("treats the band edges as exclusive, so exactly 15 is still close", () => {
    const html = renderToStaticMarkup(<VolunteerGapPanel rows={rowsFor(80.0, 80.0 - GAP_BANDS.close)} />);
    expect(html).toContain("broadly agree");
  });

  it("disappears entirely when the register figure is missing", () => {
    const rows = rowsFor(77.8, 33.3).map((r) =>
      r.kpi_key === "volunteer_active_rate" ? { ...r, ytdActual: null } : r);
    expect(renderToStaticMarkup(<VolunteerGapPanel rows={rows} />)).toBe("");
  });

  it("disappears entirely when the observed figure is missing", () => {
    const rows = rowsFor(77.8, 33.3).map((r) =>
      r.kpi_key === "volunteer_active_rate_observed" ? { ...r, ytdActual: null } : r);
    expect(renderToStaticMarkup(<VolunteerGapPanel rows={rows} />)).toBe("");
  });

  it("disappears when the volunteer lines are absent altogether", () => {
    expect(renderToStaticMarkup(<VolunteerGapPanel rows={[]} />)).toBe("");
    expect(renderToStaticMarkup(<VolunteerGapPanel rows={null} />)).toBe("");
  });
});

describe("the board table", () => {
  const rows = rowsFor(77.8, 33.3);

  it("leaves the retention quarter cells blank and says why", () => {
    const html = renderToStaticMarkup(<BoardRowsDesktop rows={rows} />);
    expect(html).toContain("Reported year to date only");
    expect(html).toContain("beside a target written for the other");
  });

  it("puts that explanation on the retention row and nowhere else", () => {
    const only = rows.filter((r) => r.kpi_key === "volunteer_active_rate");
    const html = renderToStaticMarkup(<BoardRowsDesktop rows={only} />);
    expect(html).not.toContain("Reported year to date only");
  });

  it("withholds the retention quarter target as well as the actual", () => {
    const r = rows.find((x) => x.kpi_key === "volunteer_retention");
    expect(r.qActual).toBe(null);
    expect(r.qTarget).toBe(null);
    expect(r.ytdActual).toBe(66.7);
  });

  it("shows the active rate quarter figures normally", () => {
    const r = rows.find((x) => x.kpi_key === "volunteer_active_rate");
    expect(r.qActual).toBe(77.8);
    expect(r.ytdOnly).toBe(false);
  });

  it("says the same thing on a phone", () => {
    const html = renderToStaticMarkup(<BoardRowsMobile rows={rows} />);
    expect(html).toContain("Reported year to date only");
    expect(html).toContain("77.8%");
  });

  it("keeps the supporting figures out of the KPI table", () => {
    const html = renderToStaticMarkup(<BoardRowsDesktop rows={rows} />);
    expect(html).toContain("Supporting figures, not KPI lines");
  });
});

const chapters = [
  { chapter_id: "c1", chapter_name: "Benin", activities: 3, schools: 2, beneficiaries: 40,
    attendance_headcount: 90, satisfaction_pct: 80, budget: 1000, spent: 900,
    volunteer_on_books: 8, volunteer_active: 6, volunteer_involved: 2 },
  { chapter_id: "c2", chapter_name: "Auchi", activities: 1, schools: 1, beneficiaries: 10,
    attendance_headcount: 20, satisfaction_pct: null, budget: 200, spent: 150,
    volunteer_on_books: 1, volunteer_active: 1, volunteer_involved: 1 },
  { chapter_id: "c3", chapter_name: "Lagos", activities: 0, schools: 0, beneficiaries: 0,
    attendance_headcount: 0, satisfaction_pct: null, budget: 0, spent: 0,
    volunteer_on_books: 0, volunteer_active: 0, volunteer_involved: 0 },
];
const withheld = chapters.map((c) => ({
  ...c, volunteer_on_books: null, volunteer_active: null, volunteer_involved: null,
}));

describe("the chapter volunteer table", () => {
  it("shows the counts and both rates for each chapter", () => {
    const html = renderToStaticMarkup(<ChapterVolunteerTable rows={chapters} />);
    expect(html).toContain("Benin");
    expect(html).toContain("75%");
    expect(html).toContain("25%");
    expect(html).toContain("50 pts");
  });

  it("names the chapter carrying the widest gap", () => {
    const html = renderToStaticMarkup(<ChapterVolunteerTable rows={chapters} />);
    expect(html).toContain("Benin carries the widest gap");
  });

  it("says so plainly when only one chapter has anybody", () => {
    const html = renderToStaticMarkup(<ChapterVolunteerTable rows={[chapters[0], chapters[2]]} />);
    expect(html).toContain("only chapter with volunteers");
  });

  it("shows a dash rather than a rate for a chapter with nobody on the books", () => {
    const html = renderToStaticMarkup(<ChapterVolunteerTable rows={[chapters[2]]} />);
    expect(html).toContain(DASH);
    expect(html).not.toContain("0 pts");
  });

  it("replaces the whole table with an explanation when the figures are withheld", () => {
    const html = renderToStaticMarkup(<ChapterVolunteerTable rows={withheld} />);
    expect(html).toContain("limited to coordinators and admins");
    expect(html).not.toContain("On the books</th>");
  });

  it("does not turn a withheld figure into a zero", () => {
    const html = renderToStaticMarkup(<ChapterVolunteerTable rows={withheld} />);
    expect(html).not.toContain("<td");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("0%");
    expect(html).not.toContain("pts");
  });

  it("leaves the programme table alone", () => {
    const html = renderToStaticMarkup(<ChapterTable rows={chapters} />);
    expect(html).toContain("Benin");
    expect(html).not.toContain("On the books");
  });
});

describe("the activity window control", () => {
  it("is absent for somebody who could not save it", () => {
    expect(renderToStaticMarkup(
      <ActivityWindowControl value={null} canEdit={false} saving={false} onSave={noop} />
    )).toBe("");
  });

  it("explains the whole-period setting in words", () => {
    const html = renderToStaticMarkup(
      <ActivityWindowControl value={null} canEdit saving={false} onSave={noop} />);
    expect(html).toContain("at any point in the reporting period");
    expect(html).toContain("did this person serve this year");
  });

  it("explains a day window in words, naming the number", () => {
    const html = renderToStaticMarkup(
      <ActivityWindowControl value={90} canEdit saving={false} onSave={noop} />);
    expect(html).toContain("last 90 days");
    expect(html).toContain("never reaches outside the period");
  });

  it("warns that a short window drops people who are still serving", () => {
    const html = renderToStaticMarkup(
      <ActivityWindowControl value={30} canEdit saving={false} onSave={noop} />);
    expect(html).toContain("once per volunteer per programme");
  });

  it("offers both choices as radio buttons", () => {
    const html = renderToStaticMarkup(
      <ActivityWindowControl value={null} canEdit saving={false} onSave={noop} />);
    expect(html).toContain("The whole reporting period");
    expect(html).toContain('type="radio"');
    expect(html).toContain("Number of days in the activity window");
  });

  it("starts with the save button disabled, because nothing has changed", () => {
    const html = renderToStaticMarkup(
      <ActivityWindowControl value={90} canEdit saving={false} onSave={noop} />);
    expect(html).toContain("disabled");
  });
});

describe("the whole screen", () => {
  const profile = { id: "u1", full_name: "Ngozi NC", role: "NC", is_admin: false, chapter_id: null };
  const all = [{ id: "c1", name: "Benin" }];

  it("renders its first frame without throwing", () => {
    const html = renderToStaticMarkup(
      <KpiReportSection profile={profile} chapters={all} showToast={noop} />);
    expect(typeof html).toBe("string");
    expect(html).toContain("Board and funder KPI report");
  });

  it("tells a coordinator the figures are their chapter's, not the country's", () => {
    const rc = { ...profile, role: "RC", chapter_id: "c1" };
    const html = renderToStaticMarkup(
      <KpiReportSection profile={rc} chapters={all} showToast={noop} />);
    expect(html).toContain("Benin");
    expect(html).toContain("figures, not");
    expect(html).toContain("benin chapter only");
  });

  it("does not tell the National Coordinator that, because it is not true for them", () => {
    const html = renderToStaticMarkup(
      <KpiReportSection profile={profile} chapters={all} showToast={noop} />);
    expect(html).not.toContain("figures, not");
    expect(html).toContain("all chapters");
  });

  it("renders for a Team Member without the targets editor blowing up", () => {
    const tm = { ...profile, role: "TM", chapter_id: "c1" };
    expect(typeof renderToStaticMarkup(
      <KpiReportSection profile={tm} chapters={all} showToast={noop} />)).toBe("string");
  });
});
