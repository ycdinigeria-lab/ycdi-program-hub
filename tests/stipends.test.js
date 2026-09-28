// BATCH39-MARKER stipends-lib-tests
import { describe, it, expect } from "vitest";
import {
  canReadStipends, thisMonth, monthToDate, dateToMonth, addMonths, monthLabel, spanLabel,
  activeIn, endedBy, suggestLabel, candidateLine, validateRecipient, validatePayment,
  looksLikeAccountNumber, sheetTotals, yearPosition,
} from "../src/lib/stipends.js";

describe("who reads stipends", () => {
  it("is the NC, the Financial Secretary and the Treasurer", () => {
    expect(canReadStipends({ role: "NC", portfolios: [] })).toBe(true);
    expect(canReadStipends({ role: "TM", portfolios: ["FIN"] })).toBe(true);
    expect(canReadStipends({ role: "TM", portfolios: ["TREAS"] })).toBe(true);
  });
  it("is not the Deputy, a coordinator, a member or a plain admin", () => {
    expect(canReadStipends({ role: "TM", portfolios: ["DNC"] })).toBe(false);
    expect(canReadStipends({ role: "RC", portfolios: [] })).toBe(false);
    expect(canReadStipends({ role: "TM", portfolios: [] })).toBe(false);
    expect(canReadStipends({ role: "TM", is_admin: true, portfolios: [] })).toBe(false);
    expect(canReadStipends(null)).toBe(false);
  });
});

describe("months", () => {
  it("round-trips between the screen and the database", () => {
    expect(thisMonth("2026-09-28")).toBe("2026-09");
    expect(monthToDate("2026-09")).toBe("2026-09-01");
    expect(dateToMonth("2026-09-01")).toBe("2026-09");
    expect(monthToDate("")).toBe(null);
  });
  it("adds and takes away months across a year end", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-09", -14)).toBe("2025-07");
  });
  it("labels months and spans in plain words", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(spanLabel("2026-07-01", null)).toBe("From July 2026");
    expect(spanLabel("2026-07-01", "2026-12-01")).toBe("July to December 2026");
    expect(spanLabel("2026-07-01", "2027-03-01")).toBe("July 2026 to March 2027");
    expect(spanLabel("2026-07-01", "2026-07-01")).toBe("July 2026 only");
  });
  it("knows when a stipend is running", () => {
    const r = { start_month: "2026-07-01", end_month: "2026-12-01" };
    expect(activeIn(r, "2026-06")).toBe(false);
    expect(activeIn(r, "2026-07")).toBe(true);
    expect(activeIn(r, "2026-12")).toBe(true);
    expect(activeIn(r, "2027-01")).toBe(false);
    expect(activeIn({ start_month: "2026-07-01", end_month: null }, "2030-01")).toBe(true);
    expect(endedBy(r, "2027-01")).toBe(true);
    expect(endedBy(r, "2026-12")).toBe(false);
  });
});

describe("adding someone", () => {
  it("suggests a label from the seat, the role and the chapter", () => {
    expect(suggestLabel({ role: "TM", seats: ["SEC"] })).toBe("National Secretary");
    expect(suggestLabel({ role: "NC", seats: [] })).toBe("National Coordinator");
    expect(suggestLabel({ role: "RC", seats: [], chapter_name: "Benin" })).toBe("Regional Coordinator, Benin");
    expect(suggestLabel({ role: "TM", seats: [], role_title: "Choir lead" })).toBe("Choir lead");
    expect(suggestLabel({ role: "TM", seats: ["TREAS"] })).toBe("");
  });
  it("describes a candidate in one line", () => {
    expect(candidateLine({ role: "RC", seats: [], chapter_name: "Auchi" })).toBe("Regional Coordinator · Auchi");
    expect(candidateLine({ role: "TM", seats: ["SEC"], chapter_name: "Lagos" })).toBe("National Secretary · Lagos");
    expect(candidateLine({ role: "TM", seats: [] })).toBe("Team member");
  });
  const good = { profile_id: "p1", role_label: "Regional Coordinator, Benin", monthly: "30,000", start: "2026-09", end: "", approval_ref: "", note: "" };
  it("accepts a complete new entry and turns it into kobo and first-of-month dates", () => {
    const r = validateRecipient(good, { isNew: true });
    expect(r.ok).toBe(true);
    expect(r.values).toEqual({
      p_profile: "p1", p_monthly_kobo: 3000000, p_start_month: "2026-09-01", p_end_month: null,
      p_role_label: "Regional Coordinator, Benin", p_approval_ref: null, p_note: null,
    });
  });
  it("needs a person, a label, an amount and a start", () => {
    expect(validateRecipient({ ...good, profile_id: null }, { isNew: true }).error).toMatch(/person/);
    expect(validateRecipient({ ...good, role_label: " " }, { isNew: true }).error).toMatch(/for/);
    expect(validateRecipient({ ...good, monthly: "" }, { isNew: true }).ok).toBe(false);
    expect(validateRecipient({ ...good, start: "" }, { isNew: true }).error).toMatch(/starts/);
  });
  it("refuses an end before the start and an amount over the ceiling", () => {
    expect(validateRecipient({ ...good, end: "2026-08" }, { isNew: true }).error).toMatch(/before/);
    expect(validateRecipient({ ...good, monthly: "10000001" }, { isNew: true }).error).toMatch(/too large/);
    expect(validateRecipient({ ...good, monthly: "60000000" }, { isNew: true }).error).toMatch(/too large/);
  });
  it("does not send a person when changing an entry", () => {
    expect(validateRecipient(good, { isNew: false }).values.p_profile).toBe(null);
  });
});

describe("recording a payment", () => {
  const today = "2026-09-28";
  const good = { amount: "30000", paid_on: "2026-09-27", ref: "TRF-2231", note: "" };
  it("accepts the monthly rate with a date and a reference", () => {
    const r = validatePayment(good, { monthlyKobo: 3000000, today });
    expect(r.ok).toBe(true);
    expect(r.values).toEqual({ p_amount_kobo: 3000000, p_paid_on: "2026-09-27", p_ref: "TRF-2231", p_note: null });
  });
  it("refuses a future date, a missing reference and an account number", () => {
    expect(validatePayment({ ...good, paid_on: "2026-09-29" }, { monthlyKobo: 3000000, today }).error).toMatch(/future/);
    expect(validatePayment({ ...good, ref: " " }, { monthlyKobo: 3000000, today }).error).toMatch(/reference/);
    expect(validatePayment({ ...good, ref: "0123456789" }, { monthlyKobo: 3000000, today }).error).toMatch(/account number/);
    expect(looksLikeAccountNumber(" 0123456789 ")).toBe(true);
    expect(looksLikeAccountNumber("TRF0123456789")).toBe(false);
  });
  it("asks for a note when the amount is not the monthly rate", () => {
    expect(validatePayment({ ...good, amount: "15000" }, { monthlyKobo: 3000000, today }).error).toMatch(/note/);
    expect(validatePayment({ ...good, amount: "15000", note: "Half month" }, { monthlyKobo: 3000000, today }).ok).toBe(true);
  });
});

describe("totals", () => {
  it("adds up a month's sheet", () => {
    const rows = [
      { monthly_kobo: 3000000, payment_id: "a", paid_kobo: 3000000 },
      { monthly_kobo: 7500000, payment_id: null },
      { monthly_kobo: 4500000, payment_id: "b", paid_kobo: 2000000 },
    ];
    expect(sheetTotals(rows)).toEqual({ due: 15000000, paid: 5000000, paidCount: 2, waitingCount: 1, count: 3 });
  });
  it("flags a list that commits more than the budget", () => {
    expect(yearPosition({ has_budget: true, planned_kobo: 100, committed_kobo: 150, paid_kobo: 40 }))
      .toEqual({ planned: 100, committed: 150, paid: 40, hasPlan: true, overPlan: true, gap: -50 });
    expect(yearPosition({ has_budget: false, planned_kobo: 0, committed_kobo: 150, paid_kobo: 0 }).hasPlan).toBe(false);
    expect(yearPosition(null)).toBe(null);
  });
});
