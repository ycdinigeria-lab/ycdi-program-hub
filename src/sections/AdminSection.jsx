import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, btnG } from "../theme.js";
import { Card } from "../components/ui.jsx";
import CrashLog from "./CrashLog.jsx";

const ROLE_LABEL = { NC: "National Coordinator", RC: "Regional Coordinator", TM: "Team Member" };

export default function AdminSection({ profile, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("admins");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_profiles");
    if (error) {
      setErr("Could not load the member list: " + error.message);
      setLoading(false);
      return;
    }
    setErr("");
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const adminCount = useMemo(() => rows.filter((r) => r.is_admin).length, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [r.full_name, r.email, r.chapter_name, ROLE_LABEL[r.role]].filter(Boolean).some((v) => v.toLowerCase().includes(needle)));
  }, [rows, q]);

  async function toggle(row) {
    const makeAdmin = !row.is_admin;
    if (!makeAdmin && row.id === profile.id && adminCount <= 1) {
      showToast("You're the only admin. Make someone else admin first before removing your own access.", "error");
      return;
    }
    if (!makeAdmin && !window.confirm(`Remove admin access from ${row.full_name}?`)) return;
    setBusyId(row.id);
    const { error } = await supabase.rpc("set_admin", { target_id: row.id, make_admin: makeAdmin });
    setBusyId(null);
    if (error) { showToast(error.message, "error"); return; }
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_admin: makeAdmin } : r)));
    showToast(makeAdmin ? `${row.full_name} is now an admin.` : `${row.full_name} is no longer an admin.`);
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading members…</div>;

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{ padding: "7px 15px", borderRadius: 20, border: "1.5px solid " + (tab === id ? B.blue : B.border), background: tab === id ? B.blue : B.white, color: tab === id ? B.white : B.muted, fontSize: 12.5, fontWeight: tab === id ? 700 : 400, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
        {tabBtn("admins", "Admins")}
        {tabBtn("crashes", "Crash log")}
      </div>

      {tab === "crashes" ? <CrashLog showToast={showToast} /> : (
      <>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Manage Admins</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Admins can approve sign-ups, manage documents and categories, post national announcements, approve programs, and edit anyone's directory card. A National Coordinator who isn't an admin still sees everything, they just can't change it. There must always be at least one admin.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>{err}</Card> : null}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email or chapter…"
        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${B.border}`, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
      />

      {visible.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>Nobody matches that.</Card>
      ) : (
        visible.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: B.white, border: `1px solid ${B.border}`, borderRadius: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: B.black }}>{r.full_name}</span>
                {r.is_admin ? (
                  <span style={{ background: B.redLight, color: B.red, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>Admin</span>
                ) : null}
              </div>
              <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2, overflowWrap: "anywhere" }}>
                {ROLE_LABEL[r.role] || r.role}{r.chapter_name ? " · " + r.chapter_name : ""}{r.email ? " · " + r.email : ""}
              </div>
            </div>
            <button
              onClick={() => toggle(r)}
              disabled={busyId === r.id}
              style={r.is_admin
                ? { ...btnG, opacity: busyId === r.id ? 0.6 : 1 }
                : { background: B.blue, color: B.white, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", opacity: busyId === r.id ? 0.6 : 1 }}
            >
              {busyId === r.id ? "…" : r.is_admin ? "Remove admin" : "Make admin"}
            </button>
          </div>
        ))
      )}
      </>
      )}
    </div>
  );
}
