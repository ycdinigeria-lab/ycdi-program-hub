import { describe, it, expect } from "vitest";
import { validateChapterName, cleanChapterName } from "../src/lib/chapters.js";

// BATCH14-MARKER chapter-admin

const existing = [
  { id: "a", name: "Benin" },
  { id: "b", name: "Lagos" },
];

describe("validating a chapter name", () => {
  it("accepts a genuinely new name", () => {
    expect(validateChapterName("Ibadan", existing)).toBeNull();
  });
  it("refuses an empty or whitespace name", () => {
    expect(validateChapterName("", existing)).toMatch(/name/i);
    expect(validateChapterName("   ", existing)).toMatch(/name/i);
  });
  it("refuses a one-letter name", () => {
    expect(validateChapterName("A", existing)).toMatch(/short/i);
  });
  it("refuses a duplicate, ignoring case and surrounding spaces", () => {
    expect(validateChapterName("lagos", existing)).toMatch(/already/i);
    expect(validateChapterName("  BENIN ", existing)).toMatch(/already/i);
  });
  it("lets a chapter keep its own name when renaming", () => {
    // Editing Lagos and leaving the name as Lagos must not clash with itself.
    expect(validateChapterName("Lagos", existing, "b")).toBeNull();
    // But it still cannot take another chapter's name.
    expect(validateChapterName("Benin", existing, "b")).toMatch(/already/i);
  });
});

describe("cleaning a chapter name", () => {
  it("trims the ends and collapses inner double spaces", () => {
    expect(cleanChapterName("  Port  Harcourt  ")).toBe("Port Harcourt");
  });
});
