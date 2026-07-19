import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS,
  STATUSES,
  statusLabel,
  statusTone,
  parseDay,
  daysBetween,
  serviceMonths,
  certificateDue,
  onboardingProgress,
  onboardingStalled,
  contactOverdue,
  describeRecord,
  formatDay,
} from "../src/lib/volunteer.js";

// BATCH6A-MARKER volunteer-tests

const day = (s) => s; // records carry plain 'YYYY-MM-DD' strings, as Postgres sends them

describe("the six onboarding steps", () => {
  it("matches the Handbook, section 2.1, in order", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual([
      "applied_on",
      "interviewed_on",
      "references_received_on",
      "safeguarding_declaration_on",
      "orientation_on",
      "activated_on",
    ]);
  });

  it("has six of them and not five or seven", () => {
    expect(ONBOARDING_STEPS).toHaveLength(6);
  });
});

describe("parsing a date", () => {
  it("reads a plain date as the day it says, not shifted by a timezone", () => {
    const d = parseDay("2026-03-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(1);
  });

  it("gives back nothing for empty, rubbish or missing values", () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay("not a date")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("passes a real Date through untouched", () => {
    const d = new Date(2026, 0, 15);
    expect(parseDay(d)).toBe(d);
  });

  it("rejects an invalid Date rather than passing it on", () => {
    expect(parseDay(new Date("nonsense"))).toBeNull();
  });
});

describe("counting days", () => {
  it("counts forwards", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
  });

  it("counts backwards as a negative", () => {
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
  });

  it("gives nothing when either end is missing", () => {
    expect(daysBetween(null, "2026-01-01")).toBeNull();
    expect(daysBetween("2026-01-01", null)).toBeNull();
  });

  it("survives a clock change without drifting a day", () => {
    // Whole months across a daylight-saving boundary in either hemisphere.
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-10-01", "2026-11-01")).toBe(31);
  });
});

describe("length of service", () => {
  it("counts whole months only", () => {
    expect(serviceMonths({ started_on: day("2025-01-15") }, new Date(2026, 0, 14))).toBe(11);
    expect(serviceMonths({ started_on: day("2025-01-15") }, new Date(2026, 0, 15))).toBe(12);
  });

  it("stops at the end date when service has ended", () => {
    const rec = { started_on: "2024-01-01", ended_on: "2024-07-01" };
    expect(serviceMonths(rec, new Date(2026, 5, 1))).toBe(6);
  });

  it("is nothing at all when there is no start date", () => {
    expect(serviceMonths({ started_on: null }, new Date(2026, 0, 1))).toBeNull();
    expect(serviceMonths(null)).toBeNull();
  });

  it("never goes negative when the dates are the wrong way round", () => {
    expect(serviceMonths({ started_on: "2026-06-01", ended_on: "2026-01-01" }, new Date(2026, 6, 1))).toBe(0);
  });

  it("handles a start on the 31st rolling into a short month", () => {
    // Started 31 Jan. On 28 Feb that is not yet a month.
    expect(serviceMonths({ started_on: "2026-01-31" }, new Date(2026, 1, 28))).toBe(0);
    expect(serviceMonths({ started_on: "2026-01-31" }, new Date(2026, 2, 31))).toBe(2);
  });
});

describe("certificate of service, Handbook 5.2", () => {
  it("is due at twelve months and not before", () => {
    const start = { started_on: "2025-04-01", status: "active" };
    expect(certificateDue(start, new Date(2026, 2, 31))).toBe(false);
    expect(certificateDue(start, new Date(2026, 3, 1))).toBe(true);
  });

  it("is not due twice", () => {
    const rec = { started_on: "2020-01-01", status: "active", certificate_issued_on: "2021-01-05" };
    expect(certificateDue(rec, new Date(2026, 0, 1))).toBe(false);
  });

  it("still counts for somebody who withdrew after serving their time", () => {
    const rec = { started_on: "2022-01-01", ended_on: "2024-01-01", status: "withdrawn" };
    expect(certificateDue(rec, new Date(2026, 0, 1))).toBe(true);
  });

  it("is refused to anyone removed or suspended, however long they served", () => {
    const base = { started_on: "2018-01-01", ended_on: "2025-01-01" };
    expect(certificateDue({ ...base, status: "removed" }, new Date(2026, 0, 1))).toBe(false);
    expect(certificateDue({ ...base, status: "suspended" }, new Date(2026, 0, 1))).toBe(false);
  });

  it("is not due for somebody with no start date recorded", () => {
    expect(certificateDue({ status: "active" }, new Date(2026, 0, 1))).toBe(false);
  });
});

describe("onboarding progress", () => {
  it("counts nothing for an empty record", () => {
    const p = onboardingProgress({});
    expect(p.done).toBe(0);
    expect(p.total).toBe(6);
    expect(p.complete).toBe(false);
    expect(p.next.key).toBe("applied_on");
  });

  it("names the first missing step as the one to chase", () => {
    const p = onboardingProgress({ applied_on: "2026-01-05", interviewed_on: "2026-01-12" });
    expect(p.done).toBe(2);
    expect(p.next.key).toBe("references_received_on");
  });

  it("knows when all six are in", () => {
    const rec = {};
    ONBOARDING_STEPS.forEach((s) => { rec[s.key] = "2026-01-01"; });
    const p = onboardingProgress(rec);
    expect(p.complete).toBe(true);
    expect(p.next).toBeNull();
    expect(p.outOfOrder).toBe(false);
  });

  it("notices a later step recorded before an earlier one", () => {
    const p = onboardingProgress({ applied_on: "2026-01-05", orientation_on: "2026-02-01" });
    expect(p.outOfOrder).toBe(true);
    expect(p.next.key).toBe("interviewed_on");
  });

  it("copes with no record at all rather than throwing", () => {
    const p = onboardingProgress(null);
    expect(p.done).toBe(0);
    expect(p.steps).toHaveLength(6);
  });
});

describe("onboarding that has stalled", () => {
  it("flags somebody who has not moved in over a month", () => {
    const rec = { status: "onboarding", applied_on: "2026-01-05" };
    expect(onboardingStalled(rec, new Date(2026, 2, 1))).toBe(true);
  });

  it("leaves a recent applicant alone", () => {
    const rec = { status: "onboarding", applied_on: "2026-01-05" };
    expect(onboardingStalled(rec, new Date(2026, 0, 20))).toBe(false);
  });

  it("runs the clock from the most recent step, not the first", () => {
    const rec = { status: "onboarding", applied_on: "2026-01-05", interviewed_on: "2026-02-20" };
    expect(onboardingStalled(rec, new Date(2026, 2, 1))).toBe(false);
  });

  it("says nothing about somebody already active", () => {
    const rec = { status: "active", applied_on: "2020-01-05" };
    expect(onboardingStalled(rec, new Date(2026, 0, 1))).toBe(false);
  });

  it("says nothing when no step has been recorded at all", () => {
    // Nothing to measure from. A record with no dates is a different
    // problem from a record that stopped moving.
    expect(onboardingStalled({ status: "onboarding" }, new Date(2026, 0, 1))).toBe(false);
  });

  it("takes the number of days as an argument rather than assuming one", () => {
    const rec = { status: "onboarding", applied_on: "2026-01-05" };
    expect(onboardingStalled(rec, new Date(2026, 0, 20), 10)).toBe(true);
    expect(onboardingStalled(rec, new Date(2026, 0, 20), 60)).toBe(false);
  });
});

describe("pastoral contact, Handbook 5.4", () => {
  it("flags an active volunteer nobody has spoken to in months", () => {
    const rec = { status: "active", last_contact_on: "2026-01-01" };
    expect(contactOverdue(rec, new Date(2026, 5, 1))).toBe(true);
  });

  it("is satisfied by a recent conversation", () => {
    const rec = { status: "active", last_contact_on: "2026-05-20" };
    expect(contactOverdue(rec, new Date(2026, 5, 1))).toBe(false);
  });

  it("treats never having made contact as overdue rather than fine", () => {
    expect(contactOverdue({ status: "active", last_contact_on: null }, new Date(2026, 5, 1))).toBe(true);
  });

  it("does not chase contact with somebody who has withdrawn", () => {
    const rec = { status: "withdrawn", last_contact_on: null };
    expect(contactOverdue(rec, new Date(2026, 5, 1))).toBe(false);
  });
});

describe("status labels", () => {
  it("covers every status the database will accept", () => {
    ["onboarding", "active", "inactive", "withdrawn", "suspended", "removed"].forEach((k) => {
      expect(STATUSES.some((s) => s.key === k)).toBe(true);
      expect(statusLabel(k)).not.toBe("Unknown");
    });
  });

  it("does not pretend to recognise a status it has never seen", () => {
    expect(statusLabel("banana")).toBe("Unknown");
    expect(statusTone("banana")).toBe("closed");
  });
});

describe("the sentence shown to the volunteer", () => {
  it("says where somebody is in onboarding", () => {
    const s = describeRecord({ status: "onboarding", applied_on: "2026-01-05" }, new Date(2026, 0, 20));
    expect(s).toContain("1 of 6");
    expect(s.toLowerCase()).toContain("interview");
  });

  it("counts years properly once past twelve months", () => {
    expect(describeRecord({ status: "active", started_on: "2024-01-01" }, new Date(2026, 2, 1)))
      .toBe("Active volunteer, 2 years and 2 months of service.");
    expect(describeRecord({ status: "active", started_on: "2025-01-01" }, new Date(2026, 0, 1)))
      .toBe("Active volunteer, one year of service.");
  });

  it("does not say 'null months' when there is no start date", () => {
    const s = describeRecord({ status: "active" }, new Date(2026, 0, 1));
    expect(s).toBe("Active volunteer.");
    expect(s).not.toContain("null");
  });

  it("handles somebody with no record at all", () => {
    expect(describeRecord(null)).toContain("do not have a volunteer record");
  });
});

describe("showing a date", () => {
  it("writes it the way a Nigerian reader expects, day first", () => {
    expect(formatDay("2026-03-09")).toBe("9 Mar 2026");
  });

  it("shows nothing rather than 'Invalid Date'", () => {
    expect(formatDay(null)).toBe("");
    expect(formatDay("rubbish")).toBe("");
  });
});
