// BATCH32-MARKER finance-screen
// The finance screen's first frame for each kind of person: which claim
// buttons they are offered, that a draft's account-number guard shows in
// the pay box, and who the card in the "More" grid is shown to. The
// database repeats every access rule; this checks the screen never offers
// a button it will be refused for.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClaimCard, DecisionBox, PayBox, BudgetCard } from "../src/sections/FinanceSection.jsx";
import { visibleMoreFeatures } from "../src/sections/MoreSection.jsx";

const noop = () => {};
const owner = { id: "u-own", role: "TM", is_admin: false, portfolios: [] };
const fin = { id: "u-fin", role: "TM", is_admin: false, portfolios: ["FIN"] };
const nc = { id: "u-nc", role: "NC", is_admin: false, portfolios: [] };
const treas = { id: "u-tr", role: "TM", is_admin: false, portfolios: ["TREAS"] };
const rc = { id: "u-rc", role: "RC", chapter_id: "ch", is_admin: false, portfolios: [] };
const member = { id: "u-tm", role: "TM", is_admin: false, portfolios: [] };
const admin = { id: "u-ad", role: "TM", is_admin: true, portfolios: [] };

const claim = (over = {}) => ({
  id: "c1", claim_no: 7, claimant_id: "u-own", claimant_name: "Tobi", title: "Taxi",
  category: "transport", amount_kobo: 350000, incurred_on: "2026-09-20", status: "submitted",
  due_by: "2026-10-20", review_note: null, over_budget: false, ...over,
});
const card = (c, who, finHolder = "u-fin") => renderToStaticMarkup(
  <ClaimCard claim={c} profile={who} finHolderId={finHolder} today="2026-09-25" onAction={noop} onToggle={noop} />
);
const has = (html, label) => html.includes(`>${label}<`);

describe("a submitted claim", () => {
  it("offers the Financial Secretary approve, send back and decline", () => {
    const out = card(claim(), fin);
    for (const b of ["Approve", "Send back", "Decline"]) expect(has(out, b)).toBe(true);
    expect(has(out, "Mark as paid")).toBe(false);
  });
  it("offers its author only withdraw", () => {
    const out = card(claim(), owner);
    expect(has(out, "Withdraw")).toBe(true);
    for (const b of ["Approve", "Send back", "Decline", "Edit"]) expect(has(out, b)).toBe(false);
  });
  it("offers the Treasurer, a coordinator and an admin nothing but details", () => {
    for (const who of [treas, rc, admin]) {
      const out = card(claim(), who);
      for (const b of ["Approve", "Send back", "Decline", "Withdraw", "Mark as paid"]) expect(has(out, b)).toBe(false);
      expect(has(out, "Details")).toBe(true);
    }
  });
  it("does not let the Financial Secretary decide their own claim", () => {
    const own = claim({ claimant_id: "u-fin" });
    const out = card(own, fin);
    for (const b of ["Approve", "Send back", "Decline"]) expect(has(out, b)).toBe(false);
    expect(has(out, "Withdraw")).toBe(true);
  });
  it("lets the National Coordinator decide only when the seat is empty", () => {
    expect(has(card(claim(), nc, "u-fin"), "Approve")).toBe(false);
    expect(has(card(claim(), nc, null), "Approve")).toBe(true);
  });
  it("shows the reimbursement clock", () => {
    expect(card(claim({ due_by: "2026-09-24" }), fin)).toContain("overdue");
    expect(card(claim({ due_by: "2026-10-20" }), fin)).toContain("Due in 25 days");
  });
});

describe("a draft, an approved and a paid claim", () => {
  it("lets the author edit, send up and withdraw a draft", () => {
    const out = card(claim({ status: "draft", due_by: null }), owner);
    for (const b of ["Edit", "Send for approval", "Withdraw"]) expect(has(out, b)).toBe(true);
  });
  it("shows the reviewer's note on a returned claim, and lets the author mend it", () => {
    const out = card(claim({ status: "returned", due_by: null, review_note: "Add the driver's name" }), owner);
    expect(out).toContain("Add the driver&#x27;s name");
    expect(has(out, "Edit")).toBe(true);
  });
  it("offers the Financial Secretary mark-as-paid on an approved claim, and no one else", () => {
    expect(has(card(claim({ status: "approved", due_by: null }), fin), "Mark as paid")).toBe(true);
    for (const who of [owner, treas, rc, admin]) expect(has(card(claim({ status: "approved", due_by: null }), who), "Mark as paid")).toBe(false);
  });
  it("offers nothing but details once a claim is paid", () => {
    const out = card(claim({ status: "paid", due_by: null, paid_on: "2026-09-25", payment_ref: "TRF-1" }), fin);
    for (const b of ["Approve", "Mark as paid", "Withdraw", "Edit"]) expect(has(out, b)).toBe(false);
  });
});

describe("the decision box", () => {
  it("needs a note to send back or decline, not to approve within budget", () => {
    const within = renderToStaticMarkup(<DecisionBox decision="approve" claim={claim()} remainingKobo={1000000} busy={false} onConfirm={noop} onCancel={noop} />);
    expect(within).toContain("optional");
    const back = renderToStaticMarkup(<DecisionBox decision="return" claim={claim()} remainingKobo={null} busy={false} onConfirm={noop} onCancel={noop} />);
    expect(back).toContain("required");
  });
  it("warns and demands a note when an approval goes over budget", () => {
    const over = renderToStaticMarkup(<DecisionBox decision="approve" claim={claim({ amount_kobo: 900000 })} remainingKobo={100000} busy={false} onConfirm={noop} onCancel={noop} />);
    expect(over).toContain("over its approved budget");
    expect(over).toContain("₦8,000"); // 900000 - 100000 kobo
  });
});

describe("the pay box", () => {
  it("says the Hub does not move money", () => {
    const out = renderToStaticMarkup(<PayBox claim={claim()} busy={false} onConfirm={noop} onCancel={noop} />);
    expect(out).toContain("does not move money");
    expect(out).toContain("Payment reference");
  });
});

describe("a budget card", () => {
  const row = {
    programme_id: "p1", title: "School visit", chapter_name: "Benin", programme_date: "2026-09-01",
    status: "Approved", approved_kobo: 5000000, committed_kobo: 1000000, paid_kobo: 2000000,
    pending_kobo: 0, remaining_kobo: 2000000, reported_kobo: 0,
  };
  it("shows a revise button only to the officer", () => {
    expect(renderToStaticMarkup(<BudgetCard row={row} officer={true} onRevise={noop} />)).toContain("Revise budget");
    expect(renderToStaticMarkup(<BudgetCard row={row} officer={false} onRevise={noop} />)).not.toContain("Revise budget");
  });
  it("shows an over-budget row as over, not as a negative amount left", () => {
    const over = { ...row, committed_kobo: 4000000, paid_kobo: 2000000, remaining_kobo: -1000000 };
    expect(renderToStaticMarkup(<BudgetCard row={over} officer={false} onRevise={noop} />)).toContain("₦10,000 over");
  });
});

describe("the card in the More grid", () => {
  const finance = (who) => visibleMoreFeatures(who).find((f) => f.id === "finance");
  it("is shown to everyone, because anyone can make a claim", () => {
    for (const who of [owner, fin, nc, treas, rc, member, admin]) expect(finance(who)).toBeTruthy();
  });
  it("carries the finance screen", () => {
    expect(finance(member).title).toBe("Finance");
  });
});
