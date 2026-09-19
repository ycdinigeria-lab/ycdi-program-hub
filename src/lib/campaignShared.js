// src/lib/campaignShared.js
//
// BATCH31-MARKER campaigns-screen
//
// The parts of the campaign screen that are decisions, not drawing. They
// are plain functions so they can be tested without a browser.
//
// None of this is the gate. The database decides who may do what
// (batch30-campaign-sending.sql). These functions only decide which
// buttons to show, and mirror a few of the database's rules so somebody
// gets a plain sentence before a raw database error.

// The only segments a campaign may go to. Champions, Partners, in-kind
// donors and grant funders get personal contact under YCDI-STR-004, so
// they are not on this list and the database refuses them as well.
export const BROADCAST_SEGMENTS = [
  ["team_all", "Everyone with a Hub login"],
  ["team_rcs", "Regional Coordinators"],
  ["volunteers_active", "Active volunteers"],
  ["donors_broadcast", "Supporters and Friends (donors)"],
  ["church_partners", "Church partners"],
  ["school_partners", "School partners"],
  ["alumni", "Alumni"],
  ["other_contacts", "Other contacts"],
];
export const SEGMENT_LABEL = Object.fromEntries(BROADCAST_SEGMENTS);
export const BROADCAST_KEYS = new Set(BROADCAST_SEGMENTS.map(([k]) => k));

// Label and colour family for each status. The word is always shown as
// well as the colour.
export const STATUS = {
  draft:     { label: "Draft",                tone: "muted" },
  submitted: { label: "Waiting for approval", tone: "gold" },
  returned:  { label: "Sent back",            tone: "red" },
  approved:  { label: "Approved",             tone: "blue" },
  sending:   { label: "Sending",              tone: "purple" },
  sent:      { label: "Sent",                 tone: "green" },
  cancelled: { label: "Cancelled",            tone: "muted" },
};

// What a preview shows in place of a real person.
export const SAMPLE = { first_name: "Grace", chapter: "Benin" };

// ---- merge fields -------------------------------------------------------
// Same rule as the database (merge_tags_ok) and the sender.
const TAG = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;
const KNOWN = new Set(["first_name", "chapter"]);

export function unknownMergeTags(text) {
  const found = new Set();
  for (const m of String(text ?? "").matchAll(TAG)) {
    if (!KNOWN.has(m[1].toLowerCase())) found.add(`{{${m[1]}}}`);
  }
  return [...found];
}

export function fillPreview(text, sample = SAMPLE) {
  return String(text ?? "").replace(TAG, (whole, name) => {
    const key = name.toLowerCase();
    if (key === "first_name") return sample.first_name;
    if (key === "chapter") return sample.chapter;
    return whole; // an unknown tag stays visible, so the writer sees it
  });
}

// Blank lines separate paragraphs; a single line break stays a line break.
export function paragraphsOf(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ---- checks before saving ----------------------------------------------
export function validateDraft(f) {
  if (!String(f.title ?? "").trim()) return "Give the campaign a name, so it is easy to find in the list. Only your team sees it.";
  if (!f.segment) return "Choose who this goes to.";
  if (!BROADCAST_KEYS.has(f.segment)) return "That group cannot be emailed as a campaign.";
  if (/[\r\n]/.test(f.subject ?? "")) return "The subject must be a single line.";
  return null;
}

export function validateForSubmit(f, sender) {
  const draft = validateDraft(f);
  if (draft) return draft;
  if (!String(f.subject ?? "").trim()) return "Add a subject line.";
  if (!String(f.body ?? "").trim()) return "Write the message.";
  if (!f.sender_id) return "Choose who the email is sent from.";
  if (!sender || !sender.active) return "That sender is switched off. Choose another, or switch it back on in Senders.";
  const bad = [...unknownMergeTags(f.subject), ...unknownMergeTags(f.body)];
  if (bad.length) return `${[...new Set(bad)].join(", ")} is not a merge field. Only {{first_name}} and {{chapter}} can be used.`;
  return null;
}

// ---- who can do what ----------------------------------------------------
export const isNC = (profile) => profile?.role === "NC";
export const holdsSeat = (profile, code) => (profile?.portfolios || []).includes(code);

// Only the Communications seat writes. The National Coordinator approves
// and does not write.
export const canWrite = (profile) => holdsSeat(profile, "COMMS");
// The National Coordinator or the Communications seat may add senders and
// start sending. Finance reads only.
export const canManage = (profile) => isNC(profile) || holdsSeat(profile, "COMMS");

// The buttons for one campaign, for one person. Returns action names.
export function nextActions(c, profile) {
  const mine = c.author_id === profile?.id;
  const nc = isNC(profile);
  const out = [];

  if (c.status === "draft" && mine) out.push("edit", "delete", "submit");
  if (c.status === "returned" && mine) out.push("edit", "submit");
  if (c.status === "submitted" && nc && !mine) out.push("approve", "return");
  if (c.status === "approved" && canManage(profile)) out.push("start");
  if (c.status === "sending" && canManage(profile)) out.push("send_more");
  if (["submitted", "approved", "sending"].includes(c.status) && nc) out.push("cancel");
  return out;
}

// ---- progress and what the sender reports -------------------------------
export function progressFigures(p) {
  const row = p || {};
  const n = (k) => Number(row[k]) || 0;
  const total = n("queued") + n("sending") + n("sent") + n("failed") + n("skipped");
  const done = n("sent") + n("failed") + n("skipped");
  return {
    total, sent: n("sent"), waiting: n("queued") + n("sending"),
    failed: n("failed"), skipped: n("skipped"),
    percent: total ? Math.round((100 * done) / total) : 0,
  };
}

const people = (n) => (n === 1 ? "1 person" : `${n} people`);

// Turns the answer from send-campaign-batch into a sentence, a colour, and
// whether it is worth pressing the button again straight away.
export function describeSendResult(body) {
  const s = body?.summary || {};
  const p = progressFigures(body?.progress);
  const sent = s.sent || 0;

  if (s.stopped === "fatal" || s.stopped === "no_adapter") {
    return { level: "error", again: false, message: s.message || "Sending stopped because of a setup problem. Nobody was lost." };
  }
  if (s.stopped === "throttled") {
    return { level: "warning", again: false, message: "The email provider asked us to slow down. Sending carries on by itself within the hour." };
  }
  if (s.stopped === "time") {
    return { level: "info", again: true, message: `${people(sent)} written to so far. Press Send next batch to carry on.` };
  }
  // idle: nothing left to claim right now
  if (p.waiting > 0) {
    return {
      level: "info", again: false,
      message: `${sent ? people(sent) + " written to. " : ""}The daily limit is reached for now. The other ${p.waiting} go out by themselves, hour by hour, as the limit frees up.`,
    };
  }
  return { level: "success", again: false, message: `Done. ${people(p.sent)} written to${p.failed ? `, ${p.failed} could not be reached` : ""}.` };
}
