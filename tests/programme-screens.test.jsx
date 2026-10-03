import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CoordDashboard from "../src/sections/programmes/CoordDashboard.jsx";
import NCDashboard from "../src/sections/programmes/NCDashboard.jsx";
import ProgramDetail from "../src/sections/programmes/ProgramDetail.jsx";
import { Modal, nextTrapIndex } from "../src/components/ui.jsx";
import { ICON_NAMES } from "../src/components/Icon.jsx";
import { HUB_CSS } from "../src/lib/hubCss.js";
import {
  STATUS_GROUPS, countByGroup, visibleGroups, filterPrograms, matchesQuery,
  shortDate, fullDate, firstName, greeting, splitNames, plural,
  needsAttention, attentionDetail, excerpt, readinessChecks, readinessTotals, programmeTotals, programmePermissions,
} from "../src/lib/programmeView.js";

// BATCH41-MARKER programme-screens-tests
//
// The first half checks the thinking (filters, dates, who needs attention,
// what the readiness checks say). The second half renders each redesigned
// screen once and checks the things that must not change: who is offered
// which action, and that nothing the old screens showed has gone missing.
// Static markup only, so clicking through is still a job for the preview.

const mk = (over = {}) => ({
  id: "p" + Math.random().toString(36).slice(2, 8),
  title: "School outreach, Benin Central", chapter_name: "Benin", type: "School Visit",
  date: "2026-10-14", students: 80, school: "Auchi Polytechnic", budget: 35000,
  objectives: "Introduce students to a life of purpose and godly leadership.",
  facilitators: "Chidi Okafor, Amaka Eze", safeguarding_lead: "Rita RC",
  status: "Pending", created_at: "2026-10-02T09:00:00Z",
  ...over,
});

describe("status groups and filtering", () => {
  const list = [
    mk({ title: "A", status: "Pending" }), mk({ title: "B", status: "RC Review" }),
    mk({ title: "C", status: "Returned" }), mk({ title: "D", status: "RC Returned" }),
    mk({ title: "E", status: "Approved" }), mk({ title: "F", status: "Live" }),
    mk({ title: "G", status: "Complete" }),
  ];

  it("Pending is exactly the National Coordinator's queue, so it matches the dashboard figure", () => {
    expect(filterPrograms(list, { status: "pending" }).map((p) => p.title)).toEqual(["A"]);
    expect(programmeTotals(list).pending).toBe(1);
  });

  it("both kinds of return sit under Needs changes", () => {
    expect(filterPrograms(list, { status: "changes" }).map((p) => p.title)).toEqual(["C", "D"]);
  });

  it("every status belongs to exactly one chip, so nothing can be filtered out of sight", () => {
    const statuses = ["Pending", "RC Review", "Returned", "RC Returned", "Approved", "Live", "Complete", "Declined"];
    for (const s of statuses) {
      const owners = STATUS_GROUPS.filter((g) => g.statuses && g.statuses.includes(s));
      expect(owners.length).toBe(1);
    }
  });

  it("counts per chip add up to the whole list", () => {
    const c = countByGroup(list);
    expect(c.all).toBe(7);
    expect(c.pending + c.rcreview + c.changes + c.approved + c.live + c.complete + c.declined).toBe(7);
  });

  it("empty chips are hidden, but the selected one never disappears", () => {
    const c = countByGroup(list);
    expect(visibleGroups(c, "all").map((g) => g.key)).not.toContain("declined");
    expect(visibleGroups(c, "declined").map((g) => g.key)).toContain("declined");
    expect(visibleGroups(c, "all")[0].key).toBe("all");
  });

  it("search matches title, chapter, type and school, ignoring case, and every word must match", () => {
    const p = mk({ title: "Fellowship Week", chapter_name: "Lagos", type: "Retreat", school: "Yaba College" });
    expect(matchesQuery(p, "")).toBe(true);
    expect(matchesQuery(p, "FELLOWSHIP")).toBe(true);
    expect(matchesQuery(p, "lagos retreat")).toBe(true);
    expect(matchesQuery(p, "yaba")).toBe(true);
    expect(matchesQuery(p, "lagos benin")).toBe(false);
  });

  it("an unknown status key behaves like All rather than hiding everything", () => {
    expect(filterPrograms(list, { status: "nonsense" }).length).toBe(7);
  });
});

describe("dates, names and greetings", () => {
  const now = new Date(2026, 9, 3, 10, 0);
  it("short dates drop the year only when it is this year", () => {
    expect(shortDate("2026-10-14", now)).toBe("14 Oct");
    expect(shortDate("2027-01-05", now)).toBe("5 Jan 2027");
  });
  it("anything that is not a real date is shown as typed, not guessed at", () => {
    expect(shortDate("next Friday", now)).toBe("next Friday");
    expect(shortDate("2026-02-31", now)).toBe("2026-02-31");
    expect(shortDate("", now)).toBe("");
    expect(shortDate(null, now)).toBe("");
  });
  it("full dates always carry the year", () => {
    expect(fullDate("2026-10-14")).toBe("14 Oct 2026");
    expect(fullDate("soon")).toBe("soon");
  });
  it("the greeting uses a first name and skips titles", () => {
    expect(firstName("Dr. Donatus Egbonim")).toBe("Donatus");
    expect(firstName("Pastor Ada Obi")).toBe("Ada");
    expect(firstName("Rita RC")).toBe("Rita");
    expect(firstName("")).toBe("");
  });
  it("the greeting follows the time of day", () => {
    expect(greeting(new Date(2026, 9, 3, 9), "Ada Obi")).toBe("Good morning, Ada");
    expect(greeting(new Date(2026, 9, 3, 13), "Ada Obi")).toBe("Good afternoon, Ada");
    expect(greeting(new Date(2026, 9, 3, 19), "Ada Obi")).toBe("Good evening, Ada");
    expect(greeting(new Date(2026, 9, 3, 9), "")).toBe("Good morning");
  });
  it("the greeting changes exactly at noon and at five", () => {
    expect(greeting(new Date(2026, 9, 3, 11, 59), "Ada")).toBe("Good morning, Ada");
    expect(greeting(new Date(2026, 9, 3, 12, 0), "Ada")).toBe("Good afternoon, Ada");
    expect(greeting(new Date(2026, 9, 3, 16, 59), "Ada")).toBe("Good afternoon, Ada");
    expect(greeting(new Date(2026, 9, 3, 17, 0), "Ada")).toBe("Good evening, Ada");
    expect(greeting(new Date(2026, 9, 3, 0, 30), "Ada")).toBe("Good morning, Ada");
  });
  it("facilitators split on the commas the form asks for", () => {
    expect(splitNames("Chidi Okafor, Amaka Eze")).toEqual(["Chidi Okafor", "Amaka Eze"]);
    expect(splitNames("A; B\nC")).toEqual(["A", "B", "C"]);
    expect(splitNames("")).toEqual([]);
    expect(splitNames(null)).toEqual([]);
  });
  it("plural and excerpt", () => {
    expect(plural(1, "student")).toBe("student");
    expect(plural(2, "student")).toBe("students");
    expect(excerpt("short")).toBe("short");
    expect(excerpt("x".repeat(200), 50).length).toBeLessThanOrEqual(53);
  });
});

describe("who needs attention (the rule the redesign must not change)", () => {
  const rc = { id: "u1", role: "RC", is_admin: false };
  const tm = { id: "u2", role: "TM", is_admin: false };
  const admin = { id: "u3", role: "NC", is_admin: true };
  const mine = [
    mk({ title: "ret", status: "Returned" }),
    mk({ title: "rcrev", status: "RC Review" }),
    mk({ title: "rcret-mine", status: "RC Returned", submitted_by: "u2" }),
    mk({ title: "rcret-other", status: "RC Returned", submitted_by: "someone-else" }),
    mk({ title: "pend", status: "Pending" }),
  ];
  const titles = (profile) => needsAttention(mine, profile).map((p) => p.title);

  it("a returned note is for everyone in the chapter", () => {
    expect(titles(tm)).toContain("ret");
    expect(titles(rc)).toContain("ret");
  });
  it("a note in RC Review is only the RC's (or an admin's) to act on", () => {
    expect(titles(rc)).toContain("rcrev");
    expect(titles(admin)).toContain("rcrev");
    expect(titles(tm)).not.toContain("rcrev");
  });
  it("an RC-returned note is only the team member who wrote it", () => {
    expect(titles(tm)).toContain("rcret-mine");
    expect(titles(tm)).not.toContain("rcret-other");
    expect(titles(rc)).not.toContain("rcret-mine");
  });
  it("a pending note is nobody's attention item here", () => {
    expect(titles(rc)).not.toContain("pend");
  });
  it("says who returned it and carries the note", () => {
    expect(attentionDetail({ status: "Returned", nc_comment: "Add a lead." })).toEqual({ label: "Returned by the National Coordinator", note: "Add a lead." });
    expect(attentionDetail({ status: "RC Returned", rc_comment: "More detail." }).label).toContain("Regional Coordinator");
    expect(attentionDetail({ status: "RC Review" })).toEqual({ label: "Awaiting your review", note: "" });
  });
});

describe("readiness checks keep the old rules and say what they checked", () => {
  it("passes when objectives are over 20 characters, facilitators are named and a lead is set", () => {
    const checks = readinessChecks(mk());
    expect(checks.map((c) => c.ok)).toEqual([true, true, true]);
    expect(readinessTotals(checks)).toEqual({ done: 3, total: 3 });
  });
  it("short objectives fail the mission check at exactly 20 characters, pass at 21", () => {
    expect(readinessChecks(mk({ objectives: "x".repeat(20) }))[0].ok).toBe(false);
    expect(readinessChecks(mk({ objectives: "x".repeat(21) }))[0].ok).toBe(true);
  });
  it("no facilitators fails quality; no lead fails safety", () => {
    const c = readinessChecks(mk({ facilitators: "", safeguarding_lead: "" }));
    expect(c[1].ok).toBe(false);
    expect(c[2].ok).toBe(false);
    expect(c[2].detail).toBe("No safeguarding lead assigned");
  });
  it("never claims more than it checked: wording is about the information being filled in", () => {
    for (const c of readinessChecks(mk())) expect(c.detail).not.toMatch(/align|serve|meets|quality of/i);
  });
});

describe("Coordinator dashboard", () => {
  const profile = { id: "u1", full_name: "Rita Obi", role: "RC", is_admin: false, chapter_name: "Benin" };
  const noop = () => {};
  const render = (programs, p = profile) => renderToStaticMarkup(<CoordDashboard programs={programs} profile={p} onView={noop} onNew={noop} onReport={noop} />);

  it("greets by first name and puts Submit programme in the header", () => {
    const html = render([mk()]);
    expect(html).toMatch(/Good (morning|afternoon|evening), Rita/);
    expect(html).toContain("Submit programme");
    expect(html).toContain("Here&#x27;s what&#x27;s happening with your programmes.");
  });

  it("shows only this chapter's programmes", () => {
    const html = render([mk({ title: "Mine" }), mk({ title: "Not mine", chapter_name: "Lagos" })]);
    expect(html).toContain("Mine");
    expect(html).not.toContain("Not mine");
  });

  it("a returned note appears in the attention panel with who returned it and what they said", () => {
    const html = render([mk({ title: "Fix me", status: "Returned", nc_comment: "Add the safeguarding lead." })]);
    expect(html).toContain("1 programme needs your attention");
    expect(html).toContain("Returned by the National Coordinator");
    expect(html).toContain("Add the safeguarding lead.");
  });

  it("with nothing to act on it says so", () => {
    const html = render([mk({ status: "Approved" })]);
    expect(html).toContain("You&#x27;re all caught up");
    expect(html).toContain("No programmes require action right now.");
  });

  it("offers Log report only on an approved or live programme with no report yet", () => {
    expect(render([mk({ status: "Approved" })])).toContain("Log report");
    expect(render([mk({ status: "Live" })])).toContain("Log report");
    expect(render([mk({ status: "Approved", report: { id: "r1" } })])).not.toContain("Log report");
    expect(render([mk({ status: "Pending" })])).not.toContain("Log report");
  });

  it("an empty chapter gets a friendly start, not a blank list", () => {
    const html = render([]);
    expect(html).toContain("No programmes yet");
    expect(html).toContain("Submit your first programme");
    expect(html).not.toContain('type="search"');
  });

  it("a chapter with programmes gets search and status filters", () => {
    const html = render([mk(), mk({ status: "Approved" })]);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Filter by status"');
    expect(html).toMatch(/class="hub-chip"[^>]*>All<span class="hub-chip-count">2<\/span>/);
    expect(html).toMatch(/class="hub-chip"[^>]*>Pending<span class="hub-chip-count">1<\/span>/);
    expect(html).toMatch(/class="hub-chip"[^>]*>Approved<span class="hub-chip-count">1<\/span>/);
  });

  it("the students figure is labelled for what it is (it was 'this month' but summed everything)", () => {
    const html = render([mk({ students: 30 }), mk({ students: 50 })]);
    expect(html).toContain("Students planned");
    expect(html).not.toContain("Students this month");
    expect(html).toContain(">80<");
  });

  it("cards are real buttons on the title, not click-only divs", () => {
    expect(render([mk({ title: "Open me" })])).toMatch(/<button[^>]*class="hub-prog-link"[^>]*>Open me<\/button>/);
  });
});

describe("National Coordinator dashboard", () => {
  const noop = () => {};
  const render = (programs, chapters = []) => renderToStaticMarkup(<NCDashboard programs={programs} chapters={chapters} onView={noop} />);

  it("leads with what is awaiting approval, with a Review programme button for each", () => {
    const html = render([mk({ title: "One" }), mk({ title: "Two", chapter_name: "Lagos" })]);
    expect(html).toContain("2 programmes are awaiting approval");
    expect((html.match(/Review programme/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Lagos Chapter");
  });

  it("uses the singular for one", () => {
    expect(render([mk()])).toContain("1 programme is awaiting approval");
  });

  it("when the queue is empty it says there is nothing waiting", () => {
    const html = render([mk({ status: "Approved" })]);
    expect(html).toContain("There are no programmes waiting for your review.");
  });

  it("only Pending programmes are in the queue, not RC Review or Returned", () => {
    const html = render([mk({ title: "Queued" }), mk({ title: "WithRC", status: "RC Review" }), mk({ title: "Sent back", status: "Returned" })]);
    expect(html).toContain("1 programme is awaiting approval");
  });

  it("shows the overview figures and every programme in the list", () => {
    const html = render([mk({ status: "Live" }), mk({ status: "Complete" }), mk({ status: "Pending" })]);
    for (const label of ["Total programmes", "Awaiting approval", "Live", "Completed", "Students planned"]) expect(html).toContain(label);
    expect(html).toContain("All programmes");
  });

  it("keeps the students-by-chapter chart, with each bar described for screen readers", () => {
    const html = render([mk({ students: 40 })], [{ name: "Benin" }, { name: "Lagos" }]);
    expect(html).toContain("Students by chapter");
    expect(html).toContain("Benin: 40 students");
  });
});

describe("Programme detail: who is offered what", () => {
  const noop = () => {};
  const admin = { id: "u9", full_name: "Nora NC", role: "NC", is_admin: true, chapter_name: "" };
  const rc = { id: "u1", full_name: "Rita RC", role: "RC", is_admin: false, chapter_name: "Benin" };
  const tm = { id: "u2", full_name: "Tim TM", role: "TM", is_admin: false, chapter_name: "Benin" };
  const render = (program, profile) => renderToStaticMarkup(
    <ProgramDetail program={program} profile={profile} onBack={noop} onApprove={noop} onReturn={noop} onDecline={noop} onRcReturn={noop} onLogReport={noop} onEdit={noop} />
  );

  it("an administrator sees Approve programme and Request changes on a pending programme", () => {
    const html = render(mk(), admin);
    expect(html).toContain("Approve programme");
    expect(html).toContain("Request changes");
  });

  it("nobody else is offered approval, however senior they sound", () => {
    expect(render(mk(), rc)).not.toContain("Approve programme");
    expect(render(mk(), tm)).not.toContain("Approve programme");
  });

  it("an administrator is not offered approval on something already approved", () => {
    expect(render(mk({ status: "Approved" }), admin)).not.toContain("Approve programme");
  });

  it("the chapter RC can forward, request changes or decline a note in RC Review", () => {
    const html = render(mk({ status: "RC Review" }), rc);
    expect(html).toContain("Revise and forward to NC");
    expect(html).toContain("Request changes");
    expect(html).toContain("Decline");
  });

  it("a team member cannot act on a note in RC Review", () => {
    const html = render(mk({ status: "RC Review" }), tm);
    expect(html).not.toContain("Revise and forward to NC");
    expect(html).not.toContain(">Decline<");
  });

  it("an RC from another chapter cannot act on it either", () => {
    const html = render(mk({ status: "RC Review" }), { ...rc, chapter_name: "Lagos" });
    expect(html).not.toContain("Revise and forward to NC");
  });

  it("only the team member who wrote an RC-returned note is offered the edit", () => {
    const note = mk({ status: "RC Returned", submitted_by: "u2", rc_comment: "Add detail." });
    expect(render(note, tm)).toContain("Edit and resubmit");
    expect(render(note, { ...tm, id: "other" })).not.toContain("Edit and resubmit");
  });

  it("a declined note shows the reason and says it will not proceed", () => {
    const html = render(mk({ status: "Declined", rc_comment: "Out of scope." }), tm);
    expect(html).toContain("Declined by the Regional Coordinator");
    expect(html).toContain("Out of scope.");
    expect(html).toContain("will not proceed");
  });
});

describe("Programme detail: what it shows", () => {
  const noop = () => {};
  const rc = { id: "u1", full_name: "Rita RC", role: "RC", is_admin: false, chapter_name: "Benin" };
  const render = (program) => renderToStaticMarkup(
    <ProgramDetail program={program} profile={rc} onBack={noop} onApprove={noop} onReturn={noop} onDecline={noop} onRcReturn={noop} onLogReport={noop} onEdit={noop} />
  );

  it("puts the title, where it sits, and its status at the top, with a way back", () => {
    const html = render(mk({ title: "Term two fellowship" }));
    expect(html).toContain("Term two fellowship");
    expect(html).toContain("Benin Chapter · School Visit");
    expect(html).toContain("Back to programmes");
    expect(html).toContain("Pending");
  });

  it("is an h2, because the shell already owns the h1", () => {
    expect(render(mk())).not.toContain("<h1");
  });

  it("shows the four facts, formatted", () => {
    const html = render(mk({ date: "2026-10-14", students: 1200, budget: 35000, school: "Auchi Polytechnic" }));
    expect(html).toContain("Programme date");
    expect(html).toContain("14 Oct 2026");
    expect(html).toContain("1,200");
    expect(html).toContain("NGN 35,000");
    expect(html).toContain("Auchi Polytechnic");
  });

  it("says Not given instead of leaving a gap", () => {
    expect(render(mk({ school: "" }))).toContain("Not given");
  });

  it("shows spent only when something was spent", () => {
    expect(render(mk({ spent: 12000 }))).toContain("NGN 12,000");
    expect(render(mk({ spent: 0 }))).not.toContain(">Spent<");
  });

  it("lists facilitators one by one, not as a comma-separated line", () => {
    const html = render(mk({ facilitators: "Chidi Okafor, Amaka Eze" }));
    expect(html).toContain('class="hub-person"');
    expect((html.match(/class="hub-person"/g) || []).length).toBe(3);
    expect(html).toContain("Chidi Okafor");
    expect(html).toContain("Amaka Eze");
  });

  it("readiness is complete when all three checks pass, and says where it falls short when not", () => {
    expect(render(mk())).toContain("3 / 3 complete");
    const short = render(mk({ safeguarding_lead: "" }));
    expect(short).toContain("2 / 3 complete");
    expect(short).toContain("Needs attention: ");
    expect(short).toContain("No safeguarding lead assigned");
  });

  it("is honest that the checks only confirm information is filled in", () => {
    expect(render(mk())).toContain("only confirm the information has been filled in");
  });

  it("keeps the returned note and the Revise and resubmit button for the chapter's RC", () => {
    const html = render(mk({ status: "Returned", nc_comment: "Add the safeguarding lead." }));
    expect(html).toContain("Add the safeguarding lead.");
    expect(html).toContain("Revise and resubmit");
  });

  it("does not offer Revise and resubmit to an RC from another chapter", () => {
    const html = renderToStaticMarkup(
      <ProgramDetail program={mk({ status: "Returned", nc_comment: "x" })} profile={{ ...rc, chapter_name: "Lagos" }} onBack={noop} onApprove={noop} onReturn={noop} onLogReport={noop} onEdit={noop} />
    );
    expect(html).not.toContain("Revise and resubmit");
  });
});

describe("Dialog", () => {
  const html = renderToStaticMarkup(<Modal title="Request changes" onClose={() => {}} footer={<button>Send</button>}><p>Body text</p></Modal>);

  it("is a labelled, modal dialog", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)[1];
    expect(html).toContain(`id="${labelledBy}"`);
    expect(html).toContain("Request changes");
  });

  it("has a close button that speaks, a body and a footer", () => {
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("Body text");
    expect(html).toContain("Send");
  });

  it("freezes the close button while a save is in flight", () => {
    const busy = renderToStaticMarkup(<Modal title="T" busy onClose={() => {}}>x</Modal>);
    expect(busy).toMatch(/aria-label="Close"[^>]*disabled|disabled[^>]*aria-label="Close"/);
  });

  it("Tab wraps at both ends and recovers when focus is outside", () => {
    expect(nextTrapIndex(false, 2, 3)).toBe(0);
    expect(nextTrapIndex(true, 0, 3)).toBe(2);
    expect(nextTrapIndex(false, 0, 3)).toBe(1);
    expect(nextTrapIndex(true, 2, 3)).toBe(1);
    expect(nextTrapIndex(false, -1, 3)).toBe(0);
    expect(nextTrapIndex(true, -1, 3)).toBe(2);
    expect(nextTrapIndex(false, 0, 0)).toBe(-1);
  });
});

describe("stylesheet additions", () => {
  it("dialogs become a bottom sheet on a phone", () => {
    const phone = HUB_CSS.slice(HUB_CSS.indexOf("@media (max-width: 760px)"));
    expect(phone).toContain("hubSheetIn");
    expect(phone).toContain("align-items: flex-end");
  });
  it("the whole programme card is clickable through the title, without nested buttons", () => {
    expect(HUB_CSS).toContain(".hub-prog-link::after");
  });
  it("the new icons exist", () => {
    for (const n of ["download", "circleCheck", "search", "calendar", "users", "mapPin"]) expect(ICON_NAMES).toContain(n);
  });
});


describe("button permissions are exactly the rules the screen always had", () => {
  // The original expressions, copied as they stood before they moved.
  const original = (program, profile) => {
    const canLogReport = (program.status === "Approved" || program.status === "Live") && (profile.is_admin || profile.chapter_name === program.chapter_name);
    const canEditReturned = program.status === "Returned" && (profile.is_admin || (profile.role === "RC" && profile.chapter_name === program.chapter_name));
    const canEditRcReturned = program.status === "RC Returned" && (profile.is_admin || program.submitted_by === profile.id);
    const canActAsRC = program.status === "RC Review" && (profile.is_admin || (profile.role === "RC" && profile.chapter_name === program.chapter_name));
    const canApprove = profile.is_admin && program.status === "Pending";
    return { canApprove: !!canApprove, canLogReport: !!canLogReport, canEditReturned: !!canEditReturned, canEditRcReturned: !!canEditRcReturned, canEdit: !!(canEditReturned || canEditRcReturned), canActAsRC: !!canActAsRC };
  };

  const statuses = ["Pending", "RC Review", "Returned", "RC Returned", "Approved", "Live", "Complete", "Declined"];
  const roles = ["NC", "RC", "TM"];
  const chapters = ["Benin", "Lagos", ""];
  const admins = [true, false, undefined];
  const submitters = ["me", "someone-else", undefined];

  it("agrees with the original on every combination of status, role, chapter, admin flag and submitter", () => {
    let checked = 0;
    for (const status of statuses) for (const role of roles) for (const pc of chapters) for (const is_admin of admins) for (const sub of submitters) {
      const program = { status, chapter_name: "Benin", submitted_by: sub };
      const profile = { id: "me", role, chapter_name: pc, is_admin };
      expect(programmePermissions(program, profile)).toEqual(original(program, profile));
      checked++;
    }
    expect(checked).toBe(8 * 3 * 3 * 3 * 3);
  });

  it("the headline rules, stated plainly", () => {
    const base = { chapter_name: "Benin" };
    const rc = { id: "r", role: "RC", chapter_name: "Benin", is_admin: false };
    const admin = { id: "a", role: "NC", chapter_name: "", is_admin: true };
    expect(programmePermissions({ ...base, status: "Pending" }, admin).canApprove).toBe(true);
    expect(programmePermissions({ ...base, status: "Pending" }, rc).canApprove).toBe(false);
    expect(programmePermissions({ ...base, status: "Approved" }, admin).canApprove).toBe(false);
    expect(programmePermissions({ ...base, status: "Pending" }, { ...rc, is_admin: false }).canEditReturned).toBe(false);
    expect(programmePermissions({ ...base, status: "Returned" }, rc).canEdit).toBe(true);
    expect(programmePermissions({ ...base, status: "Returned" }, { ...rc, chapter_name: "Lagos" }).canEdit).toBe(false);
    expect(programmePermissions({ ...base, status: "Approved" }, rc).canLogReport).toBe(true);
    expect(programmePermissions({ ...base, status: "Approved" }, { ...rc, chapter_name: "Lagos" }).canLogReport).toBe(false);
    expect(programmePermissions({ ...base, status: "Pending" }, rc).canLogReport).toBe(false);
  });
});
