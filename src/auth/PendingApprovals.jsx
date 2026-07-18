import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";
import { Card, SHead } from "../components/ui.jsx";

export default function PendingApprovals() {
  const [rows, setRows] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleChoice, setRoleChoice] = useState({});
  const [chapterChoice, setChapterChoice] = useState({});
  const [busyId, setBusyId] = useState(null);

  async function load() {
    const [{ data: p }, { data: chData }] = await Promise.all([
      supabase.from("pending_signups").select("*").order("created_at", { ascending: true }),
      supabase.from("chapters").select("*").order("name"),
    ]);
    setRows(p || []);
    setChapters(chData || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function approve(row) {
    const role = roleChoice[row.id] || "RC";
    const chapterId = chapterChoice[row.id] || (chapters[0] && chapters[0].id);
    if ((role === "RC" || role === "TM") && !chapterId) return;
    setBusyId(row.id);
    const { error: insErr } = await supabase.from("profiles").insert({
      id: row.id,
      full_name: row.full_name,
      role,
      chapter_id: role === "NC" ? null : chapterId,
    });
    if (insErr) { alert("Could not approve: " + insErr.message); setBusyId(null); return; }
    await supabase.from("pending_signups").delete().eq("id", row.id);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setBusyId(null);
  }

  async function reject(row) {
    if (!window.confirm(`Reject the sign-up request from ${row.full_name}? This only removes the request, if they already have a sign-in account, remove that separately in Supabase if needed.`)) return;
    setBusyId(row.id);
    await supabase.from("pending_signups").delete().eq("id", row.id);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setBusyId(null);
  }

  if (loading || rows.length === 0) return null;

  return (
    <Card style={{ background: B.blueLight, borderColor: `${B.blue}80`, marginBottom: 14 }}>
      <SHead color={B.blue}>New sign-up requests ({rows.length})</SHead>
      {rows.map((row, i) => (
        <div key={row.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${B.blue}30` : "none", padding: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div style={{ minWidth: 0, flex: "1 1 160px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{row.full_name}</div>
              <div style={{ fontSize: 12, color: B.muted, overflowWrap: "anywhere" }}>{row.email}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={roleChoice[row.id] || "RC"}
                onChange={(e) => setRoleChoice((c) => ({ ...c, [row.id]: e.target.value }))}
                style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.border}`, fontSize: 12, maxWidth: "100%", minWidth: 0 }}
              >
                <option value="RC">Regional Coordinator</option>
                <option value="TM">Team Member</option>
                <option value="NC">National Coordinator</option>
              </select>
              {(roleChoice[row.id] || "RC") === "RC" || (roleChoice[row.id] || "RC") === "TM" ? (
                <select
                  value={chapterChoice[row.id] || ""}
                  onChange={(e) => setChapterChoice((c) => ({ ...c, [row.id]: e.target.value }))}
                  style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.border}`, fontSize: 12, maxWidth: "100%", minWidth: 0 }}
                >
                  <option value="">Select chapter…</option>
                  {chapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              ) : null}
              <button
                onClick={() => approve(row)}
                disabled={busyId === row.id}
                style={{ background: B.blue, color: B.white, border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
              >
                {busyId === row.id ? "…" : "Approve"}
              </button>
              <button
                onClick={() => reject(row)}
                disabled={busyId === row.id}
                style={{ background: "none", border: `1px solid ${B.red}`, color: B.red, borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}
