import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, ta, sel, btnP, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";

// ---- small shared helpers -------------------------------------------------

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
}

// event_date comes back as "YYYY-MM-DD". Build the Date from parts so the day
// never shifts because of the browser's timezone.
function parseEventDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtEventDate(str) {
  const d = parseEventDate(str);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function ScopeBadge({ scope, chapterName }) {
  const general = scope === "general";
  return (
    <span style={{ background: general ? B.blueLight : B.yellowLight, color: general ? B.blueDark : B.gold, padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap" }}>
      {general ? "General" : (chapterName || "Chapter")}
    </span>
  );
}

// Scope choices depend on role. NC can post generally or to any chapter.
// RC can only post to their own chapter. (Team Members can't post at all.)
function scopeChoicesFor(profile, chapters) {
  if (profile.role === "NC") {
    return [
      { v: "general", label: "General (all chapters)" },
      ...chapters.map((c) => ({ v: "chapter:" + c.id, label: c.name + " chapter" })),
    ];
  }
  return [{ v: "chapter:" + profile.chapter_id, label: (profile.chapter_name || "My") + " chapter" }];
}

function FilterChips({ profile, chapters, value, onChange }) {
  const chips = [{ v: "all", label: "All" }, { v: "general", label: "General" }];
  if (profile.role === "NC") {
    chapters.forEach((c) => chips.push({ v: "chapter:" + c.id, label: c.name }));
  } else if (profile.chapter_id) {
    chips.push({ v: "chapter:" + profile.chapter_id, label: profile.chapter_name || "My chapter" });
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
      {chips.map((c) => (
        <button key={c.v} onClick={() => onChange(c.v)} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (value === c.v ? B.blue : B.border), background: value === c.v ? B.blue : B.white, color: value === c.v ? B.white : B.muted, fontSize: 12, fontWeight: value === c.v ? 700 : 400, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

function matchesFilter(row, filter) {
  if (filter === "all") return true;
  if (filter === "general") return row.scope === "general";
  if (filter.startsWith("chapter:")) return row.scope === "chapter" && row.chapter_id === filter.slice(8);
  return true;
}

// ---- announcements --------------------------------------------------------

function AnnouncementComposer({ profile, chapters, editing, onSaved, onCancel, showToast }) {
  const choices = scopeChoicesFor(profile, chapters);
  const [title, setTitle] = useState(editing ? editing.title : "");
  const [body, setBody] = useState(editing ? editing.body || "" : "");
  const [scopeVal, setScopeVal] = useState(
    editing ? (editing.scope === "general" ? "general" : "chapter:" + editing.chapter_id) : choices[0].v
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) { showToast("Add a title first.", "error"); return; }
    const scope = scopeVal === "general" ? "general" : "chapter";
    const chapter_id = scopeVal === "general" ? null : scopeVal.slice(8);
    setBusy(true);
    const payload = { title: title.trim(), body: body.trim(), scope, chapter_id, updated_at: new Date().toISOString() };
    let error;
    if (editing) {
      ({ error } = await supabase.from("announcements").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("announcements").insert({ ...payload, created_by: profile.id, author_name: profile.full_name }));
    }
    setBusy(false);
    if (error) { showToast("Could not save: " + error.message, "error"); return; }
    showToast(editing ? "Announcement updated." : "Announcement posted.");
    onSaved();
  }

  return (
    <Card style={{ marginBottom: 16, borderColor: B.blue + "60" }}>
      <SHead color={B.blue}>{editing ? "Edit announcement" : "New announcement"}</SHead>
      <Field label="Title" required><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short headline" /></Field>
      <Field label="Message"><textarea style={ta} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the details here" /></Field>
      <Field label="Who is this for?">
        {choices.length === 1 ? (
          <div style={{ fontSize: 13, color: B.muted, padding: "9px 0" }}>{choices[0].label}</div>
        ) : (
          <select style={sel} value={scopeVal} onChange={(e) => setScopeVal(e.target.value)}>
            {choices.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        )}
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : editing ? "Save changes" : "Post announcement"}</button>
        <button onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </Card>
  );
}

function AnnouncementsView({ profile, chapters, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");

  const canPost = profile.role !== "TM";
  const chapterName = (id) => (chapters.find((c) => c.id === id) || {}).name;
  const canManage = (r) => profile.role === "NC" || (profile.role === "RC" && r.scope === "chapter" && r.chapter_id === profile.chapter_id);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function remove(row) {
    if (!window.confirm(`Delete the announcement "${row.title}"? This can't be undone.`)) return;
    const { error } = await supabase.from("announcements").delete().eq("id", row.id);
    if (error) { showToast("Could not delete: " + error.message, "error"); return; }
    showToast("Announcement deleted.");
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  const visible = rows.filter((r) => matchesFilter(r, filter));

  return (
    <div>
      {canPost && !composing && !editing ? (
        <button onClick={() => setComposing(true)} style={{ ...btnP, marginBottom: 16 }}>+ New announcement</button>
      ) : null}

      {composing ? (
        <AnnouncementComposer profile={profile} chapters={chapters} onSaved={() => { setComposing(false); load(); }} onCancel={() => setComposing(false)} showToast={showToast} />
      ) : null}
      {editing ? (
        <AnnouncementComposer profile={profile} chapters={chapters} editing={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} showToast={showToast} />
      ) : null}

      <FilterChips profile={profile} chapters={chapters} value={filter} onChange={setFilter} />

      {loading ? (
        <Card><div style={{ color: B.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading announcements…</div></Card>
      ) : visible.length === 0 ? (
        <Card><div style={{ color: B.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No announcements here yet.</div></Card>
      ) : (
        visible.map((r) => (
          <Card key={r.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <ScopeBadge scope={r.scope} chapterName={chapterName(r.chapter_id)} />
                <div style={{ fontSize: 15, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{r.title}</div>
              </div>
              {canManage(r) ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <span onClick={() => { setEditing(r); setComposing(false); }} style={{ fontSize: 11, color: B.blue, cursor: "pointer", textDecoration: "underline" }}>edit</span>
                  <span onClick={() => remove(r)} style={{ fontSize: 11, color: B.red, cursor: "pointer", textDecoration: "underline" }}>delete</span>
                </div>
              ) : null}
            </div>
            {r.body ? <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.7, color: B.black, whiteSpace: "pre-wrap" }}>{r.body}</p> : null}
            <div style={{ fontSize: 11, color: B.muted, marginTop: 10 }}>{r.author_name || "YCDI"} · {fmtDateTime(r.created_at)}</div>
          </Card>
        ))
      )}
    </div>
  );
}

// ---- calendar / events ----------------------------------------------------

function EventComposer({ profile, chapters, editing, onSaved, onCancel, showToast }) {
  const choices = scopeChoicesFor(profile, chapters);
  const [title, setTitle] = useState(editing ? editing.title : "");
  const [date, setDate] = useState(editing ? editing.event_date : "");
  const [time, setTime] = useState(editing ? editing.event_time || "" : "");
  const [location, setLocation] = useState(editing ? editing.location || "" : "");
  const [description, setDescription] = useState(editing ? editing.description || "" : "");
  const [scopeVal, setScopeVal] = useState(
    editing ? (editing.scope === "general" ? "general" : "chapter:" + editing.chapter_id) : choices[0].v
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) { showToast("Add a title first.", "error"); return; }
    if (!date) { showToast("Pick a date first.", "error"); return; }
    const scope = scopeVal === "general" ? "general" : "chapter";
    const chapter_id = scopeVal === "general" ? null : scopeVal.slice(8);
    setBusy(true);
    const payload = { title: title.trim(), description: description.trim(), event_date: date, event_time: time.trim(), location: location.trim(), scope, chapter_id, updated_at: new Date().toISOString() };
    let error;
    if (editing) {
      ({ error } = await supabase.from("events").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("events").insert({ ...payload, created_by: profile.id, author_name: profile.full_name }));
    }
    setBusy(false);
    if (error) { showToast("Could not save: " + error.message, "error"); return; }
    showToast(editing ? "Event updated." : "Event added.");
    onSaved();
  }

  return (
    <Card style={{ marginBottom: 16, borderColor: B.blue + "60" }}>
      <SHead color={B.blue}>{editing ? "Edit event" : "New event"}</SHead>
      <Field label="Title" required><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter prayer meeting" /></Field>
      <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <Field label="Date" required><input type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time (optional)"><input style={inp} value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 4:00 PM" /></Field>
      </div>
      <Field label="Location (optional)"><input style={inp} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue or address" /></Field>
      <Field label="Details (optional)"><textarea style={ta} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything people should know" /></Field>
      <Field label="Who is this for?">
        {choices.length === 1 ? (
          <div style={{ fontSize: 13, color: B.muted, padding: "9px 0" }}>{choices[0].label}</div>
        ) : (
          <select style={sel} value={scopeVal} onChange={(e) => setScopeVal(e.target.value)}>
            {choices.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        )}
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : editing ? "Save changes" : "Add event"}</button>
        <button onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </Card>
  );
}

function CalendarView({ profile, chapters, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showPast, setShowPast] = useState(false);

  const canPost = profile.role !== "TM";
  const chapterName = (id) => (chapters.find((c) => c.id === id) || {}).name;
  const canManage = (r) => profile.role === "NC" || (profile.role === "RC" && r.scope === "chapter" && r.chapter_id === profile.chapter_id);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("events").select("*").order("event_date", { ascending: true });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function remove(row) {
    if (!window.confirm(`Delete the event "${row.title}"? This can't be undone.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", row.id);
    if (error) { showToast("Could not delete: " + error.message, "error"); return; }
    showToast("Event deleted.");
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  }

  const today = todayStr();
  const visible = rows
    .filter((r) => matchesFilter(r, filter))
    .filter((r) => showPast || r.event_date >= today);

  return (
    <div>
      {canPost && !composing && !editing ? (
        <button onClick={() => setComposing(true)} style={{ ...btnP, marginBottom: 16 }}>+ New event</button>
      ) : null}

      {composing ? (
        <EventComposer profile={profile} chapters={chapters} onSaved={() => { setComposing(false); load(); }} onCancel={() => setComposing(false)} showToast={showToast} />
      ) : null}
      {editing ? (
        <EventComposer profile={profile} chapters={chapters} editing={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} showToast={showToast} />
      ) : null}

      <FilterChips profile={profile} chapters={chapters} value={filter} onChange={setFilter} />
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: B.muted, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show past events
        </label>
      </div>

      {loading ? (
        <Card><div style={{ color: B.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading events…</div></Card>
      ) : visible.length === 0 ? (
        <Card><div style={{ color: B.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>{showPast ? "No events here yet." : "No upcoming events. Tick 'show past events' to see older ones."}</div></Card>
      ) : (
        visible.map((r) => {
          const past = r.event_date < today;
          return (
            <Card key={r.id} style={{ marginBottom: 12, opacity: past ? 0.7 : 1 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ background: past ? B.offWhite : B.blueLight, borderRadius: 8, padding: "8px 12px", textAlign: "center", minWidth: 62, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: past ? B.muted : B.blueDark, textTransform: "uppercase", fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>
                    {(parseEventDate(r.event_date) || new Date()).toLocaleDateString("en-GB", { month: "short" })}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: past ? B.muted : B.blue, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.1 }}>
                    {(parseEventDate(r.event_date) || new Date()).getDate()}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <ScopeBadge scope={r.scope} chapterName={chapterName(r.chapter_id)} />
                    <div style={{ fontSize: 15, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{r.title}</div>
                  </div>
                  <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>
                    {fmtEventDate(r.event_date)}{r.event_time ? " · " + r.event_time : ""}{r.location ? " · " + r.location : ""}
                  </div>
                  {r.description ? <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{r.description}</p> : null}
                </div>
                {canManage(r) ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <span onClick={() => { setEditing(r); setComposing(false); }} style={{ fontSize: 11, color: B.blue, cursor: "pointer", textDecoration: "underline" }}>edit</span>
                    <span onClick={() => remove(r)} style={{ fontSize: 11, color: B.red, cursor: "pointer", textDecoration: "underline" }}>delete</span>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ---- section wrapper ------------------------------------------------------

export default function CalendarNoticesSection({ profile, chapters, showToast }) {
  const [tab, setTab] = useState("announcements");
  const TABS = [
    { id: "announcements", label: "Announcements" },
    { id: "calendar", label: "Calendar" },
  ];

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Calendar & Notices</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          General notices and events reach everyone. Chapter ones stay within that chapter. The National Coordinator can post to any chapter and sees them all.
        </p>
      </Card>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 16px", borderRadius: 20, border: "1.5px solid " + (tab === t.id ? B.blue : B.border), background: tab === t.id ? B.blue : B.white, color: tab === t.id ? B.white : B.muted, fontSize: 12, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "announcements" ? <AnnouncementsView profile={profile} chapters={chapters} showToast={showToast} /> : null}
      {tab === "calendar" ? <CalendarView profile={profile} chapters={chapters} showToast={showToast} /> : null}
    </div>
  );
}
