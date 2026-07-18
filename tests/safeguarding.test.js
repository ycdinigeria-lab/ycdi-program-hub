import { describe, it, expect } from "vitest";
import { retentionYears, scenarioLabel, SCENARIOS } from "../src/sections/SafeguardingSection.jsx";

describe("retention", () => {
  it("keeps a young child's record until they would turn 25", () => {
    expect(retentionYears("10-12")).toBe(15);
    expect(retentionYears("13-15")).toBe(12);
  });
  it("falls back to the seven year floor once that is longer", () => {
    expect(retentionYears("16-17")).toBe(9);
    expect(retentionYears("18+")).toBe(7);
  });
  it("never goes below seven years", () => {
    ["10-12", "13-15", "16-17", "18+"].forEach((b) => expect(retentionYears(b)).toBeGreaterThanOrEqual(7));
  });
  it("assumes the youngest age in the band, so it errs towards keeping longer", () => {
    // 13-15 assuming 13 gives 12 years. Assuming 15 would give only 10.
    expect(retentionYears("13-15")).toBeGreaterThan(25 - 15);
  });
});

describe("scenarios", () => {
  it("covers all five from the reporting procedures", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      "disclosure", "observation", "third_party", "allegation_staff", "immediate_danger",
    ]);
  });
  it("gives every scenario its own steps", () => {
    SCENARIOS.forEach((s) => expect(s.steps.length).toBeGreaterThan(0));
  });
  it("names a scenario in plain words", () => {
    expect(scenarioLabel("allegation_staff")).toMatch(/YCDI person/);
  });
});
