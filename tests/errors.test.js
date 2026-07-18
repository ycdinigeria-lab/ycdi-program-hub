import { describe, it, expect } from "vitest";
import { humanise } from "../src/lib/errors.js";

describe("humanise", () => {
  it("turns a dropped connection into something actionable", () => {
    expect(humanise(new Error("TypeError: Failed to fetch")))
      .toMatch(/no connection/i);
  });

  it("explains a permission refusal without database jargon", () => {
    const out = humanise({ message: 'new row violates row-level security policy for table "documents"' });
    expect(out).toMatch(/permission/i);
    expect(out).not.toMatch(/row-level/i);
  });

  it("catches the missing-setup case that bit us on Manage Admins", () => {
    expect(humanise({ message: "structure of query does not match function result type" }))
      .toMatch(/setup script/i);
  });

  it("names an expired session so the person knows to sign in again", () => {
    expect(humanise({ message: "JWT expired" })).toMatch(/sign in again/i);
  });

  it("does not mangle a message that is already clear", () => {
    const clear = "A chapter is required for that role.";
    expect(humanise({ message: clear })).toBe(clear);
  });

  it("copes with nothing at all rather than throwing", () => {
    expect(humanise(null)).toMatch(/went wrong/i);
    expect(humanise(undefined)).toMatch(/went wrong/i);
    expect(humanise("")).toMatch(/went wrong/i);
  });

  it("accepts a bare string as well as an error object", () => {
    expect(humanise("Invalid login credentials")).toMatch(/don't match/i);
  });
});
