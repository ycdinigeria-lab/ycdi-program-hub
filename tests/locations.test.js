import { describe, it, expect } from "vitest";
import { COUNTRIES, NG_STATES, subdivisionsFor, hasSubdivisions } from "../src/data/locations.js";

// BATCH14-MARKER application-location

describe("the country list", () => {
  it("offers a wide list of countries", () => {
    expect(COUNTRIES.length).toBeGreaterThan(150);
  });
  it("puts Nigeria first, since that is nearly always the answer", () => {
    expect(COUNTRIES[0]).toBe("Nigeria");
  });
  it("ends with an Other option for anywhere not listed", () => {
    expect(COUNTRIES).toContain("Other");
  });
  it("holds no duplicates", () => {
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  });
});

describe("Nigeria's states", () => {
  it("is the 36 states plus the Federal Capital Territory", () => {
    expect(NG_STATES.length).toBe(37);
  });
  it("includes the FCT and a couple of well-known states", () => {
    expect(NG_STATES.some((s) => /Federal Capital Territory/i.test(s))).toBe(true);
    expect(NG_STATES).toContain("Lagos");
    expect(NG_STATES).toContain("Kano");
  });
  it("holds no duplicates", () => {
    expect(new Set(NG_STATES).size).toBe(NG_STATES.length);
  });
});

describe("looking up subdivisions", () => {
  it("gives Nigeria its full state list", () => {
    expect(subdivisionsFor("Nigeria")).toHaveLength(37);
    expect(hasSubdivisions("Nigeria")).toBe(true);
  });
  it("gives a country we do not list an empty list, which means a text box", () => {
    expect(subdivisionsFor("United Kingdom")).toEqual([]);
    expect(hasSubdivisions("United Kingdom")).toBe(false);
    expect(hasSubdivisions("Somewhere Made Up")).toBe(false);
  });
});
