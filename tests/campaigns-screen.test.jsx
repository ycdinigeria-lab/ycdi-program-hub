// BATCH31-MARKER campaigns-screen
// The campaign screen's first frame for each kind of person: which buttons
// they are offered, what the composer lets them choose, that the preview
// cannot be turned into markup, and who is shown the door at all.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CampaignCard, CampaignForm, EmailPreview, SendersPanel,
} from "../src/sections/CampaignSection.jsx";
import { visibleMoreFeatures } from "../src/sections/MoreSection.jsx";

const noop = () => {};
const comms  = { id: "u-comms", role: "TM", is_admin: false, portfolios: ["COMMS"] };
const nc     = { id: "u-nc", role: "NC", is_admin: false, portfolios: [] };
const fin    = { id: "u-fin", role: "RC", is_admin: false, portfolios: ["FIN"] };
const admin  = { id: "u-adm", role: "TM", is_admin: true, portfolios: [] };
const member = { id: "u-tm", role: "TM", is_admin: false, portfolios: [] };
const rc     = { id: "u-rc", role: "RC", is_admin: false, portfolios: [] };

const senders = [
  { id: "s1", label: "Communications", from_name: "YCDI Communications", from_email: "comms@ycdinigeria.org", reply_to: "inbox@ycdinigeria.org", provider: "resend", active: true },
  { id: "s2", label: "Old address", from_name: "YCDI", from_email: "old@ycdinigeria.org", reply_to: null, provider: "resend", active: false },
];
const providers = [{ code: "resend", label: "Resend", daily_cap: 80, active: true }];
const counts = [
  { segment: "donors_broadcast", label: "Supporters and Friends (donors)", kind: "outside", broadcast_default: true, emailable: 12, blocked: 1 },
  { segment: "alumni", label: "Alumni", kind: "outside", broadcast_default: true, emailable: 40, blocked: 0 },
  { segment: "donors_personal", label: "Champions and Partners", kind: "outside", broadcast_default: false, emailable: 3, blocked: 0 },
];
const camp = (status, over = {}) => ({
  id: "c1", status, author_id: comms.id, title: "October update", subject: "Peace, {{first_name}}",
  body: "Hello.", segment: "donors_broadcast", sender_id: "s1", review_note: null,
  updated_at: "2026-09-15T10:00:00Z", ...over,
});
const card = (c, who) => renderToStaticMarkup(
  <CampaignCard c={c} profile={who} senders={senders} counts={counts} showToast={noop} reload={noop} onEdit={noop} />
);
const btn = (html, label) => html.includes(`>${label}<`);

describe("a submitted campaign", () => {
  const c = camp("submitted");
  it("offers the National Coordinator approve, send back and cancel", () => {
    const out = card(c, nc);
    expect(out).toContain("Waiting for approval");
    for (const b of ["Approve", "Send back", "Cancel campaign", "Preview"]) expect(btn(out, b)).toBe(true);
  });
  it("offers its author nothing but the preview", () => {
    const out = card(c, comms);
    expect(btn(out, "Preview")).toBe(true);
    for (const b of ["Approve", "Send back", "Edit", "Send for approval", "Delete draft", "Cancel campaign"]) expect(btn(out, b)).toBe(false);
  });
  it("offers Finance, an admin and a member nothing but the preview", () => {
    for (const who of [fin, admin, member]) {
      const out = card(c, who);
      for (const b of ["Approve", "Send back", "Start sending", "Cancel campaign"]) expect(btn(out, b)).toBe(false);
    }
  });
  it("does not let a National Coordinator approve their own", () => {
    const own = camp("submitted", { author_id: nc.id });
    const out = card(own, { ...nc, portfolios: ["COMMS"] });
    expect(btn(out, "Approve")).toBe(false);
    expect(btn(out, "Send back")).toBe(false);
  });
});

describe("a draft and a returned campaign", () => {
  it("lets the author edit, delete and send a draft up", () => {
    const out = card(camp("draft"), comms);
    for (const b of ["Edit", "Delete draft", "Send for approval"]) expect(btn(out, b)).toBe(true);
    expect(card(camp("draft"), nc)).not.toContain(">Edit<");
  });
  it("shows the reviewer's note, and lets the author mend and send it up again", () => {
    const out = card(camp("returned", { review_note: "Say who it is from" }), comms);
    expect(out).toContain("Sent back");
    expect(out).toContain("Say who it is from");
    expect(btn(out, "Edit")).toBe(true);
    expect(btn(out, "Send for approval")).toBe(true);
    expect(btn(out, "Delete draft")).toBe(false);
  });
});

describe("approved, sending and finished", () => {
  it("lets the National Coordinator or the Communications seat start an approved campaign", () => {
    expect(btn(card(camp("approved"), comms), "Start sending")).toBe(true);
    expect(btn(card(camp("approved"), nc), "Start sending")).toBe(true);
  });
  it("does not offer Finance or an admin a start button", () => {
    for (const who of [fin, admin, member]) expect(btn(card(camp("approved"), who), "Start sending")).toBe(false);
  });
  it("offers the next batch while it is sending, to the two who can send", () => {
    expect(btn(card(camp("sending"), comms), "Send next batch")).toBe(true);
    expect(btn(card(camp("sending"), fin), "Send next batch")).toBe(false);
  });
  it("offers a finished campaign no action at all", () => {
    for (const status of ["sent", "cancelled"]) {
      const out = card(camp(status), nc);
      for (const b of ["Approve", "Start sending", "Send next batch", "Cancel campaign", "Edit"]) expect(btn(out, b)).toBe(false);
    }
  });
});

describe("what a card tells you", () => {
  const out = card(camp("approved"), comms);
  it("says who it goes to, how many that is right now, and who it comes from", () => {
    expect(out).toContain("Supporters and Friends (donors)");
    expect(out).toContain("12 people right now");
    expect(out).toContain("YCDI Communications");
    expect(out).toContain("comms@ycdinigeria.org");
  });
  it("shows the status as a word as well as a colour", () => {
    expect(out).toContain("Approved");
  });
  it("never shows a recipient's address: the screen has none to show", () => {
    // Only the sender's own address appears; there is no list of people.
    const addresses = out.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
    expect([...new Set(addresses)]).toEqual(["comms@ycdinigeria.org"]);
  });
});

describe("the composer", () => {
  const form = (over = {}) => renderToStaticMarkup(
    <CampaignForm profile={comms} senders={senders} counts={counts} showToast={noop}
      row={null} onDone={noop} onCancel={noop} {...over} />
  );
  it("offers only groups a campaign may go to, with how many each would reach", () => {
    const out = form();
    expect(out).toContain("Supporters and Friends (donors) (12)");
    expect(out).toContain("Alumni (40)");
    expect(out).not.toContain("Champions and Partners");
    expect(out).not.toContain("Grant funders");
  });
  it("offers only senders that are switched on", () => {
    const out = form();
    expect(out).toContain("comms@ycdinigeria.org");
    expect(out).not.toContain("old@ycdinigeria.org");
  });
  it("chooses the sender for you when there is only one", () => {
    expect(form()).toMatch(/<option value="s1" selected/);
  });
  it("says so when there is no sender to choose", () => {
    expect(form({ senders: [] })).toContain("There is no sender yet");
  });
  it("offers both ways to save", () => {
    const out = form();
    expect(btn(out, "Save draft")).toBe(true);
    expect(btn(out, "Save and send for approval")).toBe(true);
  });
  it("opens an existing campaign with its words in place", () => {
    const out = form({ row: camp("returned", { title: "October update", subject: "Peace", body: "Hello there" }) });
    expect(out).toContain("Edit campaign");
    expect(out).toContain('value="October update"');
    expect(out).toContain("Hello there");
  });
  it("tells the writer the unsubscribe line is added for them", () => {
    expect(form()).toContain("The unsubscribe line is added for you");
  });
});

describe("the preview", () => {
  const preview = (subject, body) => renderToStaticMarkup(<EmailPreview subject={subject} body={body} />);
  it("fills in a sample name and chapter", () => {
    const out = preview("Peace, {{first_name}}", "Greetings from {{chapter}}.");
    expect(out).toContain("Peace, Grace");
    expect(out).toContain("Greetings from Benin.");
  });
  it("cannot be turned into markup by what is typed", () => {
    const out = preview("<b>Hi</b>", '<script>alert("x")</script><img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>Hi</b>");
    expect(out).toContain("&lt;script&gt;");
  });
  it("leaves an unknown merge field showing, so the writer sees it", () => {
    expect(preview("Hi", "Dear {{surname}}")).toContain("{{surname}}");
  });
  it("always shows the unsubscribe line, and says so when there is nothing yet", () => {
    const out = preview("", "");
    expect(out).toContain("Unsubscribe");
    expect(out).toContain("(no subject yet)");
    expect(out).toContain("Your message appears here");
  });
  it("makes a paragraph for each blank line", () => {
    expect((preview("s", "One\n\nTwo\n\nThree").match(/<p /g) || []).length).toBe(3);
  });
});

describe("senders and the daily limit", () => {
  const panel = (who) => renderToStaticMarkup(
    <SendersPanel profile={who} senders={senders} providers={providers} showToast={noop} reload={noop} />
  );
  it("lets the National Coordinator and the Communications seat add and switch off senders", () => {
    for (const who of [nc, comms]) {
      const out = panel(who);
      expect(btn(out, "Add a sender")).toBe(true);
      expect(btn(out, "Switch off")).toBe(true);
    }
  });
  it("shows Finance the senders without any way to change them", () => {
    const out = panel(fin);
    expect(out).toContain("comms@ycdinigeria.org");
    for (const b of ["Add a sender", "Switch off", "Switch on", "Delete", "Edit"]) expect(btn(out, b)).toBe(false);
  });
  it("lets only the National Coordinator change the daily limit", () => {
    expect(btn(panel(nc), "Save limit")).toBe(true);
    for (const who of [comms, fin]) {
      const out = panel(who);
      expect(btn(out, "Save limit")).toBe(false);
      expect(out).toContain("Only the National Coordinator can change this.");
    }
  });
  it("marks a sender that is switched off", () => {
    expect(panel(nc)).toContain("Switched off");
  });
  it("warns that an unverified domain is refused, without frightening", () => {
    expect(panel(nc)).toContain("Nothing is lost when that happens");
  });
});

describe("who is shown the door", () => {
  const sees = (who) => visibleMoreFeatures(who).some((f) => f.id === "campaigns");
  it("the National Coordinator, the Communications seat and the Finance seat", () => {
    for (const who of [nc, comms, fin]) expect(sees(who)).toBe(true);
  });
  it("nobody else, and an admin flag does not count", () => {
    for (const who of [admin, member, rc]) expect(sees(who)).toBe(false);
  });
  it("sits with the other communication tools", () => {
    const card = visibleMoreFeatures(nc).find((f) => f.id === "campaigns");
    expect(card.category).toBe("comms");
    expect(card.title).toBe("Email Campaigns");
  });
});
