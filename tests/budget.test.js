// BATCH35-MARKER budget-lib
import { describe, it, expect } from "vitest";
import {
  BUDGET_STATUSES, STATUS_WORD, CATEGORIES, CATEGORY_LABEL, EVENT_WORD,
  canPrepareBudget, canApproveBudget, canReadBudget, budgetActions, ACTION_LABEL,
  progress, plannedTotals, validateLine, formatNaira,
} from "../src/lib/budget.js";

describe("status and labels", () => {
  it("names every status, category and event", () => {
    for (const s of BUDGET_STATUSES) expect(STATUS_WORD[s]).toBeTruthy();
    expect(CATEGORY_LABEL.donations).toBe("Donations");
    expect(CATEGORY_LABEL.programmes).toBe("Programmes");
    expect(CATEGORIES.income.map(([k]) => k)).toContain("grants");
    for (const k of ["annual_created", "annual_submitted", "annual_approved", "annual_status", "annual_line"]) expect(EVENT_WORD[k]).toBeTruthy();
  });
});

describe("who reaches the budget", () => {
  const nc = { role: "NC", portfolios: [] };
  const fin = { role: "TM", portfolios: ["FIN"] };
  const treas = { role: "TM", portfolios: ["TREAS"] };
  const dnc = { role: "TM", portfolios: ["DNC"] };
  const rc = { role: "RC", chapter_id: "ch", portfolios: [] };
  const member = { role: "TM", portfolios: [] };
  const admin = { role: "TM", is_admin: true, portfolios: [] };

  it("the NC and the Financial Secretary prepare", () => {
    expect(canPrepareBudget(nc)).toBe(true);
    expect(canPrepareBudget(fin)).toBe(true);
    for (const who of [treas, dnc, rc, member, admin]) expect(canPrepareBudget(who)).toBe(false);
  });
  it("the NC and the Treasurer approve, but not the Financial Secretary", () => {
    expect(canApproveBudget(nc)).toBe(true);
    expect(canApproveBudget(treas)).toBe(true);
    expect(canApproveBudget(fin)).toBe(false);
    for (const who of [dnc, rc, member, admin]) expect(canApproveBudget(who)).toBe(false);
  });
  it("the Deputy and the Treasurer read, but a member and an admin do not", () => {
    for (const who of [nc, fin, treas, dnc]) expect(canReadBudget(who)).toBe(true);
    for (const who of [member, admin]) expect(canReadBudget(who)).toBe(false);
  });
});

describe("the moves a budget offers", () => {
  const fin = { role: "TM", portfolios: ["FIN"] };
  const treas = { role: "TM", portfolios: ["TREAS"] };
  it("lets the preparer edit and submit a draft, and no one approve it yet", () => {
    expect(budgetActions(fin, "draft")).toEqual(["edit", "submit"]);
    expect(budgetActions(treas, "draft")).toEqual([]);
  });
  it("lets the approver, not the preparer, decide a submitted budget", () => {
    expect(budgetActions(treas, "submitted")).toEqual(["approve", "return"]);
    expect(budgetActions(fin, "submitted")).toEqual([]);
  });
  it("lets the approver activate or close an approved budget, and close an active one", () => {
    expect(budgetActions(treas, "board_approved")).toEqual(["activate", "close"]);
    expect(budgetActions(treas, "active")).toEqual(["close"]);
    expect(budgetActions(treas, "closed")).toEqual([]);
  });
  it("labels every action", () => {
    for (const a of ["edit", "submit", "approve", "return", "activate", "close"]) expect(ACTION_LABEL[a]).toBeTruthy();
  });
});

describe("plan against actuals", () => {
  it("gives a fraction, remaining and an over-plan flag", () => {
    const p = progress(1000, 400);
    expect(p.fraction).toBeCloseTo(0.4);
    expect(p.remaining).toBe(600);
    expect(p.over).toBe(false);
    const over = progress(100, 250);
    expect(over.fraction).toBe(1);
    expect(over.over).toBe(true);
    expect(over.remaining).toBe(-150);
  });
  it("handles a zero plan", () => {
    expect(progress(0, 0).fraction).toBe(0);
    expect(progress(0, 50).fraction).toBe(1);
  });
  it("sums planned lines by side", () => {
    const t = plannedTotals([
      { kind: "income", planned_kobo: 200 }, { kind: "income", planned_kobo: 300 },
      { kind: "expenditure", planned_kobo: 150 },
    ]);
    expect(t.income).toBe(500);
    expect(t.expenditure).toBe(150);
  });
});

describe("the line form", () => {
  const base = { kind: "expenditure", category: "programmes", label: "Benin", planned: "8,000,000" };
  it("turns naira into kobo and trims the label", () => {
    const r = validateLine({ ...base, label: "  Benin  " });
    expect(r.ok).toBe(true);
    expect(r.values.p_planned_kobo).toBe(800000000);
    expect(r.values.p_label).toBe("Benin");
  });
  it("needs a kind, category and label", () => {
    expect(validateLine({ ...base, kind: "" }).ok).toBe(false);
    expect(validateLine({ ...base, category: "" }).ok).toBe(false);
    expect(validateLine({ ...base, label: " " }).ok).toBe(false);
  });
  it("passes a blank plan through as zero but rejects a bad one", () => {
    expect(validateLine({ ...base, planned: "" }).values.p_planned_kobo).toBe(0);
    expect(validateLine({ ...base, planned: "abc" }).ok).toBe(false);
  });
  it("formats naira like the rest of finance", () => {
    expect(formatNaira(800000000)).toBe("₦8,000,000");
  });
});
