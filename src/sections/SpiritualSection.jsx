import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, btnP, btnG } from "../theme.js";
import { Card, SHead } from "../components/ui.jsx";
import { DISCIPLESHIP_STAGES, TEACHING_OUTLINE, CHARACTER_STANDARDS, PRAYER_CALENDAR, COUNSELLING_REFERRAL } from "../data/spiritual.js";

function DiscipleshipView() {
  const [active, setActive] = useState(0);
  const s = DISCIPLESHIP_STAGES[active];
  const stageColors = [B.blue, B.purple, B.green, B.gold, B.red];

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead color={B.purple}>Five-stage discipleship pathway - 2 Timothy 2:2</SHead>
      {/* Five across only works when there is room for five. Wrapping pills
          behave at every width instead of squeezing "Multiply" off the edge. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
        {DISCIPLESHIP_STAGES.map((st, i) => (
          <button
            key={st.stage}
            onClick={() => setActive(i)}
            style={{
              flex: "1 1 88px", minWidth: 0, padding: "9px 10px", borderRadius: 20,
              background: active === i ? stageColors[i] : B.white,
              color: active === i ? B.white : B.muted,
              border: "1.5px solid " + (active === i ? stageColors[i] : B.border),
              cursor: "pointer", fontSize: 12, fontWeight: active === i ? 700 : 400,
              fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {st.stage}
          </button>
        ))}
      </div>
      <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'Montserrat',sans-serif" }}>Description</div>
          <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.7 }}>{s.desc}</p>
          <div style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'Montserrat',sans-serif" }}>Scripture anchor</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: stageColors[active], fontStyle: "italic", marginBottom: 12 }}>{s.ref}</div>
          <div style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontFamily: "'Montserrat',sans-serif" }}>Responsibility</div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>{s.responsibility}</div>
          <div style={{ padding: "10px 12px", background: B.offWhite, borderRadius: 6, fontSize: 12 }}>Progress indicator: {s.indicator}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontFamily: "'Montserrat',sans-serif" }}>Key activities</div>
          {s.activities.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: "1px solid " + B.offWhite, fontSize: 13 }}>
              <span style={{ color: stageColors[active], fontWeight: 700, flexShrink: 0 }}>&gt;</span>{a}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function TeachingView() {
  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead color={B.purple}>YCDI teaching outline standard</SHead>
      <p style={{ fontSize: 13, color: B.muted, margin: "0 0 14px", lineHeight: 1.6 }}>All YCDI biblical teachings shall follow this six-step structure:</p>
      {TEACHING_OUTLINE.map((t, i) => (
        <div key={t.step} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: i < TEACHING_OUTLINE.length - 1 ? "1px solid " + B.offWhite : "none" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: B.purple, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.purple, fontFamily: "'Montserrat',sans-serif", marginBottom: 3 }}>{t.step}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{t.desc}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 14, background: B.purpleLight, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: B.purple, lineHeight: 1.6 }}>
        Note: YCDI facilitators are encouraged to prepare their own teachings from Scripture - not to read pre-written scripts.
      </div>
    </Card>
  );
}

function CharacterView() {
  const [active, setActive] = useState(null);
  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead color={B.purple}>Biblical ethics and conduct - ten character standards</SHead>
      <p style={{ fontSize: 13, color: B.muted, margin: "0 0 14px", lineHeight: 1.6 }}>Every YCDI leader is called to embody these ten Christ-formed character standards. Tap any to read in full.</p>
      <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
        {CHARACTER_STANDARDS.map((c, i) => (
          <div key={c.name} onClick={() => setActive(active === i ? null : i)} style={{ padding: "12px 14px", borderRadius: 8, border: "1.5px solid " + (active === i ? B.purple : B.border), cursor: "pointer", background: active === i ? B.purpleLight : B.white }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: active === i ? B.purple : B.black, fontFamily: "'Montserrat',sans-serif" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: B.muted, fontStyle: "italic" }}>{c.ref}</div>
              </div>
              <span style={{ color: B.purple, fontSize: 12, fontWeight: 700 }}>{active === i ? "hide" : "read"}</span>
            </div>
            {active === i ? <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.7 }}>{c.desc}</p> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PrayerView({ profile, showToast }) {
  const [notes, setNotes] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const isNC = profile && profile.role === "NC";

  useEffect(() => {
    let ignore = false;
    supabase.from("prayer_schedule_notes").select("*").then(({ data }) => {
      if (ignore || !data) return;
      const map = {};
      data.forEach((r) => { map[r.meeting_key] = r.note; });
      setNotes(map);
    });
    return () => { ignore = true; };
  }, []);

  function startEdit(item) {
    setEditingKey(item.key);
    setDraft(notes[item.key] ?? item.defaultSchedule ?? "");
  }

  async function saveEdit(item) {
    const trimmed = draft.trim();
    setBusy(true);
    const { error } = await supabase.from("prayer_schedule_notes").upsert({ meeting_key: item.key, note: trimmed, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { showToast && showToast("Could not save the schedule: " + error.message, "error"); return; }
    setNotes((n) => ({ ...n, [item.key]: trimmed }));
    setEditingKey(null);
    showToast && showToast("Schedule updated.");
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead color={B.purple}>YCDI prayer and devotional calendar</SHead>
      {PRAYER_CALENDAR.map((p, i) => {
        const schedule = notes[p.key] || p.defaultSchedule;
        const isEditing = editingKey === p.key;
        return (
          <div key={p.key} style={{ padding: "12px 0", borderBottom: i < PRAYER_CALENDAR.length - 1 ? "1px solid " + B.offWhite : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{p.meeting}</div>
                {isEditing ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. First Thursday of every month" style={{ ...inp, maxWidth: 260 }} />
                    <button onClick={() => saveEdit(p)} disabled={busy} style={{ ...btnP, padding: "6px 12px", fontSize: 11, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
                    <button onClick={() => setEditingKey(null)} style={{ ...btnG, padding: "6px 12px", fontSize: 11 }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: B.purple, fontWeight: 600 }}>{schedule}</div>
                    {isNC ? <span onClick={() => startEdit(p)} style={{ fontSize: 11, color: B.blue, cursor: "pointer", textDecoration: "underline" }}>edit</span> : null}
                  </div>
                )}
                <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>Led by: {p.led}</div>
                <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{p.focus}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <span style={{ background: B.purpleLight, color: B.purple, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{p.frequency}</span>
                <span style={{ background: B.offWhite, color: B.muted, padding: "3px 10px", borderRadius: 20, fontSize: 11 }}>{p.duration}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 16, background: B.purpleLight, borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: B.purple, marginBottom: 8, fontFamily: "'Montserrat',sans-serif" }}>Personal devotional disciplines for all YCDI leaders:</div>
        {["Daily Bible reading using a structured reading plan", "Daily prayer - minimum 15 minutes", "Weekly church attendance as an active, serving member", "Monthly fasting - at least one day", "Annual personal spiritual retreat", "Journaling to capture what God is speaking"].map((d, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: B.purple, fontWeight: 700, flexShrink: 0 }}>+</span>{d}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CounsellingView() {
  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead color={B.purple}>Christian counselling and pastoral care guidelines</SHead>
      <div style={{ background: B.purpleLight, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: B.purple, marginBottom: 8, fontFamily: "'Montserrat',sans-serif" }}>Five principles of YCDI pastoral counselling</div>
        {["1. Listen First - before you speak, sit and hear the person fully", "2. Pray Always - open and close every pastoral conversation with prayer", "3. Point to Scripture - anchor every counsel in the Word of God", "4. Refer with Care - know your limits and refer without shame", "5. Follow Up Faithfully - pastoral care does not end at the conversation"].map((p, i) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 5, color: B.purple }}>{p}</div>
        ))}
      </div>
      <SHead>Referral responsibility matrix</SHead>
      {COUNSELLING_REFERRAL.map((r, i) => {
        const urgent = r.level === "CRISIS" || r.level === "MANDATORY REPORT";
        return (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < COUNSELLING_REFERRAL.length - 1 ? "1px solid " + B.offWhite : "none" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ background: urgent ? B.redLight : B.purpleLight, color: urgent ? B.red : B.purple, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0, fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap" }}>{r.level}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{r.concern}</div>
                <div style={{ fontSize: 12, color: B.muted, lineHeight: 1.6 }}>{r.response}</div>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

export default function SpiritualSection({ profile, showToast }) {
  const [tab, setTab] = useState("discipleship");
  const TABS = [
    { id: "discipleship", label: "Discipleship Pathway" },
    { id: "teaching", label: "Teaching Outline" },
    { id: "character", label: "Character Standards" },
    { id: "prayer", label: "Prayer Calendar" },
    { id: "counselling", label: "Counselling Guide" },
  ];

  return (
    <div>
      <Card style={{ background: B.purpleLight, borderColor: B.purple + "30", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.purple, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Spiritual Ministry Framework</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          YCDI is not a development programme that happens to be Christian - it is a Christian ministry that expresses itself through youth development. This framework governs our spiritual culture, discipleship practice, biblical ethics, prayer life, and pastoral care.
        </p>
      </Card>
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 14px", borderRadius: 20, border: "1.5px solid " + (tab === t.id ? B.purple : B.border), background: tab === t.id ? B.purple : B.white, color: tab === t.id ? B.white : B.muted, fontSize: 12, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "discipleship" ? <DiscipleshipView /> : null}
      {tab === "teaching" ? <TeachingView /> : null}
      {tab === "character" ? <CharacterView /> : null}
      {tab === "prayer" ? <PrayerView profile={profile} showToast={showToast} /> : null}
      {tab === "counselling" ? <CounsellingView /> : null}
    </div>
  );
}
