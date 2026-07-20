// Turning an audit row into a sentence somebody can read.
//
// No React, no Supabase, nothing that needs a browser, so every rule in
// here is testable on its own.
//
// The database stores short machine keys like 'role_changed' rather than
// finished English, because a sentence written into the row three years
// ago cannot be corrected later and a key can be re-worded any time.
//
// BATCH6B-MARKER audit-logic

export const ENTITIES = [
  { key: "profile", label: "Access", blurb: "Roles, chapters and admin rights" },
  { key: "safeguarding", label: "Safeguarding", blurb: "Incidents raised, moved, referred and closed" },
  { key: "kpi_target", label: "KPI targets", blurb: "Board and funder targets" },
  { key: "volunteer", label: "Volunteers", blurb: "Status changes and mentoring" },
];

export function entityLabel(key) {
  const e = ENTITIES.find((x) => x.key === key);
  return e ? e.label : "Other";
}

// Tone drives colour on screen. 'alert' is for anything that widens
// somebody's access or applies a sanction, because those are the two
// kinds of entry a reviewer is actually scanning for.
const ACTIONS = {
  role_changed: { tone: "alert", verb: "changed the role of" },
  chapter_changed: { tone: "normal", verb: "moved" },
  admin_granted: { tone: "alert", verb: "gave admin rights to" },
  admin_removed: { tone: "normal", verb: "removed admin rights from" },
  account_removed: { tone: "alert", verb: "removed the account of" },

  incident_raised: { tone: "alert", verb: "raised" },
  status_changed: { tone: "normal", verb: "moved" },
  suspension_applied: { tone: "alert", verb: "recorded a suspension on" },
  suspension_lifted: { tone: "normal", verb: "lifted the suspension on" },
  referred: { tone: "alert", verb: "referred" },
  nc_notified: { tone: "normal", verb: "notified the National Coordinator about" },
  incident_closed: { tone: "normal", verb: "closed" },
  action_logged: { tone: "normal", verb: "logged an action on" },

  target_set: { tone: "normal", verb: "set a target for" },
  target_changed: { tone: "alert", verb: "changed the target for" },
  baseline_changed: { tone: "normal", verb: "changed the baseline for" },
  target_removed: { tone: "alert", verb: "removed the target for" },

  record_created: { tone: "normal", verb: "started a volunteer record for" },
  mentor_changed: { tone: "normal", verb: "changed the mentor for" },
};

export function actionTone(row) {
  const a = ACTIONS[row && row.action];
  if (!a) return "normal";
  // A volunteer being suspended or removed matters as much as an access
  // change, and it arrives under the same generic key as every other
  // status move, so it is picked out here rather than in the database.
  if (row.entity === "volunteer" && row.action === "status_changed") {
    return row.new_value === "suspended" || row.new_value === "removed" ? "alert" : "normal";
  }
  return a.tone;
}

// Role codes are stored, not titles, because the code is what the rest
// of the app tests against.
export function roleName(code) {
  if (code === "NC") return "National Coordinator";
  if (code === "RC") return "Regional Coordinator";
  if (code === "TM") return "Team Member";
  return code || "no role";
}

function subject(row) {
  return row.subject_name || "someone whose account has since been removed";
}

// One entry, as a sentence. Deliberately plain: an audit log that reads
// like system output gets skimmed, and skimming is how things get missed.
export function describeEntry(row) {
  if (!row) return "";
  const who = row.actor_name || "Someone";
  const a = row.action;

  if (row.entity === "profile") {
    if (a === "role_changed") {
      return `${who} changed ${subject(row)} from ${roleName(row.old_value)} to ${roleName(row.new_value)}.`;
    }
    if (a === "chapter_changed") {
      return `${who} moved ${subject(row)} from ${row.old_value || "no chapter"} to ${row.new_value || "no chapter"}.`;
    }
    if (a === "admin_granted") return `${who} gave admin rights to ${subject(row)}.`;
    if (a === "admin_removed") return `${who} removed admin rights from ${subject(row)}.`;
    if (a === "account_removed") return row.detail || `${who} removed an account.`;
  }

  if (row.entity === "safeguarding") {
    const ref = row.entity_id || "an incident";
    if (a === "incident_raised") return `${who} raised ${ref}. ${row.detail || ""}`.trim();
    if (a === "status_changed") return `${who} moved ${ref} from ${row.old_value} to ${row.new_value}.`;
    if (a === "suspension_applied") return `${who} recorded a suspension against ${ref}.`;
    if (a === "suspension_lifted") return `${who} lifted the suspension recorded against ${ref}.`;
    if (a === "referred") return `${who} referred ${ref}. ${row.detail || ""}`.trim();
    if (a === "nc_notified") return `${who} notified the National Coordinator about ${ref}.`;
    if (a === "incident_closed") return `${who} closed ${ref}.`;
    if (a === "action_logged") return `${who} logged an action on ${ref}: ${row.detail || "no detail given"}.`;
  }

  if (row.entity === "kpi_target") {
    const [year, key] = String(row.entity_id || ":").split(":");
    const what = `${key || "a KPI"} for ${year || "an unknown year"}`;
    if (a === "target_set") return `${who} set the annual target for ${what} to ${row.new_value}.`;
    if (a === "target_changed") return `${who} changed the annual target for ${what} from ${row.old_value ?? "nothing"} to ${row.new_value ?? "nothing"}.`;
    if (a === "baseline_changed") return `${who} changed the baseline for ${what} from ${row.old_value ?? "nothing"} to ${row.new_value ?? "nothing"}.`;
    if (a === "target_removed") return `${who} removed the target for ${what}.`;
  }

  if (row.entity === "volunteer") {
    if (a === "record_created") return `${who} started a volunteer record for ${subject(row)}.`;
    if (a === "status_changed") {
      const base = `${who} moved ${subject(row)} from ${row.old_value} to ${row.new_value}.`;
      return row.detail ? `${base} Reason given: ${row.detail}` : base;
    }
    if (a === "mentor_changed") {
      if (!row.old_value) return `${who} assigned ${row.new_value} as mentor to ${subject(row)}.`;
      if (!row.new_value) return `${who} removed ${row.old_value} as mentor to ${subject(row)}.`;
      return `${who} changed the mentor for ${subject(row)} from ${row.old_value} to ${row.new_value}.`;
    }
  }

  // Anything the database learns to record before this file is updated
  // still shows up, rather than vanishing because there is no sentence
  // written for it yet.
  const verb = (ACTIONS[a] && ACTIONS[a].verb) || String(a || "acted").replace(/_/g, " ");
  return `${who} ${verb} ${row.entity_id || subject(row)}.`.replace(/\s+/g, " ");
}

// Dates arrive as ISO timestamps with a zone on them, so the ordinary
// Date constructor is correct here, unlike the bare 'YYYY-MM-DD' dates
// in volunteer.js which have no zone and must not be read as UTC.
export function formatWhen(value, now = new Date()) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Full stamp for the line underneath, since "3 days ago" is friendly and
// useless the moment somebody has to quote it in a Board paper.
export function formatStamp(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Entries grouped under the day they happened, newest day first, so the
// screen reads as a diary rather than a stream.
export function groupByDay(rows) {
  const out = [];
  const seen = new Map();
  (rows || []).forEach((row) => {
    const d = new Date(row.occurred_at);
    if (isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0, 10);
    if (!seen.has(key)) {
      const group = { day: key, label: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), rows: [] };
      seen.set(key, group);
      out.push(group);
    }
    seen.get(key).rows.push(row);
  });
  return out;
}
