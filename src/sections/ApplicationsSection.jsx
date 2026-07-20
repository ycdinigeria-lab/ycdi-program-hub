import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field, StatCard } from "../components/ui.jsx";
import { srOnly } from "../lib/a11y.js";
import {
  STATUSES, statusLabel, isOpen, roleKind,
  refereesRequired, ageOn, sortForReview,
} from "../lib/application.js";
// BATCH7B-MARKER applications-screening-panel
import ScreeningPanel from "./ScreeningPanel.jsx";

// Applications, from the coordinator's side.
//
// BATCH7A-MARKER applications-screen
//
// Two things this screen does not do.
//
// It does not let anybody edit what the applicant wrote. The columns a
// coordinator may change are granted at the database level and the
// applicant's own answers are not among them, so a record of what was
// actually submitted survives the review of it.
//
// And it does not hide a disclosure. Someone who ticks yes on the
// declaration has done the right thing, and burying that in a field
// nobody opens would defeat the purpose of asking. It is shown at the top
// of the record, worded as something to look at rather than something
// that has already been decided.

const TONE = { good: B.green, pending: B.gold, closed: B.muted };

function Pill({ status }) {
  const s = STATUSES.find((x) => x.key === status);
  const colour = s ? TONE[s.tone] : B.muted;
  return (
    <span style={{ background: colour + "18", color: colour, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap" }}>
      {statusLabel(status)}
    </span>
  );
}

function Line({ label, children }) {
  if (!children) return null;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2, fontFamily: "'Montserrat',sans-serif" }}>{label}</div>
      <div style={{ fontSize: 13, color: B.black, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

export default function ApplicationsSection({ profile, showToast }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [open, setOpen] = useState(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("volunteer_applications")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) showToast(error.message, "error");
    else setApps(sortForReview(data || []));
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c = { all: apps.length, open: 0, disclosures: 0 };
    STATUSES.forEach((s) => { c[s.key] = 0; });
    apps.forEach((a) => {
      c[a.status] = (c[a.status] || 0) + 1;
      if (isOpen(a.status)) c.open += 1;
      if (a.has_disclosure && isOpen(a.status)) c.disclosures += 1;
    });
    return c;
  }, [apps]);

  const shown = useMemo(() => {
    if (filter === "all") return apps;
    if (filter === "open") return apps.filter((a) => isOpen(a.status));
    if (filter === "disclosures") return apps.filter((a) => a.has_disclosure);
    return apps.filter((a) => a.status === filter);
  }, [apps, filter]);

  if (open) {
    return (
      <ApplicationRecord
        app={open}
        profile={profile}
        showToast={showToast}
        today={today}
        onClose={() => setOpen(null)}
        onChanged={() => { setOpen(null); load(); }}
      />
    );
  }

  const FILTERS = [
    { key: "open", label: "Still open", n: counts.open },
    { key: "disclosures", label: "Disclosures", n: counts.disclosures },
    { key: "all", label: "Everything", n: counts.all },
    ...STATUSES.map((s) => ({ key: s.key, label: s.label, n: counts[s.key] || 0 })),
  ];

  return (
    <div>
      <ShareLink />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard label="Waiting on you" value={counts.open} accent={B.blue} />
        <StatCard label="Appointed" value={counts.appointed || 0} accent={B.green} />
        <StatCard label="Disclosures to review" value={counts.disclosures} accent={B.red} />
      </div>

      <div role="group" aria-label="Filter applications" style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
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

      {loading ? (
        <div role="status" aria-live="polite" style={{ padding: "36px 0", textAlign: "center", color: B.muted, fontSize: 13 }}>
          Loading applications…
        </div>
      ) : !shown.length ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
            {counts.all === 0
              ? "No applications yet. Share the link above and they will land here."
              : "Nothing under this filter."}
          </p>
        </Card>
      ) : (
        <>
          <div aria-live="polite" style={srOnly}>{shown.length} applications shown.</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {shown.map((a) => (
              <li key={a.id}>
                <Card style={a.has_disclosure && isOpen(a.status) ? { borderLeft: `3px solid ${B.red}` } : undefined}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14.5, color: B.black }}>{a.full_name}</span>
                        <Pill status={a.status} />
                      </div>
                      <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>
                        {a.reference} · {roleKind(a.role_sought).label}
                        {a.submitted_at ? " · " + new Date(a.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </div>
                      {a.has_disclosure ? (
                        <div style={{ fontSize: 12, color: B.red, fontWeight: 700, marginTop: 6 }}>
                          Disclosure made. Review before proceeding.
                        </div>
                      ) : null}
                    </div>
                    <button onClick={() => setOpen(a)} style={{ ...btnG, flexShrink: 0 }}>
                      Open
                      <span style={srOnly}> the application from {a.full_name}</span>
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// The link, put where the person who needs to share it will find it.
// ------------------------------------------------------------------
function ShareLink() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined"
    ? window.location.origin + "/apply"
    : "https://hub.ycdinigeria.org/apply";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is refused often enough on mobile browsers that
      // failing silently would look like a broken button. The link is on
      // screen either way, so say so.
      setCopied(false);
    }
  }

  return (
    <Card style={{ marginBottom: 16, background: B.blueLight, border: `1px solid ${B.blue}` }}>
      <SHead as="h2" color={B.blue}>The application link</SHead>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: B.black, lineHeight: 1.65 }}>
        Share this anywhere. It opens without a login, so anybody can fill it in.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <code style={{ background: B.white, border: `1px solid ${B.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 12.5, color: B.black, wordBreak: "break-all", flex: "1 1 220px" }}>
          {url}
        </code>
        <button onClick={copy} style={btnP}>{copied ? "Copied" : "Copy link"}</button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------
// One application.
// ------------------------------------------------------------------
function ApplicationRecord({ app, profile, showToast, today, onClose, onChanged }) {
  const [notes, setNotes] = useState(app.coordinator_notes || "");
  const [decision, setDecision] = useState(app.status);
  const [reason, setReason] = useState(app.decision_note || "");
  const [busy, setBusy] = useState(false);
  const kind = roleKind(app.role_sought);
  const age = ageOn(app.date_of_birth, today);

  async function saveNotes() {
    setBusy(true);
    const { error } = await supabase
      .from("volunteer_applications")
      .update({ coordinator_notes: notes })
      .eq("id", app.id);
    setBusy(false);
    if (error) showToast(error.message, "error");
    else showToast("Notes saved.");
  }

  async function decide() {
    if ((decision === "declined" || decision === "withdrawn") && !reason.trim()) {
      showToast("Please give a short reason. It is what an unsuccessful applicant is owed.", "error");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("decide_application", {
      p_application: app.id,
      p_status: decision,
      p_note: reason || null,
    });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast(`${app.full_name}'s application moved to ${statusLabel(decision).toLowerCase()}.`);
    onChanged();
  }

  return (
    <div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: B.blue, fontSize: 12.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer", padding: "0 0 14px" }}>
        ‹ Back to applications
      </button>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 18, color: B.black }}>{app.full_name}</h2>
          <Pill status={app.status} />
        </div>
        <div style={{ fontSize: 12.5, color: B.muted, marginTop: 4 }}>
          {app.reference} · {kind.label} · {kind.referees === 1 ? "one referee" : "two referees"} required,
          interview {kind.interview}
        </div>
      </Card>

      {app.has_disclosure ? (
        <Card style={{ marginBottom: 14, background: "#FEF2F2", border: `1px solid ${B.red}` }}>
          <SHead as="h3" color={B.red}>Disclosure made</SHead>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: B.black, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {app.disclosure_detail}
          </p>
          <p style={{ margin: 0, fontSize: 12.5, color: B.muted, lineHeight: 1.65 }}>
            This applicant told you. That is what the declaration is for, and it is not by
            itself a reason to decline. YCDI-SAF-005 section 3.7 sets out how to assess it.
            If it concerns children, the National Coordinator is notified before anything else.
          </p>
        </Card>
      ) : (
        <Card style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: B.muted, lineHeight: 1.65 }}>
            Declaration completed, nothing disclosed.
          </p>
        </Card>
      )}

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Contact</SHead>
        <Line label="Email">{app.email}</Line>
        <Line label="Phone">{app.phone}</Line>
        <Line label="Date of birth">
          {app.date_of_birth ? `${app.date_of_birth}${age !== null ? ` (${age})` : ""}` : null}
        </Line>
        <Line label="Home address">{app.home_address}</Line>
        <Line label="Time at that address">{app.address_since}</Line>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Work and experience</SHead>
        <Line label="Occupation">{app.occupation}</Line>
        <Line label="Employment history">{app.employment_history}</Line>
        <Line label="Experience with young people">{app.youth_experience}</Line>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Church</SHead>
        <Line label="Church">{app.church_name}</Line>
        <Line label="Location">{app.church_location}</Line>
        <Line label="Pastor or elder">{app.pastor_name}</Line>
        <Line label="Contact">{app.pastor_contact}</Line>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Referees</SHead>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          {refereesRequired(app.role_sought) === 1
            ? "One referee needed for this role."
            : "Two referees needed for this role."}{" "}
          Contact them by phone or email. A written reference the applicant brought along is
          not enough on its own, under YCDI-SAF-005 section 3.3.
        </p>
        <Line label="First referee">
          {[app.referee1_name, app.referee1_relationship, app.referee1_contact].filter(Boolean).join(" · ")}
          {app.referee1_is_church_leader ? "\nChurch leader" : ""}
        </Line>
        {refereesRequired(app.role_sought) > 1 ? (
          <Line label="Second referee">
            {[app.referee2_name, app.referee2_relationship, app.referee2_contact].filter(Boolean).join(" · ")}
            {app.referee2_is_church_leader ? "\nChurch leader" : ""}
          </Line>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Faith and motivation</SHead>
        <Line label="Faith">{app.faith_statement}</Line>
        <Line label="Why YCDI">{app.motivation}</Line>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Screening</SHead>
        <p style={{ margin: "0 0 4px", fontSize: 12.5, color: B.muted, lineHeight: 1.65 }}>
          Reference checks against the six questions in YCDI-SAF-005 section 3.3, and the
          interview against the four categories in YCDI-HR-004 section 6. An appointment is
          refused until what section 3.1 asks for is on file.
        </p>
      </Card>

      <ScreeningPanel
        app={app}
        profile={profile}
        showToast={showToast}
        onChanged={onChanged}
      />

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Your notes</SHead>
        <Field label="Coordinator notes" hint="Not visible to the applicant.">
          <textarea style={ta} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button onClick={saveNotes} disabled={busy} style={{ ...btnG, opacity: busy ? 0.6 : 1 }}>Save notes</button>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead as="h3">Decision</SHead>
        <Field label="Move this application to">
          <select style={{ ...inp, appearance: "none" }} value={decision} onChange={(e) => setDecision(e.target.value)}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        {decision === "declined" || decision === "withdrawn" ? (
          <Field label="Reason" required hint="Unsuccessful applicants are told within two weeks, under YCDI-HR-004 section 8.">
            <textarea style={ta} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        ) : null}
        {decision === "appointed" ? (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: B.muted, lineHeight: 1.65 }}>
            Appointing records the decision. They still need a hub account before a volunteer
            record can be opened for them, and the register in Volunteer Register is where that
            happens.
          </p>
        ) : null}
        <button onClick={decide} disabled={busy || decision === app.status} style={{ ...btnP, opacity: busy || decision === app.status ? 0.5 : 1 }}>
          {busy ? "Saving…" : "Record decision"}
        </button>
      </Card>
    </div>
  );
}
