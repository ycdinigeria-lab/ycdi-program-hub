import { describe, it, expect } from "vitest";
import { ago } from "../src/components/NotificationBell.jsx";

const mins = (n) => new Date(Date.now() - n * 60000).toISOString();

describe("ago", () => {
  it("calls anything under a minute just now", () => {
    expect(ago(new Date().toISOString())).toBe("just now");
  });
  it("uses the singular for one minute", () => {
    expect(ago(mins(1))).toBe("1 minute ago");
  });
  it("uses the plural after that", () => {
    expect(ago(mins(5))).toBe("5 minutes ago");
  });
  it("rolls up to hours", () => {
    expect(ago(mins(60))).toBe("1 hour ago");
    expect(ago(mins(60 * 5))).toBe("5 hours ago");
  });
  it("rolls up to days", () => {
    expect(ago(mins(60 * 24))).toBe("1 day ago");
    expect(ago(mins(60 * 24 * 3))).toBe("3 days ago");
  });
  it("falls back to a date after a week", () => {
    expect(ago(mins(60 * 24 * 30))).toMatch(/\d+ \w{3}/);
  });
});
