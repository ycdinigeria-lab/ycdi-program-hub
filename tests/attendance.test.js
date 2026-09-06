import { describe, it, expect } from "vitest";
import { registerNote } from "../src/sections/AttendanceSection.jsx";

// BATCH12-MARKER attendance-copy
//
// The line the programme picker shows under each event. Getting the plural
// wrong, or saying "0 people" instead of "not taken yet", is the kind of
// small wrongness that makes a coordinator distrust the whole number.

describe("register note", () => {
  it("says nothing has been taken when the count is zero", () => {
    expect(registerNote(0)).toMatch(/no register taken/i);
    expect(registerNote(undefined)).toMatch(/no register taken/i);
  });
  it("uses the singular for exactly one person", () => {
    expect(registerNote(1)).toBe("1 person recorded");
  });
  it("uses the plural for more than one", () => {
    expect(registerNote(2)).toBe("2 people recorded");
    expect(registerNote(40)).toBe("40 people recorded");
  });
});
