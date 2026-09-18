// src/auth/ParticipantWelcome.jsx
//
// Batch 27. What an 18+ participant sees after accepting their
// direct-contact invite (Batch 25) and setting a password. Rendered
// by App.jsx in place of SignupPending when the signed-in user has no
// staff profile but does have an active participant_accounts row.
//
// Deliberately the only thing this screen can reach: their own
// summary (participant_self_summary), their mentor's name
// (participant_mentor_name), and their own DM thread
// (participant_dm_messages, scoped by RLS to their own participant_id
// already). Nothing here queries anything wider than that, on purpose,
// matching what Batch 25's own comments promised this account type.

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { B, ta, btnP } from "../theme.js";
import AuthShell, { AuthNotice } from "./AuthShell.jsx";
import { Card, SHead, YCDILogo } from "../components/ui.jsx";

function niceTime(d) {
  if (!d) return "";
  const dt = new Date(d);
  const today = new Date();
  const sameDay = dt.toDateString() === today.toDateString();
  return sameDay
    ? dt.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })
    : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function ParticipantWelcome({ onSignOut }) {
  const [summary, setSummary] = useState(null);
  const [mentorName, setMentorName] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    const [{ data: s }, { data: m }, { data: msgs }] = await Promise.all([
      supabase.rpc("participant_self_summary"),
      supabase.rpc("participant_mentor_name"),
      supabase.from("participant_dm_messages")
        .select("id, sender, body, created_at")
        .order("created_at", { ascending: true }),
    ]);
    setSummary(s && s[0] ? s[0] : null);
    setMentorName(m || "");
    setMessages(msgs || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keeps a light connection to the thread without needing a realtime
  // subscription for what is, at most, a few messages a day.
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // participant_dm_messages.participant_id is required by its own
  // check constraint and RLS with-check (pdm_participant_rw), but the
  // value has to come from the participant's own auth-derived id, not
  // trusted client state. my_participant_id() is what the RLS policy
  // itself uses, so this fetches it once per send rather than caching
  // client-side and risking staleness after an account is deactivated.
  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setErr("");

    const { data: myId, error: idErr } = await supabase.rpc("my_participant_id");
    if (idErr || !myId) {
      setSending(false);
      setErr("Could not verify your account. Try signing out and back in.");
      return;
    }

    const { data: mentorRow, error: mentorErr } = await supabase
      .from("participant_mentors")
      .select("mentor_id")
      .eq("participant_id", myId)
      .is("ended_on", null)
      .limit(1)
      .maybeSingle();

    if (mentorErr || !mentorRow) {
      setSending(false);
      setErr("No mentor currently assigned, so there is no one to send this to yet.");
      return;
    }

    const { error } = await supabase.from("participant_dm_messages").insert({
      participant_id: myId,
      mentor_id: mentorRow.mentor_id,
      sender: "participant",
      body,
    });
    setSending(false);
    if (error) { setErr(error.message); return; }
    setDraft("");
    load();
  }

  if (loading) {
    return (
      <AuthShell title="Loading…">
        <div style={{ textAlign: "center", color: B.muted, fontSize: 13 }}>One moment.</div>
      </AuthShell>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: B.offWhite, display: "flex", flexDirection: "column" }}>
      <div style={{ background: B.brandDeepest, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <YCDILogo height={28} dark markOnly />
          <span style={{ color: B.white, fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14 }}>
            {summary?.full_name || "Welcome"}
          </span>
        </div>
        <button
          onClick={onSignOut}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
        >
          Sign out
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 560, width: "100%", margin: "0 auto", padding: 16, boxSizing: "border-box" }}>
        <Card style={{ marginBottom: 14 }}>
          <SHead>Your mentor</SHead>
          <div style={{ fontSize: 12.5, color: "#333" }}>
            {mentorName || "No mentor currently assigned. Reach out through your chapter in the meantime."}
          </div>
        </Card>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: "center", color: B.muted, fontSize: 12.5, marginTop: 30 }}>
              No messages yet. Say hello below.
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: m.sender === "participant" ? "flex-end" : "flex-start",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    background: m.sender === "participant" ? B.brandDeep : B.white,
                    color: m.sender === "participant" ? B.white : B.black,
                    border: m.sender === "participant" ? "none" : "1px solid " + B.border,
                    borderRadius: 14,
                    padding: "9px 13px",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  {m.body}
                  <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 4, textAlign: "right" }}>
                    {niceTime(m.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {err ? <AuthNotice tone="error">{err}</AuthNotice> : null}

        <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
          <textarea
            style={{ ...ta, flex: 1, minHeight: 44, maxHeight: 120 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }}
          />
          <button type="submit" style={{ ...btnP, alignSelf: "flex-end" }} disabled={sending || !draft.trim()}>
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
