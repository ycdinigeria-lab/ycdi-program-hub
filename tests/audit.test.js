import { describe, it, expect } from "vitest";
import {
  ENTITIES, entityLabel, actionTone, roleName,
  describeEntry, formatWhen, formatStamp, groupByDay,
} from "../src/lib/audit.js";

// BATCH6B-MARKER audit-tests

const base = {
  id: 1,
  occurred_at: "2026-07-20T09:30:00.000Z",
  actor_name: "Ngozi Okeke",
  actor_role: "NC",
  entity: "profile",
  entity_id: "u-1",
  subject_id: "u-1",
  subject_name: "Tobi Adekunle",
};

describe("entities", () => {
  it("names the four kinds of change the log records", () => {
    expect(ENTITIES.map((e) => e.key)).toEqual(["profile", "safeguarding", "kpi_target", "volunteer"]);
  });

  it("falls back rather than showing a blank label", () => {
    expect(entityLabel("something_new")).toBe("Other");
  });
});

describe("role codes become titles", () => {
  it("expands the three codes the app uses", () => {
    expect(roleName("NC")).toBe("National Coordinator");
    expect(roleName("RC")).toBe("Regional Coordinator");
    expect(roleName("TM")).toBe("Team Member");
  });

  it("says so plainly when there is no role", () => {
    expect(roleName(null)).toBe("no role");
  });
});

describe("access changes read as sentences", () => {
  it("a role change names both roles in full", () => {
    const s = describeEntry({ ...base, action: "role_changed", old_value: "TM", new_value: "RC" });
    expect(s).toBe("Ngozi Okeke changed Tobi Adekunle from Team Member to Regional Coordinator.");
  });

  it("a chapter move names both chapters", () => {
    const s = describeEntry({ ...base, action: "chapter_changed", old_value: "Benin", new_value: "Auchi" });
    expect(s).toContain("from Benin to Auchi");
  });

  it("a move from nowhere does not print the word null", () => {
    const s = describeEntry({ ...base, action: "chapter_changed", old_value: null, new_value: "Lagos" });
    expect(s).toContain("from no chapter to Lagos");
    expect(s).not.toContain("null");
  });

  it("admin rights being granted is separate from being removed", () => {
    expect(describeEntry({ ...base, action: "admin_granted" })).toContain("gave admin rights");
    expect(describeEntry({ ...base, action: "admin_removed" })).toContain("removed admin rights");
  });

  it("still reads properly after the person has been deleted", () => {
    const s = describeEntry({ ...base, action: "admin_granted", subject_name: null });
    expect(s).toContain("since been removed");
    expect(s).not.toContain("null");
  });
});

describe("safeguarding entries say what moved and nothing more", () => {
  const sg = { ...base, entity: "safeguarding", entity_id: "SG-2026-004", subject_name: null };

  it("names the reference when an incident is raised", () => {
    const s = describeEntry({ ...sg, action: "incident_raised", new_value: "Open", detail: "Scenario: disclosure" });
    expect(s).toContain("SG-2026-004");
    expect(s).toContain("disclosure");
  });

  it("a status move names both states", () => {
    const s = describeEntry({ ...sg, action: "status_changed", old_value: "Open", new_value: "Referred" });
    expect(s).toBe("Ngozi Okeke moved SG-2026-004 from Open to Referred.");
  });

  it("a suspension is described without naming who was suspended", () => {
    // The database never stores the accused person on an audit row, so
    // there is nothing here to leak. This test exists so that a future
    // change that starts storing one fails loudly.
    const s = describeEntry({ ...sg, action: "suspension_applied" });
    expect(s).toContain("SG-2026-004");
    expect(s).not.toContain("Tobi");
  });

  it("closing an incident is recorded", () => {
    expect(describeEntry({ ...sg, action: "incident_closed" })).toContain("closed SG-2026-004");
  });
});

describe("KPI target entries", () => {
  const k = { ...base, entity: "kpi_target", entity_id: "2026:students_reached", subject_name: null };

  it("splits the composite key into year and KPI", () => {
    const s = describeEntry({ ...k, action: "target_changed", old_value: "1200", new_value: "900" });
    expect(s).toContain("students_reached for 2026");
    expect(s).toContain("from 1200 to 900");
  });

  it("a target set for the first time has no old value to print", () => {
    const s = describeEntry({ ...k, action: "target_set", old_value: null, new_value: "1200" });
    expect(s).toContain("set the annual target");
    expect(s).toContain("1200");
  });

  it("a target cleared to nothing says nothing, not null", () => {
    const s = describeEntry({ ...k, action: "target_changed", old_value: "1200", new_value: null });
    expect(s).toContain("to nothing");
    expect(s).not.toContain("null");
  });
});

describe("volunteer entries", () => {
  const v = { ...base, entity: "volunteer", entity_id: "vr-1" };

  it("a status change names both states", () => {
    const s = describeEntry({ ...v, action: "status_changed", old_value: "onboarding", new_value: "active" });
    expect(s).toBe("Ngozi Okeke moved Tobi Adekunle from onboarding to active.");
  });

  it("a reason given is carried into the sentence", () => {
    const s = describeEntry({ ...v, action: "status_changed", old_value: "active", new_value: "withdrawn", detail: "Relocated" });
    expect(s).toContain("Reason given: Relocated");
  });

  it("assigning a first mentor is worded differently from swapping one", () => {
    const first = describeEntry({ ...v, action: "mentor_changed", old_value: null, new_value: "Rita Obi" });
    const swap = describeEntry({ ...v, action: "mentor_changed", old_value: "Rita Obi", new_value: "Ada Nwosu" });
    expect(first).toContain("assigned Rita Obi as mentor");
    expect(swap).toContain("from Rita Obi to Ada Nwosu");
  });

  it("removing a mentor without replacing one says so", () => {
    const s = describeEntry({ ...v, action: "mentor_changed", old_value: "Rita Obi", new_value: null });
    expect(s).toContain("removed Rita Obi as mentor");
  });
});

describe("tone", () => {
  it("widening access is flagged", () => {
    expect(actionTone({ entity: "profile", action: "admin_granted" })).toBe("alert");
    expect(actionTone({ entity: "profile", action: "role_changed" })).toBe("alert");
  });

  it("narrowing it is not", () => {
    expect(actionTone({ entity: "profile", action: "admin_removed" })).toBe("normal");
  });

  it("a volunteer suspension is flagged even though it shares a key with every other status move", () => {
    expect(actionTone({ entity: "volunteer", action: "status_changed", new_value: "suspended" })).toBe("alert");
    expect(actionTone({ entity: "volunteer", action: "status_changed", new_value: "removed" })).toBe("alert");
    expect(actionTone({ entity: "volunteer", action: "status_changed", new_value: "active" })).toBe("normal");
  });

  it("a safeguarding status move is not flagged, but a referral is", () => {
    expect(actionTone({ entity: "safeguarding", action: "status_changed" })).toBe("normal");
    expect(actionTone({ entity: "safeguarding", action: "referred" })).toBe("alert");
  });

  it("an action nobody has written a rule for is not flagged", () => {
    expect(actionTone({ entity: "profile", action: "invented_later" })).toBe("normal");
  });
});

describe("an action the database learns before this file does", () => {
  it("still produces something readable rather than disappearing", () => {
    const s = describeEntry({ ...base, entity: "profile", action: "phone_wiped" });
    expect(s).toContain("Ngozi Okeke");
    expect(s).toContain("phone wiped");
    expect(s).not.toContain("undefined");
  });
});

describe("times", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");

  it("counts minutes, hours and days as they pass", () => {
    expect(formatWhen("2026-07-20T11:59:40.000Z", now)).toBe("just now");
    expect(formatWhen("2026-07-20T11:45:00.000Z", now)).toBe("15 minutes ago");
    expect(formatWhen("2026-07-20T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(formatWhen("2026-07-18T12:00:00.000Z", now)).toBe("2 days ago");
  });

  it("uses the singular where it should", () => {
    expect(formatWhen("2026-07-20T11:59:00.000Z", now)).toBe("1 minute ago");
    expect(formatWhen("2026-07-20T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(formatWhen("2026-07-19T12:00:00.000Z", now)).toBe("1 day ago");
  });

  it("switches to a date once a week has gone by", () => {
    expect(formatWhen("2026-06-01T12:00:00.000Z", now)).toMatch(/Jun/);
  });

  it("does not fall over on rubbish", () => {
    expect(formatWhen(null)).toBe("");
    expect(formatWhen("not a date")).toBe("");
    expect(formatStamp(undefined)).toBe("");
  });

  it("the full stamp carries a time, because a Board paper needs one", () => {
    expect(formatStamp("2026-07-20T09:30:00.000Z")).toMatch(/\d{2}:\d{2}/);
  });
});

describe("grouping by day", () => {
  const rows = [
    { id: 3, occurred_at: "2026-07-20T15:00:00.000Z", action: "a" },
    { id: 2, occurred_at: "2026-07-20T09:00:00.000Z", action: "b" },
    { id: 1, occurred_at: "2026-07-18T09:00:00.000Z", action: "c" },
  ];

  it("puts the same day together and keeps the order it was given", () => {
    const g = groupByDay(rows);
    expect(g.length).toBe(2);
    expect(g[0].rows.map((r) => r.id)).toEqual([3, 2]);
    expect(g[1].rows.map((r) => r.id)).toEqual([1]);
  });

  it("labels the day in a way a person would say it", () => {
    expect(groupByDay(rows)[0].label).toContain("July");
  });

  it("drops rows with no usable timestamp rather than making a group for them", () => {
    const g = groupByDay([...rows, { id: 9, occurred_at: "rubbish" }]);
    expect(g.reduce((n, d) => n + d.rows.length, 0)).toBe(3);
  });

  it("handles being given nothing", () => {
    expect(groupByDay(null)).toEqual([]);
    expect(groupByDay([])).toEqual([]);
  });
});
