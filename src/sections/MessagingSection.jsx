import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, btnP, btnG } from "../theme.js";
import { Card } from "../components/ui.jsx";
import { useIsMobile } from "../useIsMobile.js";
import { useVisiblePoll } from "../lib/poll.js";

// Opening a busy channel used to pull two hundred messages, and then pull
// the same two hundred again every twenty seconds for as long as it stayed
// open. It now starts with the most recent stretch and fetches further back
// only when somebody asks for it.
//
// BATCH4-MARKER messaging-perf
const FIRST_PAGE = 60;
const OLDER_STEP = 100;
const MAX_MESSAGES = 1000;

const ICON = {
  hash: "M9 3l-.7 4H4.4l-.3 2h4l-.7 4H3.4l-.3 2h4l-.7 4h2l.7-4h4l-.7 4h2l.7-4h3.9l.3-2h-3.9l.7-4h3.9l.3-2h-3.9l.7-4h-2l-.7 4h-4L11 3zm.9 6h4l-.7 4h-4z",
  people: "M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-8 1.3-8 4v3h9.5v-2.5c0-1.3.6-2.5 1.6-3.4A14 14 0 008 13zm8 0c-.6 0-1.3.1-2 .2 1.4 1 2.5 2.3 2.5 3.8V19H24v-3c0-2.7-5.3-3-8-3z",
  send: "M2 21l21-9L2 3v7l15 2-15 2z",
  back: "M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
  trash: "M6 7h12l-1 14H7zM9 4h6l1 2H8zM4 6h16v2H4z",
};
const Icon = ({ d, size = 14, color = B.muted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d={d} /></svg>
);

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function timeOf(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function listTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return timeOf(iso);
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ---- new conversation picker ---------------------------------------------

function NewConversation({ onPick, onClose, showToast }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    supabase.rpc("messageable_people").then(({ data, error }) => {
      if (error) showToast("Could not load the member list: " + error.message, "error");
      setPeople(data || []);
      setLoading(false);
    });
  }, [showToast]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) => [p.full_name, p.chapter_name].filter(Boolean).some((v) => v.toLowerCase().includes(needle)));
  }, [people, q]);

  async function open(p) {
    setBusyId(p.id);
    const { data, error } = await supabase.rpc("start_dm", { other_id: p.id });
    setBusyId(null);
    if (error) { showToast(error.message, "error"); return; }
    onPick(data);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "34px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: 420, marginBottom: 30 }}>
        <div style={{ padding: "17px 22px", borderBottom: `1px solid ${B.offWhite}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 17, fontWeight: 700 }}>New conversation</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, color: B.muted, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: "16px 22px 20px" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or chapter…" style={{ ...inp, marginBottom: 12 }} />
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: B.muted, fontSize: 13 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: B.muted, fontSize: 13 }}>Nobody matches that.</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {visible.map((p) => (
                <button
                  key={p.id}
                  onClick={() => open(p)}
                  disabled={busyId === p.id}
                  style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${B.offWhite}`, padding: "10px 2px", cursor: "pointer", fontFamily: "'Open Sans',sans-serif" }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: B.blue, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", flexShrink: 0 }}>
                    {initials(p.full_name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: B.black }}>{p.full_name}</div>
                    <div style={{ fontSize: 11.5, color: B.muted }}>{p.chapter_name || "National"}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- conversation ---------------------------------------------------------

function Conversation({ channel, profile, onBack, onChanged, showToast, isMobile }) {
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [limit, setLimit] = useState(FIRST_PAGE);
  const [maybeMore, setMaybeMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef(null);
  const boxRef = useRef(null);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase.rpc("channel_messages", { cid: channel.id, limit_n: limit });
    if (error) {
      showToast("Could not load messages: " + error.message, "error");
      setLoading(false);
      return;
    }
    // The database hands these back newest first so the limit takes the
    // most recent ones. Flip them for reading top to bottom.
    const rows = data || [];
    // A full page back suggests there is more behind it. Worst case the
    // button appears once and finds nothing, which is harmless.
    setMaybeMore(rows.length >= limit && limit < MAX_MESSAGES);
    setMsgs(rows.slice().reverse());
    setLoading(false);
    await supabase.rpc("mark_channel_read", { cid: channel.id });
    onChanged();
  }, [channel.id, limit, showToast, onChanged]);

  useEffect(() => { load(); }, [load]);

  // A new conversation starts at the most recent page again.
  useEffect(() => { setLimit(FIRST_PAGE); }, [channel.id]);

  async function loadOlder() {
    setLoadingOlder(true);
    setLimit((n) => Math.min(MAX_MESSAGES, n + OLDER_STEP));
    setLoadingOlder(false);
  }

  // Live updates where available, with a slow check as a backstop in case
  // realtime isn't switched on for this project.
  useEffect(() => {
    const sub = supabase
      .channel("msgs-" + channel.id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "channel_id=eq." + channel.id },
        () => load(true))
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel.id, load]);

  useVisiblePoll(() => load(true), 20000);

  // Scroll on the newest message changing, not on the count changing.
  // Fetching older ones also changes the count, and jumping to the bottom
  // the moment somebody asks to read further back is exactly wrong.
  const newestId = msgs.length ? msgs[msgs.length - 1].id : null;
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: "end" });
  }, [newestId]);

  async function send(e) {
    if (e) e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      channel_id: channel.id, sender_id: profile.id, body,
    });
    setSending(false);
    if (error) { showToast("Message not sent: " + error.message, "error"); return; }
    setDraft("");
    load(true);
  }

  async function remove(m) {
    if (!window.confirm("Remove this message for everyone?")) return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) { showToast("Could not remove that: " + error.message, "error"); return; }
    setMsgs((xs) => xs.filter((x) => x.id !== m.id));
    onChanged();
  }

  const canDelete = (m) => m.sender_id === profile.id || (profile.is_admin && channel.kind !== "dm");

  let lastDay = null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: isMobile ? "calc(100vh - 210px)" : 560, border: `1px solid ${B.border}`, borderRadius: 12, background: B.white, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${B.offWhite}`, flexShrink: 0 }}>
        {isMobile ? (
          <button onClick={onBack} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex" }}>
            <Icon d={ICON.back} size={20} color={B.blue} />
          </button>
        ) : null}
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: channel.kind === "dm" ? B.blue : B.purple, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {channel.kind === "dm"
            ? <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{initials(channel.name)}</span>
            : <Icon d={ICON.hash} size={15} color={B.white} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channel.name}</div>
          <div style={{ fontSize: 11, color: B.muted }}>
            {channel.kind === "general" ? "Everyone" : channel.kind === "chapter" ? "Chapter channel" : "Private"}
          </div>
        </div>
      </div>

      <div ref={boxRef} style={{ flex: 1, overflowY: "auto", padding: "14px", background: B.offWhite }}>
        {loading ? (
          <div style={{ textAlign: "center", color: B.muted, fontSize: 13, padding: 30 }}>Loading messages…</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: "center", color: B.muted, fontSize: 13, padding: 30, lineHeight: 1.6 }}>
            Nothing here yet.<br />Say the first thing.
          </div>
        ) : (
          <>
          {maybeMore ? (
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <button
                onClick={loadOlder}
                disabled={loadingOlder}
                style={{ background: B.white, border: `1px solid ${B.border}`, color: B.muted, borderRadius: 20, padding: "6px 16px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
              >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          ) : null}
          {msgs.map((m) => {
            const mine = m.sender_id === profile.id;
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay ? (
                  <div style={{ textAlign: "center", margin: "12px 0 14px" }}>
                    <span style={{ background: B.white, border: `1px solid ${B.border}`, color: B.muted, fontSize: 10.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", padding: "3px 12px", borderRadius: 20 }}>{day}</span>
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "82%", minWidth: 0 }}>
                    {!mine && channel.kind !== "dm" ? (
                      <div style={{ fontSize: 11, fontWeight: 700, color: B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 3, paddingLeft: 2 }}>{m.sender_name || "Member"}</div>
                    ) : null}
                    <div style={{ background: mine ? B.blue : B.white, color: mine ? B.white : B.black, border: mine ? "none" : `1px solid ${B.border}`, borderRadius: 12, padding: "9px 12px", fontSize: 13.5, lineHeight: 1.55, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                      {m.body}
                    </div>
                    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "center", gap: 7, marginTop: 3, paddingInline: 2 }}>
                      <span style={{ fontSize: 10.5, color: B.muted }}>{timeOf(m.created_at)}</span>
                      {canDelete(m) ? (
                        <button onClick={() => remove(m)} title="Remove" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                          <Icon d={ICON.trash} size={11} color={B.muted} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${B.offWhite}`, flexShrink: 0, alignItems: "flex-end" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends. Shift and Enter together starts a new line.
            if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); send(); }
          }}
          placeholder="Write a message…"
          rows={1}
          style={{ flex: 1, minWidth: 0, resize: "none", padding: "10px 12px", borderRadius: 10, border: `1px solid ${B.border}`, fontSize: 13.5, fontFamily: "'Open Sans',sans-serif", maxHeight: 120, lineHeight: 1.5 }}
        />
        <button type="submit" disabled={!draft.trim() || sending} style={{ background: B.blue, border: "none", borderRadius: 10, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: !draft.trim() || sending ? 0.45 : 1 }}>
          <Icon d={ICON.send} size={17} color={B.white} />
        </button>
      </form>
    </div>
  );
}

// ---- section --------------------------------------------------------------

export default function MessagingSection({ profile, showToast }) {
  const isMobile = useIsMobile();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_channels");
    if (error) {
      setErr("Could not load your conversations. If this keeps happening, the Stage 4 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setErr("");
    setChannels(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useVisiblePoll(load, 25000);

  const active = channels.find((c) => c.id === activeId) || null;

  function openDm(id) {
    setStarting(false);
    setActiveId(id);
    load();
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading conversations…</div>;

  if (err) return <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, fontSize: 13, lineHeight: 1.6 }}>{err}</Card>;

  const list = (
    <div>
      <button onClick={() => setStarting(true)} style={{ ...btnP, width: "100%", marginBottom: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <Icon d={ICON.plus} size={14} color={B.white} /> New conversation
      </button>
      <div style={{ border: `1px solid ${B.border}`, borderRadius: 12, background: B.white, overflow: "hidden" }}>
        {channels.map((c, i) => {
          const on = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", background: on ? B.blueLight : "none", border: "none", borderBottom: i < channels.length - 1 ? `1px solid ${B.offWhite}` : "none", padding: "11px 13px", cursor: "pointer", fontFamily: "'Open Sans',sans-serif" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: c.kind === "dm" ? B.blue : B.purple, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {c.kind === "dm"
                  ? <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>{initials(c.name)}</span>
                  : <Icon d={c.kind === "general" ? ICON.people : ICON.hash} size={16} color={B.white} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: c.unread > 0 ? 700 : 600, fontSize: 13.5, color: B.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ fontSize: 10.5, color: B.muted, flexShrink: 0 }}>{listTime(c.last_at)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: c.unread > 0 ? B.black : B.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.last_body || "No messages yet"}
                  </span>
                  {c.unread > 0 ? (
                    <span style={{ background: B.red, color: B.white, borderRadius: 20, minWidth: 19, height: 19, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, padding: "0 6px", flexShrink: 0, fontFamily: "'Montserrat',sans-serif" }}>
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      {isMobile ? (
        active
          ? <Conversation channel={active} profile={profile} onBack={() => setActiveId(null)} onChanged={load} showToast={showToast} isMobile />
          : list
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 300px) minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
          {list}
          {active
            ? <Conversation channel={active} profile={profile} onBack={() => setActiveId(null)} onChanged={load} showToast={showToast} isMobile={false} />
            : (
              <Card style={{ textAlign: "center", padding: "60px 20px", color: B.muted, fontSize: 13, lineHeight: 1.6 }}>
                Pick a conversation on the left,<br />or start a new one.
              </Card>
            )}
        </div>
      )}

      {starting ? <NewConversation onPick={openDm} onClose={() => setStarting(false)} showToast={showToast} /> : null}
    </div>
  );
}
