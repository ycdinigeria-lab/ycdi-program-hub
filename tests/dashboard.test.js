// BATCH8-MARKER dashboard-tests
import { describe, it, expect } from "vitest";
import {
  greetingFor, firstNameOf, greetingLine, scopeFor, needsReport,
  statCardsFor, attentionFor, matchesQuery, filterPrograms,
  chapterTotals, filterChipsFor, quickActionsFor,
} from "../src/lib/dashboard.js";

const at = (h, m) => new Date(2026, 6, 21, h, m || 0, 0);

const nc = { id: "u1", full_name: "Godfrey Okoro", role: "NC", chapter_name: "Lagos" };
const rc = { id: "u2", full_name: "Ada Obi", role: "RC", chapter_name: "Benin" };
const tm = { id: "u3", full_name: "Sam Eze", role: "TM", chapter_name: "Benin" };

const P = (over) => ({
  id: over.id, title: over.title || "Outreach", chapter_name: over.chapter_name || "Lagos",
  // "students" in over, rather than ??, so a test can hand in a null on
  // purpose and have it survive as far as the code being tested.
  status: over.status || "Approved", students: "students" in over ? over.students : 10, date: over.date || "2026-07-18",
  school: over.school || "", type: over.type || "School Outreach", report: over.report || null,
});

const programs = [
  P({ id: "a", title: "Lagos Schools Week", chapter_name: "Lagos", status: "Approved", students: 56 }),
  P({ id: "b", title: "Students Seminar Outreach", chapter_name: "Benin", status: "Pending", students: 105 }),
  P({ id: "c", title: "Osun Campus Visit", chapter_name: "Osun", status: "Live", students: 80 }),
  P({ id: "d", title: "Benin Follow Up", chapter_name: "Benin", status: "Returned", students: 20 }),
  P({ id: "e", title: "Benin Report Pending", chapter_name: "Benin", status: "Live", students: 30 }),
  P({ id: "f", title: "Old Benin Job", chapter_name: "Benin", status: "Complete", students: 12, report: { id: "r1" } }),
];

describe("greeting by time of day", () => {
  it("moves from morning to afternoon at noon exactly", () => {
    expect(greetingFor(at(11, 59))).toBe("Good morning");
    expect(greetingFor(at(12, 0))).toBe("Good afternoon");
  });

  it("moves from afternoon to evening at five exactly", () => {
    expect(greetingFor(at(16, 59))).toBe("Good afternoon");
    expect(greetingFor(at(17, 0))).toBe("Good evening");
  });

  it("covers the small hours as morning rather than falling through", () => {
    expect(greetingFor(at(0, 1))).toBe("Good morning");
  });

  it("falls back to the current clock when handed nothing usable", () => {
    expect(["Good morning", "Good afternoon", "Good evening"]).toContain(greetingFor(undefined));
    expect(["Good morning", "Good afternoon", "Good evening"]).toContain(greetingFor("not a date"));
  });
});

describe("the name in the greeting", () => {
  it("uses the first name only", () => {
    expect(firstNameOf("Godfrey Okoro")).toBe("Godfrey");
  });

  it("steps past a title so it does not read Good evening, Dr", () => {
    expect(firstNameOf("Dr. Donatus Egbonim")).toBe("Donatus");
    expect(firstNameOf("Pastor Christopher Oshiobughie")).toBe("Christopher");
    expect(firstNameOf("Mrs Grace Adeyemi")).toBe("Grace");
  });

  it("keeps a title that is the whole name, because there is nothing else to use", () => {
    expect(firstNameOf("Pastor")).toBe("Pastor");
  });

  it("survives extra spacing and a missing or wrongly typed name", () => {
    expect(firstNameOf("   Godfrey    Okoro ")).toBe("Godfrey");
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf("   ")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf(undefined)).toBe("");
    expect(firstNameOf(42)).toBe("");
  });

  it("leaves no dangling comma when there is no name on the profile", () => {
    expect(greetingLine("Godfrey Okoro", at(20, 45))).toBe("Good evening, Godfrey");
    expect(greetingLine("", at(20, 45))).toBe("Good evening");
    expect(greetingLine(null, at(9, 0))).toBe("Good morning");
  });
});

describe("what each role is shown", () => {
  it("the National Coordinator sees every chapter", () => {
    expect(scopeFor(programs, nc)).toHaveLength(programs.length);
  });

  it("a coordinator sees only their own chapter", () => {
    const mine = scopeFor(programs, rc);
    expect(mine.every((p) => p.chapter_name === "Benin")).toBe(true);
    expect(mine).toHaveLength(4);
  });

  it("copes with no programmes and no profile without throwing", () => {
    expect(scopeFor([], rc)).toEqual([]);
    expect(scopeFor(null, rc)).toEqual([]);
    expect(scopeFor(programs, null)).toHaveLength(programs.length);
  });
});

describe("stat cards", () => {
  it("count what the National Coordinator actually has", () => {
    const cards = statCardsFor(programs, nc);
    const by = Object.fromEntries(cards.map((c) => [c.key, c.value]));
    expect(by.programmes).toBe(6);
    expect(by.pending).toBe(1);
    expect(by.live).toBe(2);
    expect(by.students).toBe("303");
  });

  it("count only the coordinator's own chapter", () => {
    const by = Object.fromEntries(statCardsFor(programs, rc).map((c) => [c.key, c.value]));
    expect(by.programmes).toBe(4);
    expect(by.pending).toBe(1);
    expect(by.report).toBe(1);
    expect(by.students).toBe("167");
  });

  it("leave the students card unpressable, because there is no list behind it", () => {
    for (const profile of [nc, rc]) {
      const students = statCardsFor(programs, profile).find((c) => c.key === "students");
      expect(students.filter).toBeNull();
    }
  });

  it("give every other card a filter to apply", () => {
    const cards = statCardsFor(programs, nc).filter((c) => c.key !== "students");
    expect(cards.every((c) => typeof c.filter === "string" && c.filter.length > 0)).toBe(true);
  });

  it("only colour a card as a warning when there is something in it", () => {
    const quiet = [P({ id: "x", chapter_name: "Lagos", status: "Complete", report: { id: "r" } })];
    const pending = statCardsFor(quiet, nc).find((c) => c.key === "pending");
    const busy = statCardsFor(programs, nc).find((c) => c.key === "pending");
    expect(pending.accent).not.toBe(busy.accent);
  });

  it("treat a missing student count as nought rather than as text", () => {
    // null on its own proves nothing here, because adding null to a running
    // total already gives nought whether or not the number is coerced.
    // Undefined and a string are where an uncoerced total actually breaks,
    // and a string is what a form field hands back.
    for (const bad of [null, undefined, ""]) {
      const odd = [P({ id: "y", chapter_name: "Lagos", students: bad })];
      expect(statCardsFor(odd, nc).find((c) => c.key === "students").value).toBe("0");
    }
  });

  it("add up a student count that arrived from a form as text", () => {
    const typed = [
      P({ id: "y1", chapter_name: "Lagos", students: "56" }),
      P({ id: "y2", chapter_name: "Lagos", students: "4" }),
    ];
    expect(statCardsFor(typed, nc).find((c) => c.key === "students").value).toBe("60");
  });
});

describe("what needs attention", () => {
  it("the National Coordinator is shown what is waiting on their approval", () => {
    const items = attentionFor(programs, nc);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Students Seminar Outreach");
    expect(items[0].actionLabel).toBe("Review");
  });

  it("a coordinator sees a returned programme before an unlogged report", () => {
    const items = attentionFor(programs, rc);
    expect(items.map((i) => i.title)).toEqual(["Benin Follow Up", "Benin Report Pending"]);
    expect(items[0].tone).toBe("alert");
    expect(items[1].actionLabel).toBe("Log report");
  });

  it("says nothing at all when nothing is outstanding", () => {
    const calm = [P({ id: "z", chapter_name: "Benin", status: "Complete", report: { id: "r" } })];
    expect(attentionFor(calm, rc)).toEqual([]);
  });

  it("stops chasing a report once one has been logged", () => {
    expect(needsReport(P({ id: "q", status: "Live", report: null }))).toBe(true);
    expect(needsReport(P({ id: "q", status: "Live", report: { id: "r" } }))).toBe(false);
    expect(needsReport(P({ id: "q", status: "Pending", report: null }))).toBe(false);
  });
});

describe("filtering the list", () => {
  it("narrows to one status", () => {
    expect(filterPrograms(programs, { status: "Pending" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("narrows to one chapter", () => {
    expect(filterPrograms(programs, { chapter: "Osun" }).map((p) => p.id)).toEqual(["c"]);
  });

  it("combines a status and a chapter rather than choosing between them", () => {
    expect(filterPrograms(programs, { status: "Live", chapter: "Benin" }).map((p) => p.id)).toEqual(["e"]);
  });

  it("understands report due, which is not a status on the record", () => {
    expect(filterPrograms(programs, { status: "needs_report" }).map((p) => p.id)).toEqual(["a", "c", "e"]);
  });

  it("searches the title, the chapter and the school, ignoring case", () => {
    expect(filterPrograms(programs, { query: "seminar" }).map((p) => p.id)).toEqual(["b"]);
    expect(filterPrograms(programs, { query: "OSUN" }).map((p) => p.id)).toEqual(["c"]);
    const withSchool = [P({ id: "s", title: "Visit", school: "Command Secondary" })];
    expect(filterPrograms(withSchool, { query: "command" })).toHaveLength(1);
  });

  it("returns everything when asked for nothing in particular", () => {
    expect(filterPrograms(programs, {})).toHaveLength(programs.length);
    expect(filterPrograms(programs, undefined)).toHaveLength(programs.length);
    expect(filterPrograms(programs, { query: "   " })).toHaveLength(programs.length);
  });

  it("returns nothing rather than everything when the search matches nothing", () => {
    expect(filterPrograms(programs, { query: "kayaking" })).toEqual([]);
  });

  it("matchesQuery does not quietly pass on a miss", () => {
    expect(matchesQuery(P({ id: "m", title: "Alpha" }), "beta")).toBe(false);
    expect(matchesQuery(P({ id: "m", title: "Alpha" }), "")).toBe(true);
  });
});

describe("the filter chips", () => {
  it("hide a status nobody has, so no chip leads to an empty list", () => {
    const keys = filterChipsFor(programs, rc).map((c) => c.key);
    expect(keys).toContain("all");
    expect(keys).toContain("Returned");
    expect(keys).not.toContain("Approved");
  });

  it("keep All even when there is nothing at all", () => {
    expect(filterChipsFor([], nc).map((c) => c.key)).toEqual(["all"]);
  });

  it("count against the person's own scope, not the whole country", () => {
    const chip = filterChipsFor(programs, rc).find((c) => c.key === "all");
    expect(chip.count).toBe(4);
  });
});

describe("students by chapter", () => {
  it("adds up per chapter and puts the biggest first", () => {
    const totals = chapterTotals(programs, ["Lagos", "Benin", "Osun"]);
    expect(totals.map((t) => t.name)).toEqual(["Benin", "Osun", "Lagos"]);
    expect(totals[0].students).toBe(167);
    expect(totals[0].count).toBe(4);
  });

  it("still lists a chapter that has done nothing yet", () => {
    const totals = chapterTotals(programs, ["Lagos", "Enugu"]);
    const enugu = totals.find((t) => t.name === "Enugu");
    expect(enugu.students).toBe(0);
    expect(enugu.count).toBe(0);
  });

  it("works out the chapters itself when it is not given a list", () => {
    expect(chapterTotals(programs, []).map((t) => t.name).sort()).toEqual(["Benin", "Lagos", "Osun"]);
  });
});

describe("quick actions", () => {
  it("do not offer a Team Member doors the More list would refuse them", () => {
    const keys = quickActionsFor(tm).map((a) => a.key);
    expect(keys).not.toContain("programmes");
    expect(keys).not.toContain("participants");
    expect(keys).not.toContain("kpi");
    expect(keys).toContain("profile");
  });

  it("word the programme action for what that role actually does there", () => {
    expect(quickActionsFor(nc).find((a) => a.key === "programmes").label).toBe("All programmes");
    expect(quickActionsFor(rc).find((a) => a.key === "programmes").label).toBe("Submit outreach");
  });

  it("name a tab for every action, and a More feature wherever one is needed", () => {
    for (const a of quickActionsFor(nc)) {
      expect(typeof a.section).toBe("string");
      if (a.section === "more") expect(typeof a.view).toBe("string");
    }
  });

  it("returns an empty list rather than throwing when there is no profile", () => {
    expect(quickActionsFor(null)).toEqual([]);
  });
});
