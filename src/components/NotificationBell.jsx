import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";
import { reportError } from "../lib/errors.js";

// How often the bell asks the database whether anything new arrived.
// Sixty seconds is a deliberate compromise: often enough that nobody
// sits looking at a stale count, rare enough that a chapter phone on
// a slow connection isn't spending its data on empty replies.
const POLL_MS = 60000;

export function ago(ts) {
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? " hour ago" : " hours ago");
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const DOT = {
  signup_request: B.yellow,
  signup_approved: B.blue,
  program_submitted: B.yellow,
  program_approved: B.blue,
  program_returned: B.red,
  message: B.purple,
};

export default function NotificationBell({ onOpen, isMobile }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null);
  const [savingMode, setSavingMode] = useState(false);
  const wrapRef = useRef(null);

  const loadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc("unread_notification_count");
    // A failed count is not worth a red banner over. The bell just keeps
    // showing whatever it last knew and tries again on the next round.
    if (!error && typeof data === "number") setCount(data);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("my_notifications", { max_rows: 30 });
    if (error) reportError(error, "notifications:list");
    else setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, POLL_MS);
    // Coming back to the tab is the moment somebody most wants an
    // accurate count, so don't make them wait out the rest of the poll.
    const onVisible = () => { if (!document.hidden) loadCount(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadCount]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function loadMode() {
    const { data, error } = await supabase.rpc("my_notification_pref");
    if (!error && data) setMode(data);
  }

  async function pickMode(next) {
    const before = mode;
    setMode(next);
    setSavingMode(true);
    const { error } = await supabase.rpc("set_notification_pref", { mode: next });
    setSavingMode(false);
    if (error) { setMode(before); reportError(error, "notifications:setPref"); }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) { loadItems(); if (mode === null) loadMode(); }
  }

  async function markAll() {
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) { reportError(error, "notifications:markAll"); return; }
    setCount(0);
    setItems((xs) => xs.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })));
  }

  async function pick(n) {
    setOpen(false);
    if (!n.read_at) {
      setCount((c) => Math.max(0, c - 1));
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      const { error } = await supabase.rpc("mark_notification_read", { notification_id: n.id });
      if (error) reportError(error, "notifications:markOne");
    }
    if (n.link_section && onOpen) onOpen(n.link_section, n.link_view || null);
  }

  const panelStyle = isMobile
    ? { position: "fixed", top: 52, left: 8, right: 8, maxHeight: "70vh" }
    : { position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 460 };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={toggle}
        aria-label={count > 0 ? count + " unread notifications" : "Notifications"}
        style={{
          background: open ? "rgba(255,255,255,0.2)" : "none",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 6,
          padding: "5px 9px",
          cursor: "pointer",
          position: "relative",
          lineHeight: 0,
          flexShrink: 0,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? (
          <span style={{
            position: "absolute", top: -6, right: -6,
            background: B.red, color: B.white,
            borderRadius: 10, minWidth: 18, height: 18,
            padding: "0 5px",
            fontSize: 10, fontWeight: 700, lineHeight: "18px",
            fontFamily: "'Montserrat',sans-serif",
            border: "2px solid " + B.blue,
            boxSizing: "content-box",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div style={{
          ...panelStyle,
          background: B.white,
          border: "1px solid " + B.border,
          borderRadius: 10,
          boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          zIndex: 300,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 14px", borderBottom: "1px solid " + B.offWhite, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>
              Notifications
            </div>
            {count > 0 ? (
              <button onClick={markAll} style={{ background: "none", border: "none", color: B.blueDark, fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "'Open Sans',sans-serif" }}>
                Mark all read
              </button>
            ) : null}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <div style={{ padding: 22, textAlign: "center", fontSize: 12.5, color: B.muted }}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: "26px 20px", textAlign: "center", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
                Nothing yet.<br />
                You'll be told here when a programme moves, somebody asks to join, or a message arrives.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => pick(n)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: n.read_at ? B.white : B.blueLight,
                    border: "none", borderBottom: "1px solid " + B.offWhite,
                    padding: "11px 14px", cursor: "pointer",
                    fontFamily: "'Open Sans',sans-serif",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT[n.kind] || B.muted, marginTop: 5, flexShrink: 0, opacity: n.read_at ? 0.35 : 1 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: n.read_at ? 400 : 700, color: B.black, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.35 }}>
                        {n.title}
                      </div>
                      {n.body ? (
                        <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.45 }}>{n.body}</div>
                      ) : null}
                      <div style={{ fontSize: 10.5, color: "#8a8a8a", marginTop: 4 }}>{ago(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid " + B.offWhite, padding: "9px 12px 11px", flexShrink: 0, background: "#FAFAFA" }}>
            <div style={{ fontSize: 10.5, color: B.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Montserrat',sans-serif", fontWeight: 700 }}>
              Email me
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "instant", label: "Each time" },
                { id: "daily", label: "Daily summary" },
                { id: "off", label: "Never" },
              ].map((o) => {
                const on = mode === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => pickMode(o.id)}
                    disabled={savingMode || mode === null}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: on ? B.blue : B.white,
                      color: on ? B.white : B.muted,
                      border: "1px solid " + (on ? B.blue : B.border),
                      borderRadius: 6,
                      padding: "6px 4px",
                      fontSize: 11,
                      fontWeight: on ? 700 : 400,
                      cursor: mode === null ? "default" : "pointer",
                      fontFamily: "'Open Sans',sans-serif",
                      opacity: mode === null ? 0.5 : 1,
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
