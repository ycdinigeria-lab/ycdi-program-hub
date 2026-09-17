import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";

// BATCH23-MARKER content-approval
//
// The Communications Officer's queue. A post is drafted, sent up, and
// cleared before it goes out under the YCDI name. Two routes, from
// YCDI-COM: a chapter post is the RC's to write and the Communications
// Officer's to clear; a national post is the Communications Officer's to
// write and the National Coordinator's to clear.
//
// Row security decides all of that. This screen only shows a person the
// two things they might do: the posts they are writing, and the posts
// waiting on them to review. Whether the second tab has anything in it is
// itself the answer to "am I an approver here".

const CHANNELS = ["Instagram", "Facebook", "WhatsApp", "X (Twitter)", "LinkedIn", "YouTube", "Website", "Newsletter", "Email", "Press"];

const PILLARS = [
  ["impact", "Impact & testimony"],
  ["biblical", "Biblical & devotional"],
  ["program", "Programme update"],
  ["leadership", "Leadership & development"],
  ["behind_scenes", "Behind the scenes"],
  ["cta", "Call to action"],
];
const PILLAR_LABEL = Object.fromEntries(PILLARS.map(([k, v]) => [k, v]));

const STATUS_TONE = {
  draft: [B.offWhite, B.muted],
  returned: [B.redLight, B.red],
  submitted: ["#FFF7E6", B.gold],
  approved: ["#E8F5EC", B.green],
  published: [B.blueLight, B.blueDark || B.blue],
};
const STATUS_WORD = {
  draft: "Draft", returned: "Sent back", submitted: "Waiting on review",
  approved: "Cleared to publish", published: "Published",
};

const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null);
const today = () => new Date().toISOString().slice(0, 10);

function Tag({ status }) {
  const [bg, fg] = STATUS_TONE[status] || STATUS_TONE.draft;
  return (
    <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
      {STATUS_WORD[status] || status}
    </span>
  );
}

export default function ContentSection({ profile, chapters, showToast }) {
  const [tab, setTab] = useState("mine");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    // One read. Row security returns exactly what this person may see:
    // their own posts, plus any waiting on them as approver.
    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setErr("Could not load the queue. If this keeps happening, the Batch 23 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setComposing(false); setEditing(null); }, [tab]);

  const mine = useMemo(() => rows.filter((r) => r.author_id === profile.id), [rows, profile.id]);
  // Anything I can see that isn't mine is a post waiting on me to review.
  const toReview = useMemo(() => rows.filter((r) => r.author_id !== profile.id && r.status === "submitted"), [rows, profile.id]);

  // Can this person start a post at all? An RC writes chapter posts; the
  // Communications Officer writes national ones. The DB is the real gate;
  // this just decides whether to show the button.
  const canDraftChapter = profile.role === "RC" && !!profile.chapter_id;
  const canDraftNational = (profile.portfolios || []).includes("COMMS") || profile.is_admin;
  const canDraft = canDraftChapter || canDraftNational || profile.is_admin;

  const chapterName = useMemo(() => {
    const map = Object.fromEntries((chapters || []).map((c) => [c.id, c.name]));
    return (id) => map[id] || "";
  }, [chapters]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading the queue…</div>;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: (B.blue || "#1f6feb") + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Content for review</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Where a post is drafted, checked and cleared before it goes out. A chapter post is written by the Regional Coordinator and cleared by the Communications Officer. A national post is written by the Communications Officer and cleared by the National Coordinator.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("mine")} style={tabBtn(tab === "mine")}>
          My posts{mine.length ? ` (${mine.length})` : ""}
        </button>
        <button onClick={() => setTab("review")} style={tabBtn(tab === "review")}>
          To review{toReview.length ? ` (${toReview.length})` : ""}
        </button>
      </div>

      {tab === "mine" ? (
        <div>
          {canDraft && !composing && !editing ? (
            <button onClick={() => setComposing(true)} style={{ ...btnP, marginBottom: 14 }}>Start a post</button>
          ) : null}

          {composing ? (
            <ContentForm
              profile={profile} showToast={showToast}
              canDraftChapter={canDraftChapter} canDraftNational={canDraftNational || profile.is_admin}
              onDone={() => { setComposing(false); load(); }}
              onCancel={() => setComposing(false)} />
          ) : null}

          {editing ? (
            <ContentForm
              profile={profile} showToast={showToast} row={editing}
              canDraftChapter={canDraftChapter} canDraftNational={canDraftNational || profile.is_admin}
              onDone={() => { setEditing(null); load(); }}
              onCancel={() => setEditing(null)} />
          ) : null}

          {!mine.length && !composing ? (
            <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>
              {canDraft ? "Nothing yet. Start a post above." : "You don't have any posts here."}
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mine.map((r) => (
                <MineCard key={r.id} r={r} chapterName={chapterName} showToast={showToast} reload={load} onEdit={() => setEditing(r)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {!toReview.length ? (
            <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>
              Nothing waiting on you.
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {toReview.map((r) => (
                <ReviewCard key={r.id} r={r} chapterName={chapterName} showToast={showToast} reload={load} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A post the signed-in person is writing.
function MineCard({ r, chapterName, showToast, reload, onEdit }) {
  const [busy, setBusy] = useState(false);

  async function act(fn, ok) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast(ok); reload();
  }

  const meta = [
    r.origin === "chapter" ? chapterName(r.chapter_id) : "National",
    r.channel,
    r.pillar ? PILLAR_LABEL[r.pillar] : null,
    r.scheduled_for ? `for ${fmt(r.scheduled_for)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card style={{ padding: 14, borderLeft: `3px solid ${(STATUS_TONE[r.status] || STATUS_TONE.draft)[1]}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{r.title || "Untitled post"}</div>
        <Tag status={r.status} />
      </div>
      {meta ? <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>{meta}</div> : null}
      {r.body ? <div style={{ fontSize: 12.5, color: B.black, marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.body}</div> : null}
      {r.status === "returned" && r.review_note ? (
        <div style={{ fontSize: 12.5, color: B.red, marginTop: 8, lineHeight: 1.6 }}>
          <strong>Sent back:</strong> {r.review_note}
        </div>
      ) : null}
      {r.status === "approved" && r.review_note ? (
        <div style={{ fontSize: 12.5, color: B.green, marginTop: 8, lineHeight: 1.6 }}>
          <strong>Cleared:</strong> {r.review_note}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {(r.status === "draft" || r.status === "returned") ? (
          <>
            <button onClick={onEdit} style={btnG} disabled={busy}>Edit</button>
            <button onClick={() => act(() => supabase.rpc("submit_content", { item_id: r.id }), "Sent for review.")} style={btnP} disabled={busy}>
              Send for review
            </button>
          </>
        ) : null}
        {r.status === "approved" ? (
          <button onClick={() => act(() => supabase.rpc("publish_content", { item_id: r.id }), "Marked as published.")} style={btnP} disabled={busy}>
            Mark published
          </button>
        ) : null}
      </div>
    </Card>
  );
}

// A post waiting on the signed-in person to clear or send back.
function ReviewCard({ r, chapterName, showToast, reload }) {
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");

  async function approve() {
    setBusy(true);
    const { error } = await supabase.rpc("approve_content", { item_id: r.id, note: null });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Cleared to publish."); reload();
  }
  async function sendBack() {
    if (!note.trim()) { showToast("Add a note so the author knows what to change.", "warning"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("return_content", { item_id: r.id, note: note.trim() });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Sent back to the author."); reload();
  }

  const meta = [
    r.origin === "chapter" ? chapterName(r.chapter_id) : "National",
    r.channel,
    r.pillar ? PILLAR_LABEL[r.pillar] : null,
    r.scheduled_for ? `for ${fmt(r.scheduled_for)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card style={{ padding: 14, borderLeft: `3px solid ${B.gold}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{r.title || "Untitled post"}</div>
        <Tag status={r.status} />
      </div>
      {meta ? <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>{meta}</div> : null}
      {r.visual_note ? <div style={{ fontSize: 12, color: B.muted, marginTop: 6, lineHeight: 1.6 }}><strong>Visual:</strong> {r.visual_note}</div> : null}
      {r.body ? <div style={{ fontSize: 12.5, color: B.black, marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.body}</div> : null}

      {!returning ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={approve} style={btnP} disabled={busy}>Clear to publish</button>
          <button onClick={() => setReturning(true)} style={btnG} disabled={busy}>Send back</button>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <Field label="What needs changing">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} style={ta} placeholder="e.g. Add the venue, and swap the photo for the approved one." />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={sendBack} style={btnP} disabled={busy}>Send back with note</button>
            <button onClick={() => { setReturning(false); setNote(""); }} style={btnG} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Draft or edit. Origin is fixed by who you are: an RC writes for their
// chapter, the Communications Officer writes national. When a person can
// do both (an admin), they pick.
function ContentForm({ profile, showToast, row, canDraftChapter, canDraftNational, onDone, onCancel }) {
  const isEdit = !!row;
  const defaultOrigin = row ? row.origin : (canDraftChapter ? "chapter" : "national");
  const [f, setF] = useState({
    origin: defaultOrigin,
    title: row?.title || "",
    body: row?.body || "",
    channel: row?.channel || "",
    pillar: row?.pillar || "",
    visual_note: row?.visual_note || "",
    scheduled_for: row?.scheduled_for || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const bothOrigins = canDraftChapter && canDraftNational && !isEdit;

  async function save() {
    if (!f.title.trim() && !f.body.trim()) { showToast("Give the post a title or some copy first.", "warning"); return; }
    setBusy(true);
    const payload = {
      title: f.title.trim() || null,
      body: f.body.trim() || null,
      channel: f.channel || null,
      pillar: f.pillar || null,
      visual_note: f.visual_note.trim() || null,
      scheduled_for: f.scheduled_for || null,
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from("content_items").update(payload).eq("id", row.id));
    } else {
      const origin = f.origin;
      const insert = {
        ...payload,
        origin,
        author_id: profile.id,
        chapter_id: origin === "chapter" ? profile.chapter_id : null,
        status: "draft",
      };
      ({ error } = await supabase.from("content_items").insert(insert));
    }
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast(isEdit ? "Saved." : "Draft saved.");
    onDone();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <SHead as="h3">{isEdit ? "Edit post" : "New post"}</SHead>

      {bothOrigins ? (
        <Field label="Where is this from">
          <select value={f.origin} onChange={set("origin")} style={sel}>
            <option value="chapter">Chapter post (cleared by Communications)</option>
            <option value="national">National post (cleared by the National Coordinator)</option>
          </select>
        </Field>
      ) : null}

      <Field label="Title" hint="A short name so you can find it later.">
        <input value={f.title} onChange={set("title")} style={inp} placeholder="e.g. Fellowship invite — this Friday" />
      </Field>

      <Field label="The post itself">
        <textarea value={f.body} onChange={set("body")} style={{ ...ta, minHeight: 110 }} placeholder="The caption or copy as it will go out." />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Channel">
          <select value={f.channel} onChange={set("channel")} style={sel}>
            <option value="">—</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Content pillar">
          <select value={f.pillar} onChange={set("pillar")} style={sel}>
            <option value="">—</option>
            {PILLARS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Visual" hint="A link to the image or video, or a note about what should go with it. The brand asset library comes later.">
        <input value={f.visual_note} onChange={set("visual_note")} style={inp} placeholder="e.g. Drive link, or 'use the conference group photo'" />
      </Field>

      <Field label="Planned date">
        <input type="date" value={f.scheduled_for} min={today()} onChange={set("scheduled_for")} style={{ ...inp, maxWidth: 220 }} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{isEdit ? "Save" : "Save draft"}</button>
        <button onClick={onCancel} style={btnG} disabled={busy}>Cancel</button>
      </div>
    </Card>
  );
}

function tabBtn(on) {
  return {
    padding: "8px 16px", borderRadius: 8, border: "1.5px solid " + (on ? B.blue : B.border),
    background: on ? B.blue : B.white, color: on ? B.white : B.muted, fontSize: 12.5,
    fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
  };
}
