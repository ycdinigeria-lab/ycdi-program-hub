// src/auth/GuardianWelcome.jsx
//
// Batch 27. What a guardian sees after accepting their read-only
// invite (Batch 26) and setting a password. Rendered by App.jsx in
// place of SignupPending when the signed-in user has no staff profile
// but does have an active guardian_accounts row.
//
// Read-only, deliberately. No form, no textarea, nothing that writes
// anywhere. The only writes a guardian account can make at the
// database level are none, guardian_accounts and the read policies
// added in Batch 26 grant select only. This screen doesn't even
// attempt a write path, so there's nothing here to accidentally wire
// up into a channel to the minor.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";
import AuthShell from "./AuthShell.jsx";
import { Card, SHead, YCDILogo } from "../components/ui.jsx";

const STAGE_COLOUR = {
  Contact: B.muted,
  Connect: B.blue,
  Commit: B.purple,
  Grow: B.green,
  Multiply: B.gold,
};

function niceDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const KIND_LABEL = { content: "Content shared", conversation: "Conversation", visit: "Visit" };

export default function GuardianWelcome({ onSignOut }) {
  const [summary, setSummary] = useState(null);
  const [touchpoints, setTouchpoints] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: s }, { data: tp }, { data: st }] = await Promise.all([
      supabase.rpc("guardian_child_summary"),
      supabase.from("participant_touchpoints")
        .select("id, kind, unit_ref, note, occurred_on")
        .order("occurred_on", { ascending: false }).limit(30),
      supabase.from("participant_stages")
        .select("id, stage, moved_on, note")
        .order("moved_on", { ascending: false }).limit(10),
    ]);
    setSummary(s && s[0] ? s[0] : null);
    setTouchpoints(tp || []);
    setStages(st || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AuthShell title="Loading…">
        <div style={{ textAlign: "center", color: B.muted, fontSize: 13 }}>One moment.</div>
      </AuthShell>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: B.offWhite }}>
      <div style={{ background: B.brandDeepest, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <YCDILogo height={28} dark markOnly />
          <span style={{ color: B.white, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14 }}>
            {summary?.full_name ? summary.full_name + "'s YCDI activity" : "Welcome"}
          </span>
        </div>
        <button
          onClick={onSignOut}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
        >
          Sign out
        </button>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.6, marginBottom: 14 }}>
          A read-only view of what's been shared with or discussed with {summary?.full_name || "your child"}
          {summary?.chapter_name ? " at the " + summary.chapter_name + " chapter" : ""}. This does not send
          messages, and {summary?.full_name || "your child"} does not have a login of their own.
        </p>

        <Card style={{ marginBottom: 14 }}>
          <SHead>Recent contact</SHead>
          {touchpoints.length === 0 ? (
            <div style={{ fontSize: 12.5, color: B.muted }}>Nothing logged yet.</div>
          ) : (
            touchpoints.map((t) => (
              <div key={t.id} style={{ border: "1px solid " + B.border, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>
                  {KIND_LABEL[t.kind] || t.kind}{t.unit_ref ? " · " + t.unit_ref : ""}
                </div>
                {t.note ? <div style={{ fontSize: 12.5, color: "#333", marginTop: 3, lineHeight: 1.5 }}>{t.note}</div> : null}
                <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>{niceDate(t.occurred_on)}</div>
              </div>
            ))
          )}
        </Card>

        <Card>
          <SHead>Journey</SHead>
          {stages.length === 0 ? (
            <div style={{ fontSize: 12.5, color: B.muted }}>Nothing recorded yet.</div>
          ) : (
            stages.map((h) => (
              <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: STAGE_COLOUR[h.stage] || B.muted, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: B.black }}>{h.stage}</div>
                  <div style={{ fontSize: 11.5, color: B.muted }}>{niceDate(h.moved_on)}</div>
                  {h.note ? <div style={{ fontSize: 12, color: "#333", marginTop: 2 }}>{h.note}</div> : null}
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
