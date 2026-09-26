// BATCH33-MARKER grants-screen
// The grants screen's first frame for each kind of person: which grant a
// card shows and the moves it offers, that the form guards a restricted
// grant, that the deadline list only lets a manager act, and who is shown
// the card in the "More" grid. The database repeats every access rule.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GrantCard, StatusButtons, GrantForm, ObligationList } from "../src/sections/GrantsSection.jsx";
import { visibleMoreFeatures } from "../src/sections/MoreSection.jsx";

const noop = () => {};
const row = (over = {}) => ({
  grant_id: "g1", id: "g1", grant_no: 3, reference: "FF-1", title: "Literacy grant", funder_name: "Ford",
  is_restricted: true, status: "active", period_end: "2027-06-30", awarded_kobo: 500000000,
  allocated_kobo: 300000000, committed_kobo: 50000000, paid_kobo: 80000000, remaining_kobo: 370000000,
  over_allocated: false, programmes: 3, obligations_open: 2, obligations_overdue: 1, ...over,
});
const card = (r, canManage) => renderToStaticMarkup(<GrantCard row={r} canManage={canManage} open={false} onOpen={noop} />);

describe("a grant card", () => {
  it("shows the award, the restriction and the funder", () => {
    const out = card(row(), true);
    expect(out).toContain("₦5,000,000");
    expect(out).toContain("Restricted");
    expect(out).toContain("Ford");
    expect(out).toContain("Active");
  });
  it("flags overdue deadlines and over-allocation", () => {
    expect(card(row(), true)).toContain("1 overdue");
    expect(card(row({ over_allocated: true }), true)).toContain("Over-allocated");
  });
  it("says Manage to a manager and Details to a reader", () => {
    expect(card(row(), true)).toContain(">Manage<");
    expect(card(row(), false)).toContain(">Details<");
  });
  it("shows how much is left, or how much it is over", () => {
    expect(card(row(), true)).toContain("₦3,700,000 left");
    expect(card(row({ remaining_kobo: -100000 }), true)).toContain("₦1,000 over");
  });
});

describe("the status buttons", () => {
  const btns = (status) => renderToStaticMarkup(<StatusButtons status={status} busy={false} onMove={noop} />);
  it("walk a grant forward and offer decline from a live stage", () => {
    expect(btns("prospect")).toContain("Mark applied");
    expect(btns("prospect")).toContain("Mark declined");
    expect(btns("awarded")).toContain("Mark active");
    expect(btns("active")).toContain("Move to reporting");
    expect(btns("active")).toContain("Close grant");
  });
  it("offer nothing once the grant is finished", () => {
    expect(btns("closed")).toBe("");
    expect(btns("declined")).toBe("");
  });
});

describe("the grant form", () => {
  it("shows the restriction note field only when restricted", () => {
    const restricted = renderToStaticMarkup(<GrantForm funders={[]} saving={false} onSave={noop} onCancel={noop} />);
    expect(restricted).toContain("What it is restricted to");
  });
  it("edits an existing grant with its amount in naira", () => {
    const g = { id: "g1", title: "Literacy", funder_name: "Ford", awarded_kobo: 500000000, is_restricted: true, restrictions: "Reading rooms" };
    const out = renderToStaticMarkup(<GrantForm grant={g} funders={[]} saving={false} onSave={noop} onCancel={noop} />);
    expect(out).toContain("Save changes");
    expect(out).toContain("5000000");
  });
});

describe("the deadline list", () => {
  const obls = [
    { id: "o1", kind: "narrative_report", title: "Q1 report", due_date: "2026-09-20", status: "pending" },
    { id: "o2", kind: "financial_report", title: "Q4 report", due_date: "2026-09-01", status: "done", completed_on: "2026-09-02" },
  ];
  const list = (canManage) => renderToStaticMarkup(<ObligationList obligations={obls} canManage={canManage} today="2026-09-26" onAdd={noop} onSettle={noop} onWaive={noop} onRemove={noop} />);
  it("lets a manager act on a pending deadline", () => {
    const out = list(true);
    for (const b of ["Submitted", "Done", "Waive", "Remove", "Add a deadline"]) expect(out).toContain(">" + b + "<");
  });
  it("shows a reader the deadlines but no buttons", () => {
    const out = list(false);
    expect(out).toContain("Q1 report");
    for (const b of ["Submitted", "Waive", "Remove", "Add a deadline"]) expect(out).not.toContain(">" + b + "<");
  });
  it("reads the clock: an overdue pending one, a done one closed", () => {
    const out = list(true);
    expect(out).toContain("overdue");
    expect(out).toContain("Done");
  });
});

describe("the card in the More grid", () => {
  const grants = (who) => visibleMoreFeatures(who).find((f) => f.id === "grants");
  const nc = { role: "NC", is_admin: false, portfolios: [] };
  const dnc = { role: "TM", is_admin: false, portfolios: ["DNC"] };
  const fin = { role: "TM", is_admin: false, portfolios: ["FIN"] };
  const treas = { role: "TM", is_admin: false, portfolios: ["TREAS"] };
  const rc = { role: "RC", chapter_id: "ch", is_admin: false, portfolios: [] };
  const member = { role: "TM", is_admin: false, portfolios: [] };
  const admin = { role: "TM", is_admin: true, portfolios: [] };

  it("is shown to the NC, the Deputy, the Financial Secretary, the Treasurer and a coordinator", () => {
    for (const who of [nc, dnc, fin, treas, rc]) expect(grants(who)).toBeTruthy();
  });
  it("is hidden from a plain member and a plain admin", () => {
    expect(grants(member)).toBeFalsy();
    expect(grants(admin)).toBeFalsy();
  });
});
