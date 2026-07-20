import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field, StatCard, Avatar } from "../components/ui.jsx";
import { srOnly } from "../lib/a11y.js";
import {
  ONBOARDING_STEPS, STATUSES, statusLabel,
  onboardingProgress, onboardingStalled, contactOverdue,
  certificateDue, serviceMonths, formatDay,
} from "../lib/volunteer.js";

// The coordinator's side of the volunteer record.
//
// Batch 6a built the record and gave each person a read-only view of
// their own. Nobody could put anybody on it, so the register has been
// sitting empty. This is the screen that fills it.
//
// BATCH6B-MARKER volunteer-register
//
// Two things worth knowing before reading the code.
//
// People with no volunteer record show up in this list. They are most of
// it on the first run. A register that only lists people already on the
// register is a report, not a working tool.
//
// Nothing here writes through a function. Batch 6a already gave
// coordinators insert and update rights on volunteer_records under row
// security, and those rules were tested by role-switching. Writing
// straight to the table means one set of rules rather than two that can
// drift apart.

const TONE_COLOUR = {
  good: B.green, pending: B.gold, warn: "#b45309", bad: B.red, closed: B.muted,
};

function StatusPill({ status }) {
  const s = STATUSES.find((x) => x.key === status);
  const colour = s ? TONE_COLOUR[s.tone] : B.muted;
  const label = s ? s.label : "No record";
  return (
    <span style={{ background: colour + "18", color: colour, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Flag({ children, colour }) {
  return (
    <span style={{ background: (colour || B.red) + "14", color: colour || B.red, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>
      {children}
    </span>
  );
}

// Every derived judgement about a person lives in volunteer.js and is
// tested there. This screen only asks the questions.
function flagsFor(row, today) {
  const out = [];
  if (!row.status) return out;
  if (onboardingStalled(row, today)) out.push({ text: "Onboarding stalled", colour: "#b45309" });
  if (contactOverdue(row, today)) out.push({ text: "No contact in 90 days", colour: B.red });
  if (certificateDue(row, today)) out.push({ text: "Certificate due", colour: B.green });
  return out;
}

export default function VolunteersSection({ profile, showToast }) {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    // Two calls rather than one joined query. A joined Supabase query
    // against tables with different row security was silently returning
    // nothing earlier in this project, and splitting it fixed it.
    const [reg, rl] = await Promise.all([
      supabase.rpc("volunteer_register"),
      supabase.from("volunteer_roles").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
    ]);
    if (reg.error) showToast(reg.error.message, "error");
    else setRows(reg.data || []);
    if (!rl.error) setRoles(rl.data || []);
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c = { all: rows.length, none: 0 };
    STATUSES.forEach((s) => { c[s.key] = 0; });
    rows.forEach((r) => {
      const k = r.status || "none";
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [rows]);

  const needsAttention = useMemo(
    () => rows.filter((r) => flagsFor(r, today).length > 0).length,
    [rows, today]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "attention") { if (!flagsFor(r, today).length) return false; }
      else if (filter === "none") { if (r.status) return false; }
      else if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return (r.full_name || "").toLowerCase().includes(q)
        || (r.chapter_name || "").toLowerCase().includes(q)
        || (r.role_names || []).join(" ").toLowerCase().includes(q);
    });
  }, [rows, filter, search, today]);

  if (editing) {
    return (
      <VolunteerEditor
        row={editing}
        roles={roles}
        profile={profile}
        showToast={showToast}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  const FILTERS = [
    { key: "all", label: "Everyone", n: counts.all },
    { key: "attention", label: "Needs attention", n: needsAttention },
    { key: "none", label: "Not on the register", n: counts.none },
    ...STATUSES.map((s) => ({ key: s.key, label: s.label, n: counts[s.key] || 0 })),
  ];

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
        {profile.role === "RC"
          ? `Everyone in ${profile.chapter_name || "your chapter"}, with their volunteer record where one exists.`
          : "Everyone across YCDI, with their volunteer record where one exists."}{" "}
        The six onboarding steps come from the Volunteer Handbook, section 2.1.
      </p>

      <div className="rstats" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard label="Active" value={counts.active || 0} accent={B.green} />
        <StatCard label="Onboarding" value={counts.onboarding || 0} accent={B.gold} />
        <StatCard label="Needs attention" value={needsAttention} accent={B.red} />
        <StatCard label="Not on the register" value={counts.none || 0} accent={B.muted} />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Field label="Search by name, chapter or volunteer role">
          <input
            style={inp}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Start typing a name"
          />
        </Field>
        <div role="group" aria-label="Filter the register" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                style={{
                  background: on ? B.blue : B.white,
                  color: on ? B.white : B.muted,
                  border: `1px solid ${on ? B.blue : B.border}`,
                  borderRadius: 20, padding: "5px 13px", fontSize: 12,
                  fontWeight: on ? 700 : 400, cursor: "pointer",
                  fontFamily: "'Open Sans',sans-serif",
                }}
              >
                {f.label} ({f.n})
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <div role="status" aria-live="polite" style={{ padding: "36px 0", textAlign: "center", color: B.muted, fontSize: 13 }}>
          Loading the register…
        </div>
      ) : !shown.length ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
            Nobody matches that. {filter !== "all" ? "Try 'Everyone'." : ""}
          </p>
        </Card>
      ) : (
        <>
          <div aria-live="polite" style={srOnly}>{shown.length} people shown.</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {shown.map((r) => {
              const flags = flagsFor(r, today);
              const p = r.status ? onboardingProgress(r) : null;
              return (
                <li key={r.profile_id}>
                  <Card>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <Avatar name={r.full_name} size={38} decorative />
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14.5, color: B.black }}>{r.full_name}</span>
                          <StatusPill status={r.status} />
                        </div>
                        <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>
                          {r.chapter_name || "No chapter"}
                          {r.role_names && r.role_names.length ? " · " + r.role_names.join(", ") : ""}
                          {r.status === "active" && r.started_on
                            ? ` · ${serviceMonths(r, today)} months of service`
                            : ""}
                        </div>
                        {p && !p.complete && r.status === "onboarding" ? (
                          <div style={{ fontSize: 12, color: B.muted, marginTop: 5 }}>
                            Step {p.done} of {p.total}. Next: {p.next.label.toLowerCase()}.
                          </div>
                        ) : null}
                        {r.mentor_name ? (
                          <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>Mentor: {r.mentor_name}</div>
                        ) : null}
                        {flags.length ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {flags.map((f) => <Flag key={f.text} colour={f.colour}>{f.text}</Flag>)}
                          </div>
                        ) : null}
                      </div>
                      <button
                        onClick={() => setEditing(r)}
                        style={{ ...btnG, flexShrink: 0 }}
                      >
                        {r.status ? "Open record" : "Start a record"}
                        <span style={srOnly}> for {r.full_name}</span>
                      </button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// One person's record.
// ------------------------------------------------------------------
function VolunteerEditor({ row, roles, profile, showToast, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    status: row.status || "onboarding",
    started_on: row.started_on || "",
    ended_on: row.ended_on || "",
    ended_reason: row.ended_reason || "",
    applied_on: row.applied_on || "",
    interviewed_on: row.interviewed_on || "",
    references_received_on: row.references_received_on || "",
    safeguarding_declaration_on: row.safeguarding_declaration_on || "",
    orientation_on: row.orientation_on || "",
    activated_on: row.activated_on || "",
    last_contact_on: row.last_contact_on || "",
    certificate_issued_on: row.certificate_issued_on || "",
    availability: row.availability || "",
    skills: row.skills || "",
    notes: row.notes || "",
    mentor_profile_id: row.mentor_profile_id || "",
  }));
  const [picked, setPicked] = useState(() => new Set(row.role_names || []));
  const [mentors, setMentors] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.rpc("mentor_candidates", { p_for_profile: row.profile_id }).then(({ data }) => {
      setMentors(data || []);
    });
  }, [row.profile_id]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleRole(name) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  // Checked here as well as in the database. The database has the final
  // say, but being told after pressing save is a poor way to find out
  // that a withdrawal needs an end date.
  function problem() {
    if ((form.status === "withdrawn" || form.status === "removed") && !form.ended_on) {
      return "A withdrawn or removed record needs an end date.";
    }
    if (form.started_on && form.ended_on && form.ended_on < form.started_on) {
      return "The end date is before the start date.";
    }
    if (form.status === "active" && !form.started_on) {
      return "An active volunteer needs a start date, otherwise their length of service cannot be worked out.";
    }
    return null;
  }

  async function save() {
    const bad = problem();
    if (bad) { showToast(bad, "error"); return; }
    setSaving(true);

    const payload = { profile_id: row.profile_id };
    Object.keys(form).forEach((k) => {
      const v = form[k];
      payload[k] = v === "" ? null : v;
    });

    const { data, error } = await supabase
      .from("volunteer_records")
      .upsert(payload, { onConflict: "profile_id" })
      .select("id")
      .single();

    if (error) { setSaving(false); showToast(error.message, "error"); return; }

    const recordId = data.id;
    const wanted = roles.filter((r) => picked.has(r.name)).map((r) => r.id);

    // Replace rather than reconcile. The list is at most ten rows for one
    // person, so working out the difference would be more code for no
    // gain, and a delete followed by an insert cannot leave a role
    // attached that the coordinator just unticked.
    const del = await supabase.from("volunteer_record_roles").delete().eq("record_id", recordId);
    if (del.error) { setSaving(false); showToast(del.error.message, "error"); return; }

    if (wanted.length) {
      const ins = await supabase
        .from("volunteer_record_roles")
        .insert(wanted.map((role_id) => ({ record_id: recordId, role_id })));
      if (ins.error) { setSaving(false); showToast(ins.error.message, "error"); return; }
    }

    setSaving(false);
    showToast(`${row.full_name}'s volunteer record saved.`);
    onSaved();
  }

  const p = onboardingProgress(form);

  return (
    <div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: B.blue, fontSize: 12.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer", padding: "0 0 14px" }}>
        ‹ Back to the register
      </button>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar name={row.full_name} size={44} decorative />
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 17, color: B.black }}>{row.full_name}</h2>
            <div style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>
              {row.chapter_name || "No chapter"} · {row.hub_role === "RC" ? "Regional Coordinator" : row.hub_role === "NC" ? "National Coordinator" : "Team Member"}
            </div>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Service</SHead>
        <Field label="Status" required>
          <select style={sel} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <div className="rcol2" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
          <Field label="Started on">
            <input style={inp} type="date" value={form.started_on} onChange={(e) => set("started_on", e.target.value)} />
          </Field>
          <Field label="Ended on">
            <input style={inp} type="date" value={form.ended_on} onChange={(e) => set("ended_on", e.target.value)} />
          </Field>
        </div>
        {form.status === "withdrawn" || form.status === "removed" || form.status === "suspended" ? (
          <Field label="Reason" hint="Kept on the record and shown in the audit log when the status changes.">
            <textarea style={ta} value={form.ended_reason} onChange={(e) => set("ended_reason", e.target.value)} />
          </Field>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Onboarding, Handbook section 2.1</SHead>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          {p.done} of {p.total} steps recorded.
          {p.outOfOrder ? " Some later steps have dates while an earlier one is blank, which usually means a step happened and nobody wrote it down." : ""}
        </p>
        {ONBOARDING_STEPS.map((s) => (
          <Field key={s.key} label={s.label} hint={s.blurb}>
            <input style={inp} type="date" value={form[s.key]} onChange={(e) => set(s.key, e.target.value)} />
          </Field>
        ))}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Volunteer roles, Handbook section 1.2</SHead>
        <div role="group" aria-label="Volunteer roles" style={{ display: "grid", gap: 8 }}>
          {roles.map((r) => (
            <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: B.black, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={picked.has(r.name)}
                onChange={() => toggleRole(r.name)}
                style={{ width: 17, height: 17, flexShrink: 0 }}
              />
              {r.name}
            </label>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Mentoring and contact, sections 5.1 and 5.4</SHead>
        <Field label="Mentor" hint="Active volunteers in the same chapter. Nobody mentors themselves.">
          <select style={sel} value={form.mentor_profile_id} onChange={(e) => set("mentor_profile_id", e.target.value)}>
            <option value="">Nobody assigned</option>
            {mentors.map((m) => <option key={m.profile_id} value={m.profile_id}>{m.full_name}</option>)}
          </select>
        </Field>
        <Field label="Last pastoral contact" hint={form.last_contact_on ? `Recorded as ${formatDay(form.last_contact_on)}.` : "Blank counts as overdue for an active volunteer."}>
          <input style={inp} type="date" value={form.last_contact_on} onChange={(e) => set("last_contact_on", e.target.value)} />
        </Field>
        <Field label="Certificate of service issued" hint="Section 5.2. Due after twelve months of service.">
          <input style={inp} type="date" value={form.certificate_issued_on} onChange={(e) => set("certificate_issued_on", e.target.value)} />
        </Field>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Right person, right seat</SHead>
        <Field label="Availability" hint="The volunteer can edit this themselves from My Profile.">
          <input style={inp} value={form.availability} onChange={(e) => set("availability", e.target.value)} placeholder="Saturday mornings" />
        </Field>
        <Field label="Skills">
          <textarea style={ta} value={form.skills} onChange={(e) => set("skills", e.target.value)} />
        </Field>
        <Field label="Coordinator notes" hint="Visible to this person's coordinator, the National Coordinator and admins. Not to the volunteer.">
          <textarea style={ta} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Card>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={save} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save record"}
        </button>
        <button onClick={onClose} style={btnG}>Cancel</button>
      </div>
    </div>
  );
}
