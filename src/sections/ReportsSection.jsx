import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnR, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";
import { useIsMobile } from "../useIsMobile.js";

// The reporting chain screen: a team member files a report or concept note,
// the RC returns or forwards it, the NC acknowledges.
//
// BATCH16-MARKER reporting-chain-screen
//
// Nothing about who may see or move a report is decided here. The database
// calls (submit, return, forward, acknowledge, appoint_rc) and the row
// rules on the submissions table do all of that. This screen only draws
// what comes back and offers the buttons the caller's role is allowed to use.

function niceDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function kindLabel(k) { return k === "concept_note" ? "Concept note" : "Report"; }

// A small status word, phrased from the point of view of the person reading
// it, with a colour that carries no meaning on its own.
function StatusPill({ status, role, chapterHasRc }) {
  let label = status, tone = "grey";
  if (role === "TM") {
    if (status === "draft")        { label = "Draft"; tone = "grey"; }
    else if (status === "submitted")   { label = "With your RC"; tone = "blue"; }
    else if (status === "returned")    { label = "Sent back to you"; tone = "red"; }
    else if (status === "forwarded")   { label = "With the National Coordinator"; tone = "blue"; }
    else if (status === "acknowledged"){ label = "Acknowledged"; tone = "green"; }
  } else if (role === "RC") {
    if (status === "submitted")        { label = "Waiting on you"; tone = "yellow"; }
    else if (status === "returned")    { label = "Sent back to the author"; tone = "red"; }
    else if (status === "forwarded")   { label = "Sent up"; tone = "blue"; }
    else if (status === "acknowledged"){ label = "Acknowledged"; tone = "green"; }
    else { label = "Draft"; tone = "grey"; }
  } else {
    if (status === "submitted")        { label = "No RC yet, came to you"; tone = "yellow"; }
    else if (status === "forwarded")   { label = "Waiting on you"; tone = "yellow"; }
    else if (status === "acknowledged"){ label = "Acknowledged"; tone = "green"; }
    else { label = status; tone = "grey"; }
  }
  const tones = {
    grey:   { bg: B.offWhite,    text: B.muted },
    blue:   { bg: B.blueLight,   text: "#065f87" },
    yellow: { bg: B.yellowLight, text: "#7a5c00" },
    red:    { bg: B.redLight,    text: "#8b0a1c" },
    green:  { bg: "#E8F5E9",     text: "#1a6b2f" },
  };
  const s = tones[tone];
  return (
    <span style={{ background: s.bg, color: s.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
      {label}
    </span>
  );
}

// The lines of a report, shown the same way wherever a report is opened.
function Body({ row }) {
  return (
    <div style={{ fontSize: 13, color: B.black, lineHeight: 1.6 }}>
      {row.place ? <div style={{ color: B.muted }}>Where: {row.place}</div> : null}
      {row.held_on ? <div style={{ color: B.muted }}>When: {niceDate(row.held_on)}</div> : null}
      {row.people_reached != null ? <div style={{ color: B.muted }}>Young people reached: {row.people_reached}</div> : null}
      <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{row.body}</p>
    </div>
  );
}

// ------------------------------------------------------------
// The form a team member fills in
// ------------------------------------------------------------
function SubmissionForm({ initial, onClose, onSaved, showToast }) {
  const [kind, setKind] = useState(initial?.kind || "report");
  const [title, setTitle] = useState(initial?.title || "");
  const [place, setPlace] = useState(initial?.place || "");
  const [heldOn, setHeldOn] = useState(initial?.held_on || "");
  const [body, setBody] = useState(initial?.body || "");
  const [reached, setReached] = useState(initial?.people_reached ?? "");
  const [busy, setBusy] = useState(false);
  const isReport = kind === "report";

  async function save(thenSubmit) {
    if (!title.trim() || !body.trim()) { showToast("A title and some detail are needed before saving.", "error"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("save_submission", {
      sub_id: initial?.id || null,
      p_kind: kind,
      p_title: title.trim(),
      p_body: body.trim(),
      p_place: isReport ? (place.trim() || null) : null,
      p_held_on: isReport && heldOn ? heldOn : null,
      p_people_reached: isReport && reached !== "" ? Number(reached) : null,
      p_program_id: null,
    });
    if (error) { showToast(error.message, "error"); setBusy(false); return; }
    if (thenSubmit) {
      const id = data || initial?.id;
      const { error: e2 } = await supabase.rpc("submit_submission", { sub_id: id });
      if (e2) { showToast(e2.message, "error"); setBusy(false); return; }
      showToast("Sent to your RC.");
    } else {
      showToast("Saved as a draft.");
    }
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <Card>
      <SHead>{initial?.id ? "Edit" : "New"} {kindLabel(kind).toLowerCase()}</SHead>
      <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
        <Field label="Kind">
          <select style={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="report">Report of an outreach</option>
            <option value="concept_note">Concept note (an idea or a plan)</option>
          </select>
        </Field>
        <Field label="Title" required>
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isReport ? "e.g. School visit at Grace Academy" : "e.g. A reading club for the estate"} />
        </Field>
        {isReport ? (
          <>
            <Field label="Where">
              <input style={inp} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="School or place" />
            </Field>
            <Field label="When">
              <input type="date" style={inp} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
            </Field>
            <Field label="Young people reached">
              <input type="number" min="0" style={inp} value={reached} onChange={(e) => setReached(e.target.value)} />
            </Field>
          </>
        ) : null}
        <Field label={isReport ? "What happened" : "The idea"} required>
          <textarea style={{ ...ta, minHeight: 120 }} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnP} disabled={busy} onClick={() => save(true)}>Save and send to RC</button>
          <button style={btnG} disabled={busy} onClick={() => save(false)}>Save as draft</button>
          <button style={btnG} disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// Team member view
// ------------------------------------------------------------
function AuthorView({ rows, reload, showToast }) {
  const [form, setForm] = useState(null); // null | { kind } | existing row

  async function submitNow(row) {
    const { error } = await supabase.rpc("submit_submission", { sub_id: row.id });
    if (error) { showToast(error.message, "error"); return; }
    showToast("Sent to your RC.");
    reload();
  }

  if (form) {
    return <SubmissionForm initial={form.id ? form : { kind: form.kind }} onClose={() => setForm(null)} onSaved={reload} showToast={showToast} />;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={btnP} onClick={() => setForm({ kind: "report" })}>New report</button>
        <button style={btnG} onClick={() => setForm({ kind: "concept_note" })}>New concept note</button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
            Nothing here yet. When you run an outreach, file a report and it goes
            to your RC. You can also send a concept note when you have an idea
            you would like the chapter to back.
          </p>
        </Card>
      ) : (
        rows.map((r) => {
          const editable = r.status === "draft" || r.status === "returned";
          return (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.black }}>{r.title || "Untitled"}</div>
                <StatusPill status={r.status} role="TM" />
              </div>
              <div style={{ fontSize: 11, color: B.muted, margin: "2px 0 8px" }}>{kindLabel(r.kind)}{r.held_on ? " · " + niceDate(r.held_on) : ""}</div>
              <Body row={r} />
              {r.status === "returned" && r.rc_note ? (
                <div style={{ background: B.redLight, borderRadius: 6, padding: "8px 12px", marginTop: 10, fontSize: 12.5, color: "#8b0a1c" }}>
                  Your RC sent this back: {r.rc_note}
                </div>
              ) : null}
              {editable ? (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button style={btnP} onClick={() => submitNow(r)}>Send to RC</button>
                  <button style={btnG} onClick={() => setForm(r)}>Edit</button>
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ------------------------------------------------------------
// RC view: open a waiting report, return it or forward it
// ------------------------------------------------------------
function RCPanel({ row, reload, showToast, onClose }) {
  const [title, setTitle] = useState(row.title || "");
  const [body, setBody] = useState(row.body || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const edited = title !== row.title || body !== row.body;

  async function doForward() {
    setBusy(true);
    const { error } = await supabase.rpc("forward_submission", {
      sub_id: row.id,
      edited_title: edited ? title.trim() : null,
      edited_body: edited ? body.trim() : null,
      note: note.trim() || null,
    });
    if (error) { showToast(error.message, "error"); setBusy(false); return; }
    showToast("Forwarded to the National Coordinator.");
    setBusy(false); reload(); onClose();
  }
  async function doReturn() {
    if (!note.trim()) { showToast("Add a short note so the author knows what to change.", "error"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("return_submission", { sub_id: row.id, note: note.trim() });
    if (error) { showToast(error.message, "error"); setBusy(false); return; }
    showToast("Sent back to the author.");
    setBusy(false); reload(); onClose();
  }

  return (
    <Card>
      <SHead>{row.title || "Untitled"}</SHead>
      <div style={{ fontSize: 11, color: B.muted, margin: "2px 0 10px" }}>{kindLabel(row.kind)} from a team member</div>
      <Body row={row} />

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <Field label="Title (edit before forwarding if you wish)">
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Report">
          <textarea style={{ ...ta, minHeight: 120 }} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {edited ? <div style={{ fontSize: 11.5, color: B.muted }}>The author's original wording is kept on file underneath your edit.</div> : null}
        <Field label="Note">
          <textarea style={ta} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Needed to send back. Optional when forwarding." />
        </Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnP} disabled={busy} onClick={doForward}>Acknowledge and forward</button>
          <button style={btnR} disabled={busy} onClick={doReturn}>Send back</button>
          <button style={btnG} disabled={busy} onClick={onClose}>Close</button>
        </div>
      </div>
    </Card>
  );
}

function RCView({ rows, reload, showToast }) {
  const [openId, setOpenId] = useState(null);
  const waiting = rows.filter((r) => r.status === "submitted");
  const rest = rows.filter((r) => r.status !== "submitted");
  const open = rows.find((r) => r.id === openId);

  if (open && open.status === "submitted") {
    return <RCPanel row={open} reload={reload} showToast={showToast} onClose={() => setOpenId(null)} />;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: B.black, marginBottom: 8 }}>Waiting on you</div>
        {waiting.length === 0 ? (
          <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nothing waiting. Reports from your team members land here when they submit them.</p></Card>
        ) : waiting.map((r) => (
          <Card key={r.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{r.title || "Untitled"}</div>
              <StatusPill status={r.status} role="RC" />
            </div>
            <div style={{ fontSize: 11, color: B.muted, margin: "2px 0 8px" }}>{kindLabel(r.kind)}{r.held_on ? " · " + niceDate(r.held_on) : ""}</div>
            <button style={btnP} onClick={() => setOpenId(r.id)}>Open</button>
          </Card>
        ))}
      </div>

      {rest.length ? (
        <div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: B.black, marginBottom: 8 }}>Already handled</div>
          {rest.map((r) => (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{r.title || "Untitled"}</div>
                <StatusPill status={r.status} role="RC" />
              </div>
              <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{kindLabel(r.kind)}</div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------
// NC view: acknowledge, and appoint an RC where a chapter has none
// ------------------------------------------------------------
function NCPanel({ row, chapterName, reload, showToast, onClose }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState(null);
  const [pick, setPick] = useState("");
  const noRc = row.status === "submitted";

  async function loadPeople() {
    const { data, error } = await supabase.from("profiles").select("id, full_name").eq("chapter_id", row.chapter_id).eq("role", "TM").order("full_name");
    if (error) { showToast(error.message, "error"); return; }
    setPeople(data || []);
  }
  async function doAppoint() {
    if (!pick) return;
    setBusy(true);
    const { error } = await supabase.rpc("appoint_rc", { target: pick });
    if (error) { showToast(error.message, "error"); setBusy(false); return; }
    showToast("Appointed. New reports from that chapter will route through them.");
    setBusy(false); reload(); onClose();
  }
  async function doAck() {
    setBusy(true);
    const { error } = await supabase.rpc("acknowledge_submission", { sub_id: row.id, note: note.trim() || null });
    if (error) { showToast(error.message, "error"); setBusy(false); return; }
    showToast("Acknowledged. The RC and the author can see it landed.");
    setBusy(false); reload(); onClose();
  }

  return (
    <Card>
      <SHead>{row.title || "Untitled"}</SHead>
      <div style={{ fontSize: 11, color: B.muted, margin: "2px 0 10px" }}>{kindLabel(row.kind)} · {chapterName || "Chapter"}</div>
      <Body row={row} />
      {row.author_body && row.author_body !== row.body ? (
        <div style={{ background: B.offWhite, borderRadius: 6, padding: "8px 12px", marginTop: 10, fontSize: 12.5, color: B.muted }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>The author's original words</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{row.author_body}</div>
        </div>
      ) : null}

      {noRc ? (
        <div style={{ background: B.yellowLight, borderRadius: 6, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: "#7a5c00" }}>
          This chapter has no RC yet, so the report came straight to you. You can appoint one.
          {people === null ? (
            <div style={{ marginTop: 8 }}><button style={btnG} onClick={loadPeople}>Choose a team member</button></div>
          ) : people.length === 0 ? (
            <div style={{ marginTop: 8 }}>No team members in this chapter to appoint yet.</div>
          ) : (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...sel, width: "auto", minWidth: 160 }} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Select a person…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <button style={btnP} disabled={busy || !pick} onClick={doAppoint}>Appoint as RC</button>
            </div>
          )}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <Field label="Note (optional)">
          <textarea style={ta} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnP} disabled={busy} onClick={doAck}>Acknowledge</button>
          <button style={btnG} disabled={busy} onClick={onClose}>Close</button>
        </div>
      </div>
    </Card>
  );
}

function NCView({ rows, reload, showToast, chapterName }) {
  const [openId, setOpenId] = useState(null);
  const waiting = rows.filter((r) => r.status === "forwarded" || r.status === "submitted");
  const done = rows.filter((r) => r.status === "acknowledged");
  const open = rows.find((r) => r.id === openId);

  if (open && (open.status === "forwarded" || open.status === "submitted")) {
    return <NCPanel row={open} chapterName={chapterName(open.chapter_id)} reload={reload} showToast={showToast} onClose={() => setOpenId(null)} />;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: B.black, marginBottom: 8 }}>Waiting on you</div>
        {waiting.length === 0 ? (
          <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nothing waiting. Reports appear here once an RC forwards them, or straight away from a chapter that has no RC yet.</p></Card>
        ) : waiting.map((r) => (
          <Card key={r.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{r.title || "Untitled"}</div>
              <StatusPill status={r.status} role="NC" />
            </div>
            <div style={{ fontSize: 11, color: B.muted, margin: "2px 0 8px" }}>{kindLabel(r.kind)} · {chapterName(r.chapter_id) || "Chapter"}</div>
            <button style={btnP} onClick={() => setOpenId(r.id)}>Open</button>
          </Card>
        ))}
      </div>

      {done.length ? (
        <div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: B.black, marginBottom: 8 }}>Acknowledged</div>
          {done.map((r) => (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{r.title || "Untitled"}</div>
                <StatusPill status={r.status} role="NC" />
              </div>
              <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{chapterName(r.chapter_id)}</div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------
export default function ReportsSection({ profile, chapters, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("submissions").select("*").order("updated_at", { ascending: false });
    if (error) showToast(error.message, "error");
    setRows(data || []);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const chapterName = useCallback(
    (id) => (chapters || []).find((c) => c.id === id)?.name || "",
    [chapters]
  );

  if (loading) return <div style={{ padding: "34px 10px", color: B.muted, fontSize: 13 }}>Loading reports…</div>;

  if (profile.role === "TM") return <AuthorView rows={rows} reload={load} showToast={showToast} />;
  if (profile.role === "RC") return <RCView rows={rows} reload={load} showToast={showToast} />;
  return <NCView rows={rows} reload={load} showToast={showToast} chapterName={chapterName} />;
}
