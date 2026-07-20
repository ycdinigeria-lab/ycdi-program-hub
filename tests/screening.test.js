import { describe, it, expect } from "vitest";
import {
  REFERENCE_QUESTIONS,
  REFERENCE_METHODS,
  INTERVIEW_CATEGORIES,
  RECOMMENDATIONS,
  methodCounts,
  methodLabel,
  cleanPanel,
  panelIsValid,
  screeningGaps,
  latestInterview,
  readyToAppoint,
  renewalDeadline,
  renewalState,
  daysToDeadline,
  sortRenewals,
  renewalWarnings,
  recommendationLabel,
} from "../src/lib/screening.js";

// BATCH7B-MARKER screening-tests

const school = { role_sought: "school_contact" };
const event = { role_sought: "event_only" };

function ref(over = {}) {
  return {
    obtained_via: "phone",
    referee_is_church_leader: false,
    concern_raised: false,
    followup_done: false,
    ...over,
  };
}

describe("the six questions", () => {
  it("has all six, numbered in the order SAF-005 3.3 sets them", () => {
    expect(REFERENCE_QUESTIONS).toHaveLength(6);
    expect(REFERENCE_QUESTIONS.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps the question about entrusting your own children, which is the one that matters", () => {
    const q5 = REFERENCE_QUESTIONS.find((q) => q.number === 5);
    expect(q5.label.toLowerCase()).toContain("own children");
  });

  it("uses column names the database actually has", () => {
    const keys = REFERENCE_QUESTIONS.map((q) => q.key);
    expect(keys).toEqual([
      "q1_known_how_long",
      "q2_christian_character",
      "q3_observed_with_youth",
      "q4_concerns_known",
      "q5_would_entrust_own",
      "q6_anything_else",
    ]);
  });
});

describe("how a reference was obtained", () => {
  it("counts phone and email", () => {
    expect(methodCounts("phone")).toBe(true);
    expect(methodCounts("email")).toBe(true);
  });

  it("does not count a letter the applicant brought in", () => {
    expect(methodCounts("written_from_applicant")).toBe(false);
  });

  it("does not count something it has never heard of", () => {
    expect(methodCounts("word_of_mouth")).toBe(false);
    expect(methodCounts(undefined)).toBe(false);
  });

  it("offers exactly the three the database accepts", () => {
    expect(REFERENCE_METHODS.map((m) => m.key)).toEqual([
      "phone",
      "email",
      "written_from_applicant",
    ]);
  });

  it("labels an unrecorded method rather than showing a blank", () => {
    expect(methodLabel(null)).toBe("Not recorded");
  });
});

describe("the panel", () => {
  it("needs two people", () => {
    expect(panelIsValid(["Rita", "Ngozi"])).toBe(true);
    expect(panelIsValid(["Rita"])).toBe(false);
  });

  it("does not count empty boxes as people", () => {
    expect(panelIsValid(["Rita", "   ", ""])).toBe(false);
    expect(cleanPanel(["Rita", "  ", "Ngozi "])).toEqual(["Rita", "Ngozi"]);
  });

  it("refuses nothing at all", () => {
    expect(panelIsValid([])).toBe(false);
    expect(panelIsValid(null)).toBe(false);
    expect(panelIsValid(undefined)).toBe(false);
  });
});

describe("what is missing before an appointment", () => {
  it("asks for two references on a school-contact role", () => {
    const gaps = screeningGaps(school, [ref({ referee_is_church_leader: true })], [{}]);
    expect(gaps.join(" ")).toContain("Two references are needed");
    expect(gaps.join(" ")).toContain("1 on file");
  });

  it("asks for one on an event-only role", () => {
    expect(screeningGaps(event, [], [])).toEqual([
      "One reference is needed, taken by phone or email.",
    ]);
  });

  it("does not ask an event-only role for an interview", () => {
    expect(screeningGaps(event, [ref()], [])).toEqual([]);
  });

  it("does not count a letter the applicant handed in", () => {
    const gaps = screeningGaps(event, [ref({ obtained_via: "written_from_applicant" })], []);
    expect(gaps.join(" ")).toContain("phone or email");
  });

  it("wants one reference from a church leader", () => {
    const gaps = screeningGaps(school, [ref(), ref()], [{}]);
    expect(gaps.join(" ")).toContain("pastor, elder or church leader");
  });

  it("wants an interview for a school-contact role", () => {
    const gaps = screeningGaps(
      school,
      [ref({ referee_is_church_leader: true }), ref()],
      []
    );
    expect(gaps.join(" ")).toContain("An interview record is needed");
  });

  it("blocks on a concern nobody followed up", () => {
    const gaps = screeningGaps(
      school,
      [
        ref({ referee_is_church_leader: true, concern_raised: true, concern_detail: "Vague." }),
        ref(),
      ],
      [{}]
    );
    expect(gaps.join(" ")).toContain("has not been followed up");
    expect(gaps.join(" ")).toContain("3.3");
  });

  it("clears once the follow-up is done", () => {
    const gaps = screeningGaps(
      school,
      [
        ref({
          referee_is_church_leader: true,
          concern_raised: true,
          followup_done: true,
        }),
        ref(),
      ],
      [{}]
    );
    expect(gaps).toEqual([]);
  });

  it("says nothing when everything is on file", () => {
    const gaps = screeningGaps(
      school,
      [ref({ referee_is_church_leader: true }), ref()],
      [{ recommendation: "appoint" }]
    );
    expect(gaps).toEqual([]);
    expect(
      readyToAppoint(school, [ref({ referee_is_church_leader: true }), ref()], [{}])
    ).toBe(true);
  });
});

describe("a panel that said no", () => {
  const refs = () => [ref({ referee_is_church_leader: true }), ref()];

  it("blocks the appointment", () => {
    const gaps = screeningGaps(school, refs(), [
      { held_on: "2026-03-01", recommendation: "do_not_appoint" },
    ]);
    expect(gaps.join(" ")).toContain("recommended not appointing");
  });

  it("is overridden by a later panel that said yes", () => {
    const gaps = screeningGaps(school, refs(), [
      { held_on: "2026-03-01", recommendation: "do_not_appoint" },
      { held_on: "2026-04-15", recommendation: "appoint" },
    ]);
    expect(gaps).toEqual([]);
  });

  it("blocks again if the newest panel says no", () => {
    const gaps = screeningGaps(school, refs(), [
      { held_on: "2026-04-15", recommendation: "appoint" },
      { held_on: "2026-05-02", recommendation: "do_not_appoint" },
    ]);
    expect(gaps.join(" ")).toContain("recommended not appointing");
  });

  it("picks the newest whichever order the rows arrive in", () => {
    const rows = [
      { held_on: "2026-01-01", recommendation: "do_not_appoint" },
      { held_on: "2026-09-09", recommendation: "appoint" },
      { held_on: "2026-05-05", recommendation: "further_interview" },
    ];
    expect(latestInterview(rows).held_on).toBe("2026-09-09");
    expect(latestInterview([...rows].reverse()).held_on).toBe("2026-09-09");
  });

  it("breaks a same-day tie on when the record was written", () => {
    const rows = [
      { held_on: "2026-05-05", created_at: "2026-05-05T09:00:00Z", recommendation: "do_not_appoint" },
      { held_on: "2026-05-05", created_at: "2026-05-05T16:00:00Z", recommendation: "appoint" },
    ];
    expect(latestInterview(rows).recommendation).toBe("appoint");
  });

  it("has nothing to say when there are no interviews", () => {
    expect(latestInterview([])).toBe(null);
  });
});

describe("the 31 January renewal", () => {
  it("falls on the 31st of January", () => {
    expect(renewalDeadline(2026)).toBe("2026-01-31");
  });

  it("reads as renewed once it is signed", () => {
    expect(
      renewalState({ renewed_on: "2026-01-12", deadline: "2026-01-31" }, new Date("2026-06-01"))
    ).toBe("renewed");
  });

  it("reads as due before the deadline", () => {
    expect(renewalState({ deadline: "2026-01-31" }, new Date("2026-01-10"))).toBe("due");
  });

  it("reads as overdue after it", () => {
    expect(renewalState({ deadline: "2026-01-31" }, new Date("2026-02-01"))).toBe("overdue");
  });

  it("is still due on the day itself, not overdue", () => {
    expect(renewalState({ deadline: "2026-01-31" }, new Date("2026-01-31T10:00:00"))).toBe("due");
  });

  it("counts the days left", () => {
    expect(daysToDeadline("2026-01-31", new Date("2026-01-20"))).toBe(11);
    expect(daysToDeadline("2026-01-31", new Date("2026-02-05"))).toBe(-5);
    expect(daysToDeadline(null)).toBe(null);
  });

  it("puts the people who need chasing at the top", () => {
    const rows = [
      { full_name: "Zara", renewed_on: "2026-01-05", deadline: "2026-01-31" },
      { full_name: "Ada", deadline: "2026-01-31" },
      { full_name: "Bode", deadline: "2026-01-31" },
    ];
    const sorted = sortRenewals(rows, new Date("2026-02-10"));
    expect(sorted.map((r) => r.full_name)).toEqual(["Ada", "Bode", "Zara"]);
  });

  it("warns about lapsed training without blocking anything", () => {
    expect(renewalWarnings({ training_current: false })[0]).toContain("Refresher training");
    expect(renewalWarnings({ training_current: true })).toEqual([]);
    expect(renewalWarnings(null)).toEqual([]);
  });
});

describe("the four interview categories", () => {
  it("has all four from HR-004 section 6", () => {
    expect(INTERVIEW_CATEGORIES).toHaveLength(4);
    expect(INTERVIEW_CATEGORIES.map((c) => c.key)).toEqual([
      "motivation_faith",
      "competency",
      "values",
      "role_specific",
    ]);
  });

  it("keeps the disclosure question under values, where the policy puts it", () => {
    const values = INTERVIEW_CATEGORIES.find((c) => c.key === "values");
    expect(values.prompts.join(" ").toLowerCase()).toContain("disclosed abuse");
  });

  it("offers the four recommendations the database accepts", () => {
    expect(RECOMMENDATIONS.map((r) => r.key).sort()).toEqual([
      "appoint",
      "appoint_with_conditions",
      "do_not_appoint",
      "further_interview",
    ]);
    expect(recommendationLabel("do_not_appoint")).toBe("Do not appoint");
    expect(recommendationLabel(null)).toBe("Not recorded");
  });
});
