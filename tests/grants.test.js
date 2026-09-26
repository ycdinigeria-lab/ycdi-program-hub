// BATCH33-MARKER grants-lib
import { describe, it, expect } from "vitest";
import {
  GRANT_STATUSES, STATUS_WORD, nextStatuses, OBLIGATION_KINDS, OBLIGATION_KIND_LABEL,
  OBLIGATION_STATUS_WORD, obligationDue, canManageGrants, canReadGrants, canFundProgrammes,
  spentFraction, validateGrant, formatNaira,
} from "../src/lib/grants.js";

describe("grant status flow", () => {
  it("has a word for every status", () => {
    for (const s of GRANT_STATUSES) expect(STATUS_WORD[s]).toBeTruthy();
  });
  it("walks forward through the funnel and can be declined from a live stage", () => {
    expect(nextStatuses("prospect")).toEqual(["applied", "declined"]);
    expect(nextStatuses("applied")).toEqual(["awarded", "declined"]);
    expect(nextStatuses("awarded")).toEqual(["active", "declined"]);
    expect(nextStatuses("active")).toEqual(["reporting", "closed"]);
    expect(nextStatuses("reporting")).toEqual(["closed"]);
  });
  it("offers nothing once a grant is finished", () => {
    expect(nextStatuses("closed")).toEqual([]);
    expect(nextStatuses("declined")).toEqual([]);
  });
  it("only awarded, active or reporting grants can fund a programme", () => {
    expect(canFundProgrammes("awarded")).toBe(true);
    expect(canFundProgrammes("active")).toBe(true);
    expect(canFundProgrammes("reporting")).toBe(true);
    for (const s of ["prospect", "applied", "closed", "declined"]) expect(canFundProgrammes(s)).toBe(false);
  });
});

describe("obligations", () => {
  it("labels every kind and status", () => {
    expect(OBLIGATION_KINDS.map(([k]) => k)).toContain("acquittal");
    expect(OBLIGATION_KIND_LABEL.financial_report).toBe("Financial report");
    for (const s of ["pending", "submitted", "done", "waived"]) expect(OBLIGATION_STATUS_WORD[s]).toBeTruthy();
  });
  it("reads a pending deadline against the clock", () => {
    const at = (due) => obligationDue({ status: "pending", due_date: due }, "2026-09-26");
    expect(at("2026-10-30")).toMatchObject({ level: "ok", text: "Due in 34 days" });
    expect(at("2026-10-10")).toMatchObject({ level: "soon", text: "Due in 14 days" });
    expect(at("2026-10-11")).toMatchObject({ level: "ok", text: "Due in 15 days" });
    expect(at("2026-09-27")).toMatchObject({ level: "soon", text: "Due in 1 day" });
    expect(at("2026-09-26")).toMatchObject({ level: "soon", text: "Due today" });
    expect(at("2026-09-25")).toMatchObject({ level: "late", text: "1 day overdue" });
    expect(at("2026-09-16")).toMatchObject({ level: "late", text: "10 days overdue" });
  });
  it("shows a settled or waived deadline as closed, with no clock", () => {
    expect(obligationDue({ status: "submitted", due_date: "2026-01-01" }, "2026-09-26")).toMatchObject({ level: "done", text: "Submitted" });
    expect(obligationDue({ status: "done", due_date: "2026-01-01" }, "2026-09-26")).toMatchObject({ level: "done", text: "Done" });
    expect(obligationDue({ status: "waived", due_date: "2026-01-01" }, "2026-09-26")).toMatchObject({ level: "waived", text: "Waived" });
    expect(obligationDue(null)).toBeNull();
  });
});

describe("who reaches grants", () => {
  const nc = { role: "NC", portfolios: [] };
  const dnc = { role: "TM", portfolios: ["DNC"] };
  const fin = { role: "TM", portfolios: ["FIN"] };
  const treas = { role: "TM", portfolios: ["TREAS"] };
  const rc = { role: "RC", chapter_id: "ch", portfolios: [] };
  const member = { role: "TM", portfolios: [] };
  const admin = { role: "TM", is_admin: true, portfolios: [] };

  it("the NC, the Deputy and the Financial Secretary manage grants", () => {
    for (const who of [nc, dnc, fin]) expect(canManageGrants(who)).toBe(true);
  });
  it("the Treasurer, a coordinator, a member and an admin do not manage", () => {
    for (const who of [treas, rc, member, admin]) expect(canManageGrants(who)).toBe(false);
  });
  it("the Treasurer reads, but a plain member and a plain admin do not", () => {
    expect(canReadGrants(treas)).toBe(true);
    expect(canReadGrants(nc)).toBe(true);
    expect(canReadGrants(dnc)).toBe(true);
    for (const who of [member, admin]) expect(canReadGrants(who)).toBe(false);
  });
});

describe("spent fraction", () => {
  it("counts approved and paid against the award", () => {
    expect(spentFraction({ awarded_kobo: 1000, committed_kobo: 200, paid_kobo: 300 })).toBeCloseTo(0.5);
    expect(spentFraction({ awarded_kobo: 1000, committed_kobo: 0, paid_kobo: 0 })).toBe(0);
  });
  it("never exceeds one, and is zero when nothing was awarded", () => {
    expect(spentFraction({ awarded_kobo: 100, committed_kobo: 200, paid_kobo: 0 })).toBe(1);
    expect(spentFraction({ awarded_kobo: 0, committed_kobo: 5, paid_kobo: 5 })).toBe(0);
  });
});

describe("the grant form", () => {
  const base = { title: "Literacy", funder_name: "Ford", awarded: "5,000,000", is_restricted: false };
  it("turns naira into kobo and trims the text", () => {
    const r = validateGrant({ ...base, title: "  Literacy  " });
    expect(r.ok).toBe(true);
    expect(r.values.p_awarded_kobo).toBe(500000000);
    expect(r.values.p_title).toBe("Literacy");
  });
  it("insists a restricted grant says what it is restricted to", () => {
    expect(validateGrant({ ...base, is_restricted: true, restrictions: "" }).ok).toBe(false);
    expect(validateGrant({ ...base, is_restricted: true, restrictions: "Reading rooms" }).ok).toBe(true);
  });
  it("needs a title and a funder", () => {
    expect(validateGrant({ ...base, title: "  " }).error).toMatch(/title/i);
    expect(validateGrant({ ...base, funder_name: "" }).error).toMatch(/funder/i);
  });
  it("refuses a period that ends before it starts", () => {
    expect(validateGrant({ ...base, period_start: "2026-10-01", period_end: "2026-09-01" }).ok).toBe(false);
    expect(validateGrant({ ...base, period_start: "2026-01-01", period_end: "2026-12-31" }).ok).toBe(true);
  });
  it("passes a blank amount through as zero, but rejects a bad one", () => {
    expect(validateGrant({ ...base, awarded: "" }).values.p_awarded_kobo).toBe(0);
    expect(validateGrant({ ...base, awarded: "abc" }).ok).toBe(false);
  });
  it("formats naira the same way as the claims screen", () => {
    expect(formatNaira(500000000)).toBe("₦5,000,000");
  });
});
