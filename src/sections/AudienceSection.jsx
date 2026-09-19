import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";

// BATCH29-MARKER audience-and-consent
//
// The audience: the people outside the Hub that YCDI writes to, and the
// do-not-email list that protects them. Nothing on this screen sends
// anything. It is the list a campaign will have to trust before it may.
//
// Who sees it (YCDI-STR-004 2.3, donor data is confidential): the
// National Coordinator, the Communications seat and the Finance seat.
// Finance reads. The National Coordinator and Communications also add,
// edit and stop people. Row security decides all of that; this screen
// only hides the buttons a person could not use.

const CATEGORIES = [
  ["donor", "Donor"],
  ["funder", "Grant funder"],
  ["church_partner", "Church partner"],
  ["school_partner", "School partner"],
  ["alumni", "Alumni"],
  ["other", "Other"],
];
const TIERS = [
  ["champion", "Champion"],
  ["partner", "Partner"],
  ["supporter", "Supporter"],
  ["friend", "Friend"],
  ["in_kind", "In-kind donor"],
];
const BASES = [
  ["consent", "Consent"],
  ["contract", "Contract"],
  ["legitimate_interest", "Legitimate interest"],
];
const REASONS = [
  ["unsubscribed", "Asked to stop"],
  ["manual", "Stopped by YCDI"],
  ["bounced", "Address bounced"],
  ["complaint", "Marked as spam"],
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);
const TIER_LABEL = Object.fromEntries(TIERS);
const BASIS_LABEL = Object.fromEntries(BASES);
const REASON_LABEL = Object.fromEntries(REASONS);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function AudienceSection({ profile, chapters, showToast }) {
  const [tab, setTab] = useState("segments");
  const [contacts, setContacts] = useState([]);
  const [stops, setStops] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null); // null, "new", or a contact row being edited
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  // NC or the Communications seat may change things. Finance reads only.
  // The database enforces this; here it only decides which buttons to show.
  const canManage = profile.role === "NC" || (profile.portfolios || []).includes("COMMS");

  const load = useCallback(async () => {
    setErr("");
    // Three separate reads, one per table, each under its own row rules.
    const [c, s, k] = await Promise.all([
      supabase.from("audience_contacts").select("*").order("full_name"),
      supabase.from("email_suppressions").select("*").order("created_at", { ascending: false }),
      supabase.rpc("audience_segment_counts"),
    ]);
    if (c.error || s.error || k.error) {
      setErr("Could not load the audience. If this keeps happening, the Batch 29 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setContacts(c.data || []);
    setStops(s.data || []);
    setCounts(k.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stopped = useMemo(() => new Set(stops.map((s) => s.email)), [stops]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return contacts.filter((c) =>
      (!cat || c.category === cat)
      && (!needle || (c.full_name + " " + c.email + " " + (c.organisation || "")).toLowerCase().includes(needle)));
  }, [contacts, q, cat]);

  const chapterName = useMemo(() => {
    const map = Object.fromEntries((chapters || []).map((c) => [c.id, c.name]));
    return (id) => map[id] || "";
  }, [chapters]);

  function switchTab(t) { setTab(t); setForm(null); }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading the audience…</div>;

  const hub = counts.filter((r) => r.kind === "hub");
  const outside = counts.filter((r) => r.kind === "outside");

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Audience</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Who YCDI can write to, and who it must not. Donor details are confidential: only the National Coordinator, the Communications seat and the Finance seat can open this. Nothing is sent from here.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => switchTab("segments")} style={tabBtn(tab === "segments")}>Segments</button>
        <button onClick={() => switchTab("contacts")} style={tabBtn(tab === "contacts")}>Contacts{contacts.length ? ` (${contacts.length})` : ""}</button>
        <button onClick={() => switchTab("stops")} style={tabBtn(tab === "stops")}>Do not email{stops.length ? ` (${stops.length})` : ""}</button>
      </div>

      {tab === "segments" ? (
        <div>
          <GroupTitle>People in the Hub</GroupTitle>
          <div style={grid}>{hub.map((r) => <SegmentCard key={r.segment} r={r} />)}</div>
          <GroupTitle>People outside the Hub</GroupTitle>
          <div style={grid}>{outside.map((r) => <SegmentCard key={r.segment} r={r} />)}</div>
          <p style={{ fontSize: 11.5, color: B.muted, lineHeight: 1.6, marginTop: 4 }}>
            The big number is how many people a segment would reach. Anyone on the do-not-email list is counted as blocked, never as reachable. Under-18 participants and their guardians are not part of the audience: a newsletter is a different purpose from the one they gave their details for.
          </p>
        </div>
      ) : null}

      {tab === "contacts" ? (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input style={{ ...inp, flex: 1, minWidth: 180 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or organisation" />
            <select style={{ ...sel, width: 170 }} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {canManage && !form ? <button onClick={() => setForm("new")} style={{ ...btnP, marginBottom: 14 }}>Add a contact</button> : null}

          {form ? (
            <ContactForm
              profile={profile} chapters={chapters} showToast={showToast}
              row={form === "new" ? null : form}
              onDone={() => { setForm(null); load(); }}
              onCancel={() => setForm(null)} />
          ) : null}

          {!shown.length ? (
            <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>
              {contacts.length ? "Nobody matches that." : canManage ? "No contacts yet. Add the first one above." : "No contacts yet."}
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {shown.map((c) => (
                <ContactCard
                  key={c.id} c={c} blocked={stopped.has(c.email)} canManage={canManage}
                  chapterName={chapterName} profile={profile} showToast={showToast}
                  reload={load} onEdit={() => setForm(c)} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "stops" ? (
        <div>
          <Card style={{ marginBottom: 14, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
            Every address here is blocked from every campaign, whether it belongs to a contact, a volunteer or someone else. There is no undo button on purpose: withdrawal takes effect at once. If someone asks to hear from YCDI again, that needs their fresh consent and a manual change by whoever looks after the database.
          </Card>

          {canManage ? <StopForm profile={profile} showToast={showToast} onDone={load} /> : null}

          {!stops.length ? (
            <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>Nobody is on the list.</Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stops.map((s) => (
                <Card key={s.email} style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: B.black }}>{s.email}</div>
                    <div style={{ fontSize: 11.5, color: B.muted }}>{REASON_LABEL[s.reason] || s.reason} · {fmtDate(s.created_at)}</div>
                  </div>
                  {s.note ? <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>{s.note}</div> : null}
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginBottom: 16 };

function GroupTitle({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: 0.6, margin: "4px 0 8px", fontFamily: "'Montserrat',sans-serif" }}>{children}</div>;
}

function SegmentCard({ r }) {
  return (
    <Card style={{ padding: 14, borderLeft: `3px solid ${r.broadcast_default ? B.blue : B.gold}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.35 }}>{r.label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: B.blue, fontFamily: "'Montserrat',sans-serif" }}>{r.emailable}</div>
      </div>
      <div style={{ fontSize: 11.5, color: r.blocked ? B.red : B.muted, marginTop: 4 }}>
        {r.blocked ? `${r.blocked} blocked by the do-not-email list` : "None blocked"}
      </div>
      {!r.broadcast_default ? (
        <div style={{ fontSize: 11.5, color: B.gold, marginTop: 6, lineHeight: 1.5 }}>
          Personal contact by policy. Left out of mass emails by default.
        </div>
      ) : null}
    </Card>
  );
}

function ContactCard({ c, blocked, canManage, chapterName, profile, showToast, reload, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function stop() {
    setBusy(true);
    const { error } = await supabase.rpc("suppress_email", {
      p_email: c.email, p_reason: "unsubscribed", p_note: "Recorded in the Hub by " + (profile.full_name || "a coordinator"),
    });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Added to the do-not-email list.");
    reload();
  }

  async function remove() {
    setBusy(true);
    const { data, error } = await supabase.from("audience_contacts").delete().eq("id", c.id).select();
    setBusy(false);
    if (error || !data || !data.length) { showToast(error ? error.message : "That was not allowed.", "error"); return; }
    showToast("Contact deleted. Any stop on this address stays in place.");
    reload();
  }

  const kind = [
    CATEGORY_LABEL[c.category] || c.category,
    c.donor_tier ? TIER_LABEL[c.donor_tier] : null,
    c.organisation,
    c.chapter_id ? chapterName(c.chapter_id) : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card style={{ padding: 14, borderLeft: `3px solid ${blocked ? B.red : B.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{c.full_name}</div>
        {blocked ? (
          <span style={{ background: B.redLight, color: B.red, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>Do not email</span>
        ) : null}
      </div>
      <div style={{ fontSize: 12.5, color: B.black, marginTop: 3 }}>{c.email}</div>
      <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>{kind}</div>
      <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>
        Held on: {BASIS_LABEL[c.lawful_basis] || c.lawful_basis} since {fmtDate(c.basis_recorded_on)}
        {c.source ? " · from " + c.source : ""}
      </div>
      {c.basis_note ? <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.5 }}>{c.basis_note}</div> : null}

      {canManage ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={onEdit} style={btnG} disabled={busy}>Edit</button>
          {!blocked ? <button onClick={stop} style={btnG} disabled={busy}>Stop emailing</button> : null}
          {!confirming ? (
            <button onClick={() => setConfirming(true)} style={btnG} disabled={busy}>Delete</button>
          ) : (
            <>
              <button onClick={remove} style={btnP} disabled={busy}>Yes, delete this contact</button>
              <button onClick={() => setConfirming(false)} style={btnG} disabled={busy}>Keep</button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function ContactForm({ profile, chapters, showToast, row, onDone, onCancel }) {
  const isEdit = !!row;
  const [f, setF] = useState({
    full_name: row?.full_name || "",
    email: row?.email || "",
    organisation: row?.organisation || "",
    category: row?.category || "donor",
    donor_tier: row?.donor_tier || "",
    chapter_id: row?.chapter_id || "",
    source: row?.source || "",
    lawful_basis: row?.lawful_basis || "",
    basis_note: row?.basis_note || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const isDonor = f.category === "donor";

  async function save() {
    if (!f.full_name.trim()) { showToast("Add a name.", "warning"); return; }
    if (!isEdit && !f.email.trim()) { showToast("Add an email address.", "warning"); return; }
    if (isDonor && !f.donor_tier) { showToast("A donor needs a tier, so a Champion is never sent a mass email by mistake.", "warning"); return; }
    if (!f.lawful_basis) { showToast("Record the basis YCDI holds these details on.", "warning"); return; }

    setBusy(true);
    const payload = {
      full_name: f.full_name.trim(),
      organisation: f.organisation.trim() || null,
      category: f.category,
      donor_tier: isDonor ? f.donor_tier : null,
      chapter_id: f.chapter_id || null,
      source: f.source.trim() || null,
      lawful_basis: f.lawful_basis,
      basis_note: f.basis_note.trim() || null,
    };
    let error;
    if (isEdit) {
      // The address is fixed once a contact exists. To change it, delete
      // and re-enter: a stop on the old address then stays where it is.
      const res = await supabase.from("audience_contacts").update(payload).eq("id", row.id).select();
      error = res.error || (!res.data || !res.data.length ? { message: "That was not allowed." } : null);
    } else {
      ({ error } = await supabase.from("audience_contacts").insert({ ...payload, email: f.email.trim(), created_by: profile.id }));
    }
    setBusy(false);
    if (error) {
      showToast(error.code === "23505" ? "That address is already in the audience." : error.message, "error");
      return;
    }
    showToast(isEdit ? "Saved." : "Contact added.");
    onDone();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead as="h3">{isEdit ? "Edit contact" : "New contact"}</SHead>
      <p style={{ margin: "0 0 12px", fontSize: 11.5, color: B.muted, lineHeight: 1.6 }}>
        Adults only. Never enter someone under 18, or a parent or guardian recorded for a participant. Alumni who took part as teenagers belong here only once they are adults and have agreed to hear from YCDI.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Name"><input style={inp} value={f.full_name} onChange={set("full_name")} /></Field>
        <Field label="Email" hint={isEdit ? "Fixed once saved." : undefined}>
          <input style={{ ...inp, background: isEdit ? B.offWhite : B.white }} type="email" value={f.email} onChange={set("email")} disabled={isEdit} />
        </Field>
        <Field label="Organisation"><input style={inp} value={f.organisation} onChange={set("organisation")} placeholder="Optional" /></Field>
        <Field label="Category">
          <select style={sel} value={f.category} onChange={set("category")}>
            {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {isDonor ? (
          <Field label="Donor tier" hint="Champions and Partners get personal contact, not mass email.">
            <select style={sel} value={f.donor_tier} onChange={set("donor_tier")}>
              <option value="">Choose a tier</option>
              {TIERS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Chapter" hint="Optional. The chapter that knows them.">
          <select style={sel} value={f.chapter_id} onChange={set("chapter_id")}>
            <option value="">None</option>
            {(chapters || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Where they came from"><input style={inp} value={f.source} onChange={set("source")} placeholder="e.g. Conference 2025, referral" /></Field>
        <Field label="Basis YCDI holds these details on">
          <select style={sel} value={f.lawful_basis} onChange={set("lawful_basis")}>
            <option value="">Choose one</option>
            {BASES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Note on the basis" hint="For example, when and how they agreed.">
        <textarea style={ta} value={f.basis_note} onChange={set("basis_note")} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{isEdit ? "Save" : "Add contact"}</button>
        <button onClick={onCancel} style={btnG} disabled={busy}>Cancel</button>
      </div>
    </Card>
  );
}

function StopForm({ profile, showToast, onDone }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("unsubscribed");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email.trim()) { showToast("Add the email address.", "warning"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("suppress_email", {
      p_email: email.trim(),
      p_reason: reason,
      p_note: note.trim() || "Recorded in the Hub by " + (profile.full_name || "a coordinator"),
    });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    setEmail(""); setNote("");
    showToast("Added to the do-not-email list.");
    onDone();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead as="h3">Add an address</SHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Email"><input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Why">
          <select style={sel} value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Note" hint="Optional. For example, how they asked.">
        <input style={inp} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button onClick={add} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>Add to the list</button>
    </Card>
  );
}

function tabBtn(on) {
  return {
    padding: "8px 16px", borderRadius: 8, border: "1.5px solid " + (on ? B.blue : B.border),
    background: on ? B.blue : B.white, color: on ? B.white : B.muted, fontSize: 12.5,
    fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
  };
}
