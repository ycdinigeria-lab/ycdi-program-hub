// BATCH37-MARKER concept-note-v2
import { describe, it, expect } from "vitest";
import {
  needsComplete, alignmentComplete, alignmentBlocked, alignmentWeak,
  digitalSafeguardingRequired, digitalSafeguardingComplete, gateComplete,
  approvalLevel, approvalLevelInfo, missionTestPasses,
} from "../src/lib/programmes.js";

const needsFull = {
  needs_evidence: "Attendance data shows a drop",
  needs_gap: "No follow-up programme exists",
  needs_beneficiary_voice: "Students asked for it directly",
  needs_alternative: "No existing programme covers this",
};
const alignStrong = { align_reach: "Strong", align_roots: "Partial", align_resources: "Strong", align_raise: "Partial", align_reputation: "Strong" };

describe("needsComplete", () => {
  it("requires all four questions answered, non-blank", () => {
    expect(needsComplete({})).toBe(false);
    expect(needsComplete({ ...needsFull, needs_gap: "   " })).toBe(false);
    expect(needsComplete(needsFull)).toBe(true);
  });
});

describe("alignment", () => {
  it("is incomplete until all five priorities are rated", () => {
    expect(alignmentComplete({})).toBe(false);
    expect(alignmentComplete({ ...alignStrong, align_raise: "" })).toBe(false);
    expect(alignmentComplete(alignStrong)).toBe(true);
  });

  it("blocks at 3 or more None ratings, not 2", () => {
    const twoNone = { align_reach: "None", align_roots: "None", align_resources: "Strong", align_raise: "Strong", align_reputation: "Strong" };
    const threeNone = { ...twoNone, align_resources: "None" };
    expect(alignmentBlocked(twoNone)).toBe(false);
    expect(alignmentBlocked(threeNone)).toBe(true);
  });

  it("flags weak (no Strong, or 2 None) without blocking", () => {
    const noStrong = { align_reach: "Partial", align_roots: "Partial", align_resources: "Partial", align_raise: "Partial", align_reputation: "Partial" };
    expect(alignmentWeak(noStrong)).toBe(true);
    expect(alignmentBlocked(noStrong)).toBe(false);
    expect(alignmentWeak(alignStrong)).toBe(false);
  });

  it("is neither blocked nor weak while incomplete", () => {
    expect(alignmentBlocked({})).toBe(false);
    expect(alignmentWeak({})).toBe(false);
  });
});

describe("digital safeguarding", () => {
  it("is only required for Virtual or Hybrid", () => {
    expect(digitalSafeguardingRequired({ delivery_format: "Physical" })).toBe(false);
    expect(digitalSafeguardingRequired({ delivery_format: "Virtual" })).toBe(true);
    expect(digitalSafeguardingRequired({ delivery_format: "Hybrid" })).toBe(true);
  });

  it("is complete when not required, or when filled in", () => {
    expect(digitalSafeguardingComplete({ delivery_format: "Physical" })).toBe(true);
    expect(digitalSafeguardingComplete({ delivery_format: "Virtual" })).toBe(false);
    expect(digitalSafeguardingComplete({ delivery_format: "Virtual", digital_safeguarding: "  " })).toBe(false);
    expect(digitalSafeguardingComplete({ delivery_format: "Virtual", digital_safeguarding: "Co-facilitator on every call." })).toBe(true);
  });
});

describe("gateComplete", () => {
  const base = { ...needsFull, ...alignStrong, delivery_format: "Physical" };

  it("passes a fully answered physical note", () => {
    expect(gateComplete(base)).toBe(true);
  });

  it("fails on missing needs, missing alignment, 3+ None, or missing format", () => {
    expect(gateComplete({ ...base, needs_gap: "" })).toBe(false);
    expect(gateComplete({ ...base, align_raise: "" })).toBe(false);
    expect(gateComplete({ ...base, align_reach: "None", align_roots: "None", align_resources: "None" })).toBe(false);
    expect(gateComplete({ ...base, delivery_format: "" })).toBe(false);
  });

  it("fails a virtual note with no digital safeguarding plan, passes once it has one", () => {
    expect(gateComplete({ ...base, delivery_format: "Virtual" })).toBe(false);
    expect(gateComplete({ ...base, delivery_format: "Virtual", digital_safeguarding: "Co-facilitator on every call." })).toBe(true);
  });
});

describe("approval level (section 1.15)", () => {
  it("follows the Financial Policy Manual thresholds", () => {
    expect(approvalLevel(0)).toBe(3);
    expect(approvalLevel(500000)).toBe(3);
    expect(approvalLevel(500001)).toBe(4);
    expect(approvalLevel(2000000)).toBe(4);
    expect(approvalLevel(2000001)).toBe(5);
    expect(approvalLevel(null)).toBe(3);
  });

  it("names the right approver and needs flag per level", () => {
    expect(approvalLevelInfo(100000)).toMatchObject({ level: 3, needsTreasurer: false, needsBoard: false });
    expect(approvalLevelInfo(1000000)).toMatchObject({ level: 4, needsTreasurer: true, needsBoard: false });
    expect(approvalLevelInfo(5000000)).toMatchObject({ level: 5, needsTreasurer: false, needsBoard: true });
  });
});

describe("missionTestPasses (section 1.6 applied to a saved programme)", () => {
  it("fails when alignment isn't recorded at all (older programmes)", () => {
    expect(missionTestPasses({})).toBe(false);
  });

  it("passes with at least one Strong and no more than one None", () => {
    expect(missionTestPasses(alignStrong)).toBe(true);
    const oneNone = { ...alignStrong, align_raise: "None" };
    expect(missionTestPasses(oneNone)).toBe(true);
  });

  it("fails with no Strong, or with two or more None", () => {
    const noStrong = { align_reach: "Partial", align_roots: "Partial", align_resources: "Partial", align_raise: "Partial", align_reputation: "Partial" };
    expect(missionTestPasses(noStrong)).toBe(false);
    const twoNone = { ...alignStrong, align_raise: "None", align_roots: "None" };
    expect(missionTestPasses(twoNone)).toBe(false);
  });
});
