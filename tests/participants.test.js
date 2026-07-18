import { describe, it, expect } from "vitest";
import { isMinorBand, STAGES, AGE_BANDS } from "../src/sections/ParticipantsSection.jsx";

describe("age bands", () => {
  it("treats every band below 18 as a minor", () => {
    expect(isMinorBand("10-12")).toBe(true);
    expect(isMinorBand("13-15")).toBe(true);
    expect(isMinorBand("16-17")).toBe(true);
  });
  it("treats 18 and over as an adult", () => {
    expect(isMinorBand("18+")).toBe(false);
  });
  it("offers only the four agreed bands", () => {
    expect(AGE_BANDS).toEqual(["10-12", "13-15", "16-17", "18+"]);
  });
  it("has no band that could hold a date of birth", () => {
    AGE_BANDS.forEach((b) => expect(b).not.toMatch(/\d{4}/));
  });
});

describe("the pathway", () => {
  it("runs in the order the framework sets out", () => {
    expect(STAGES).toEqual(["Contact", "Connect", "Commit", "Grow", "Multiply"]);
  });
});
