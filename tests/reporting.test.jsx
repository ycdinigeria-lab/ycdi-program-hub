import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  emptyReportForm,
  reportFormToRow,
  stepIsValid,
  feedbackProblem,
  satisfactionPct,
} from "../src/data/reportFields.js";
import NewProgramForm from "../src/sections/programmes/NewProgramForm.jsx";
import ProgramDetail from "../src/sections/programmes/ProgramDetail.jsx";

const base = () => ({ ...emptyReportForm(0), what_went_well: "x", what_could_improve: "y", coordinator_signature_confirmed: "yes" });

describe("satisfaction maths", () => {
  it("works out the percentage", () => {
    expect(satisfactionPct({ feedback_forms_returned: "50", feedback_positive: "40" })).toBe(80);
  });

  it("keeps one decimal place rather than rounding away a real difference", () => {
    expect(satisfactionPct({ feedback_forms_returned: "80", feedback_positive: "70" })).toBe(87.5);
  });

  it("handles everyone being positive", () => {
    expect(satisfactionPct({ feedback_forms_returned: "30", feedback_positive: "30" })).toBe(100);
  });

  it("handles nobody being positive, which is a real answer and not a blank", () => {
    expect(satisfactionPct({ feedback_forms_returned: "10", feedback_positive: "0" })).toBe(0);
  });

  it("returns nothing when no forms were handed out", () => {
    expect(satisfactionPct({ feedback_forms_returned: "", feedback_positive: "" })).toBe(null);
    expect(satisfactionPct({ feedback_forms_returned: "0", feedback_positive: "0" })).toBe(null);
  });
});

describe("what the form refuses", () => {
  it("accepts a blank, because not every programme hands out forms", () => {
    expect(feedbackProblem({ feedback_forms_returned: "", feedback_positive: "" })).toBe("");
  });

  it("refuses more positive replies than forms returned", () => {
    expect(feedbackProblem({ feedback_forms_returned: "10", feedback_positive: "11" })).toContain("more positive replies");
  });

  it("refuses a negative count", () => {
    expect(feedbackProblem({ feedback_forms_returned: "-3", feedback_positive: "0" })).toBeTruthy();
  });

  it("accepts an honest zero", () => {
    expect(feedbackProblem({ feedback_forms_returned: "12", feedback_positive: "0" })).toBe("");
  });

  it("blocks the last step of the report while the numbers are impossible", () => {
    const u = { ...base(), feedback_forms_returned: "10", feedback_positive: "11" };
    expect(stepIsValid(6, u)).toBe(false);
  });

  it("lets the report through once they add up", () => {
    const u = { ...base(), feedback_forms_returned: "10", feedback_positive: "9" };
    expect(stepIsValid(6, u)).toBe(true);
  });

  it("lets the report through when no feedback was collected", () => {
    expect(stepIsValid(6, base())).toBe(true);
  });
});

describe("what gets written to the database", () => {
  it("stores a blank as null, not as zero", () => {
    const row = reportFormToRow("p1", base());
    // Zero would mean "forms came back and none were positive", which
    // would drag the chapter's KPI down for a night nobody handed out paper.
    expect(row.feedback_forms_returned).toBe(null);
    expect(row.feedback_positive).toBe(null);
  });

  it("stores real counts as numbers", () => {
    const row = reportFormToRow("p1", { ...base(), feedback_forms_returned: "50", feedback_positive: "40" });
    expect(row.feedback_forms_returned).toBe(50);
    expect(row.feedback_positive).toBe(40);
  });

  it("stores a genuine zero as zero", () => {
    const row = reportFormToRow("p1", { ...base(), feedback_forms_returned: "12", feedback_positive: "0" });
    expect(row.feedback_forms_returned).toBe(12);
    expect(row.feedback_positive).toBe(0);
  });
});

describe("resubmitting a returned programme", () => {
  const profile = { id: "u1", full_name: "Rita RC", role: "RC", is_admin: false, chapter_id: "c1", chapter_name: "Benin" };
  const chapters = [{ id: "c1", name: "Benin" }, { id: "c2", name: "Lagos" }];
  const returned = {
    id: "p1", title: "Term two fellowship week", chapter_name: "Benin", type: "School Visit",
    date: "2026-08-01", students: 80, school: "Eghosa Grammar School",
    objectives: "A clear set of objectives written out at length.",
    budget: 35000, safeguarding_lead: "Rita RC", facilitators: "Rita RC",
    status: "Returned", nc_comment: "Add the safeguarding lead.",
  };
  const noop = () => {};
  const text = (el) => renderToString(el).replace(/<!-- -->/g, "");

  // These render the first frame only. The wizard's third step, where the
  // Resubmit button lives, needs a real click to reach and is not covered
  // here. What is covered is that the form arrives carrying the existing
  // programme rather than empty, which was the whole point.
  it("opens pre-filled with what was already there", () => {
    const html = text(<NewProgramForm profile={profile} chapters={chapters} existing={returned} onSubmit={noop} onCancel={noop} />);
    expect(html).toContain("Term two fellowship week");
    expect(html).toContain("Eghosa Grammar School");
    expect(html).toContain("35000");
  });

  it("shows the coordinator what was asked of them while they fix it", () => {
    const html = text(<NewProgramForm profile={profile} chapters={chapters} existing={returned} onSubmit={noop} onCancel={noop} />);
    expect(html).toContain("Add the safeguarding lead.");
  });

  it("starts empty when nothing is passed in", () => {
    const html = text(<NewProgramForm profile={profile} chapters={chapters} onSubmit={noop} onCancel={noop} />);
    expect(html).not.toContain("Term two fellowship week");
    expect(html).not.toContain("What the National Coordinator asked for");
  });

  it("offers the button to the coordinator whose chapter it is", () => {
    const html = text(<ProgramDetail program={returned} profile={profile} onBack={noop} onApprove={noop} onReturn={noop} onLogReport={noop} onEdit={noop} />);
    expect(html).toContain("Revise and resubmit");
  });

  it("does not offer it to a coordinator from another chapter", () => {
    const other = { ...profile, chapter_name: "Lagos" };
    const html = text(<ProgramDetail program={returned} profile={other} onBack={noop} onApprove={noop} onReturn={noop} onLogReport={noop} onEdit={noop} />);
    expect(html).not.toContain("Revise and resubmit");
  });

  it("does not offer it to a team member", () => {
    const tm = { ...profile, role: "TM" };
    const html = text(<ProgramDetail program={returned} profile={tm} onBack={noop} onApprove={noop} onReturn={noop} onLogReport={noop} onEdit={noop} />);
    expect(html).not.toContain("Revise and resubmit");
  });

  it("does not offer it on a programme that is still awaiting review", () => {
    const pending = { ...returned, status: "Pending", nc_comment: "" };
    const html = text(<ProgramDetail program={pending} profile={profile} onBack={noop} onApprove={noop} onReturn={noop} onLogReport={noop} onEdit={noop} />);
    expect(html).not.toContain("Revise and resubmit");
  });

  it("no longer tells anybody to do something they cannot do", () => {
    const tm = { ...profile, role: "TM" };
    const html = text(<ProgramDetail program={returned} profile={tm} onBack={noop} onApprove={noop} onReturn={noop} onLogReport={noop} onEdit={noop} />);
    // This was the bug: the screen said "Please revise and resubmit" with
    // no way to do either.
    expect(html).not.toContain("Please revise and resubmit");
    expect(html).toContain("can revise and resubmit this");
  });
});
