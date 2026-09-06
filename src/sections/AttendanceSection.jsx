import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, btnP, btnG } from "../theme.js";
import { Card, SHead, Badge } from "../components/ui.jsx";
import { useIsMobile } from "../useIsMobile.js";

// The bulk attendance register.
//
// BATCH12-MARKER attendance-screen
//
// This is the screen that fills the one table the deduplicated beneficiary
// KPI counts from. A coordinator picks a programme, ticks who came, and
// saves. Everything about who may see and who may save is decided by the
// three database calls, not here: this screen only draws what they return
// and greys out the Save button when record_attendance would refuse anyway.

function niceDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// A quiet line describing the state of one programme's register, so the
// picker tells you at a glance where the work still is.
export function registerNote(count) {
  if (!count) return "No register taken yet";
  return count === 1 ? "1 person recorded" : count + " people recorded";
}

// ------------------------------------------------------------
// Choosing a programme
// ------------------------------------------------------------
function ProgrammePicker({ profile, onOpen, showToast }) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const showChapter = profile.role === "NC" || profile.is_admin;

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("attendance_programs");
      if (!live) return;
      if (error) showToast(error.message, "error");
      setRows(data || []);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [showToast]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.title || "").toLowerCase().includes(s) ||
      (r.chapter_name || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  if (loading) return <div style={{ padding: "34px 10px", color: B.muted, fontSize: 13 }}>Loading programmes…</div>;

  if (rows.length === 0) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
          There are no dated programmes to take a register for yet. A programme
          appears here once it has been created with a date. Add or date one in
          Programme Operations, then come back.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
        Pick a programme to take or edit its register. The number beside each
        one tells you how many young people are already recorded against it.
      </p>

      <input
        style={{ ...inp, marginBottom: 14 }}
        placeholder={showChapter ? "Search by programme or chapter" : "Search programmes"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search programmes"
      />

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((r) => (
          <button
            key={r.program_id}
            onClick={() => onOpen(r)}
            className="ycdi-morecard"
            style={{
              textAlign: "left", background: B.white, border: "1px solid #E4E8EC",
              borderRadius: 12, padding: "13px 15px", cursor: "pointer",
              fontFamily: "'Open Sans',sans-serif", display: "flex", alignItems: "center",
              gap: 12, width: "100%",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, lineHeight: 1.3 }}>
                {r.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 4 }}>
                <span style={{ fontSize: 11.5, color: B.muted }}>{niceDate(r.program_date)}</span>
                {showChapter && r.chapter_name ? (
                  <span style={{ fontSize: 11.5, color: B.muted }}>· {r.chapter_name}</span>
                ) : null}
                <span style={{ fontSize: 11.5, color: r.present_count ? B.green : B.muted, fontWeight: r.present_count ? 700 : 400 }}>
                  · {registerNote(r.present_count)}
                </span>
                {!r.can_record ? (
                  <span style={{ fontSize: 10.5, color: B.muted, fontStyle: "italic" }}>· view only</span>
                ) : null}
              </div>
            </div>
            {!isMobile ? <Badge status={r.status} /> : null}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
        {filtered.length === 0 ? (
          <p style={{ fontSize: 12.5, color: B.muted, padding: "6px 2px" }}>Nothing matches that search.</p>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// One programme's register
// ------------------------------------------------------------
function RegisterEditor({ programme, onBack, showToast }) {
  const [rows, setRows] = useState([]);
  const [ticked, setTicked] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [when, setWhen] = useState(programme.program_date || "");
  const canRecord = !!programme.can_record;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("program_register", { p_program: programme.program_id });
    if (error) showToast(error.message, "error");
    const list = data || [];
    setRows(list);
    setTicked(new Set(list.filter((r) => r.attended).map((r) => r.participant_id)));
    setLoading(false);
  }, [programme.program_id, showToast]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.full_name || "").toLowerCase().includes(s));
  }, [rows, q]);

  function toggle(id) {
    if (!canRecord) return;
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setAllShown(on) {
    if (!canRecord) return;
    setTicked((prev) => {
      const next = new Set(prev);
      shown.forEach((r) => { if (on) next.add(r.participant_id); else next.delete(r.participant_id); });
      return next;
    });
  }

  async function save() {
    if (!canRecord) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("record_attendance", {
      p_program: programme.program_id,
      p_date: when || null,
      p_present: Array.from(ticked),
    });
    setSaving(false);
    if (error) { showToast(error.message, "error"); return; }
    const r = (data && data[0]) || { present: ticked.size, added: 0, removed: 0 };
    const bits = [`${r.present} recorded`];
    if (r.added) bits.push(`${r.added} added`);
    if (r.removed) bits.push(`${r.removed} removed`);
    showToast("Register saved. " + bits.join(", ") + ".");
    load();
  }

  const tickedCount = ticked.size;
  const total = rows.length;

  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: B.blue, fontSize: 12.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer", padding: "0 0 14px", display: "inline-flex", alignItems: "center", gap: 5 }}
      >
        ‹ All programmes
      </button>

      <Card style={{ marginBottom: 16 }}>
        <SHead>{programme.title}</SHead>
        <div style={{ fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          {programme.chapter_name ? programme.chapter_name + " · " : ""}{niceDate(programme.program_date)}
        </div>

        {canRecord ? (
          <div style={{ marginTop: 14, maxWidth: 260 }}>
            <label htmlFor="att-date" style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif" }}>
              Date attended
            </label>
            <input id="att-date" type="date" style={inp} value={when || ""} onChange={(e) => setWhen(e.target.value)} />
            <div style={{ fontSize: 11, color: B.muted, marginTop: 5, lineHeight: 1.5 }}>
              Defaults to the programme date. Change it only if the session ran on a different day.
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, background: B.blueLight, border: "1px solid " + B.blue, borderRadius: 8, padding: "10px 13px", fontSize: 12, color: "#065f87", lineHeight: 1.55 }}>
            You can view this register. Recording is done by the chapter coordinator.
          </div>
        )}
      </Card>

      {loading ? (
        <div style={{ padding: "30px 10px", color: B.muted, fontSize: 13 }}>Loading the register…</div>
      ) : total === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
            This chapter has no active participants on file yet. Add young people
            under Participants and Discipleship first, then their names will show
            here to tick off.
          </p>
        </Card>
      ) : (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>
              {tickedCount} of {total} present
            </div>
            {canRecord ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnG} onClick={() => setAllShown(true)}>Tick all shown</button>
                <button style={btnG} onClick={() => setAllShown(false)}>Clear all shown</button>
              </div>
            ) : null}
          </div>

          <input
            style={{ ...inp, marginBottom: 12 }}
            placeholder="Find a name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a participant by name"
          />

          <div style={{ display: "grid", gap: 2 }}>
            {shown.map((r) => {
              const on = ticked.has(r.participant_id);
              return (
                <label
                  key={r.participant_id}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "10px 8px",
                    borderRadius: 8, cursor: canRecord ? "pointer" : "default",
                    background: on ? B.blueLight : "transparent",
                    border: "1px solid " + (on ? B.blue : "transparent"),
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!canRecord}
                    onChange={() => toggle(r.participant_id)}
                    style={{ width: 18, height: 18, flexShrink: 0, accentColor: B.blue }}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: B.black }}>{r.full_name}</span>
                  <span style={{ fontSize: 11, color: B.muted, whiteSpace: "nowrap" }}>{r.age_band}</span>
                </label>
              );
            })}
            {shown.length === 0 ? (
              <p style={{ fontSize: 12.5, color: B.muted, padding: "8px 2px" }}>No name matches that search.</p>
            ) : null}
          </div>
        </Card>
      )}

      {canRecord && total > 0 ? (
        <div style={{ position: "sticky", bottom: 0, marginTop: 14, background: B.white, borderTop: "1px solid " + B.border, padding: "12px 2px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: B.muted }}>
            {tickedCount === 0 ? "No one ticked. Saving now clears this register." : `${tickedCount} ticked as present`}
          </span>
          <button style={{ ...btnP, opacity: saving ? 0.7 : 1 }} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save register"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------
export default function AttendanceSection({ profile, showToast }) {
  const [open, setOpen] = useState(null);

  if (open) {
    return <RegisterEditor programme={open} onBack={() => setOpen(null)} showToast={showToast} />;
  }
  return <ProgrammePicker profile={profile} onOpen={setOpen} showToast={showToast} />;
}
