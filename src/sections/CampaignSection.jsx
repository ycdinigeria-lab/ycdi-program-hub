import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchAllRows } from "../lib/fetchAll.js";
import { B, inp, sel, ta, btnP, btnR, btnG } from "../theme.js";
import { Card, Field } from "../components/ui.jsx";
import { liveRegionProps } from "../lib/a11y.js";
import {
  BROADCAST_SEGMENTS, SEGMENT_LABEL, STATUS, SAMPLE, fillPreview, paragraphsOf,
  validateDraft, validateForSubmit, nextActions, canWrite, canManage, isNC,
  progressFigures, describeSendResult,
} from "../lib/campaignShared.js";

// BATCH31-MARKER campaigns-screen
//
// Email campaigns: write, approve, send. It sits on the Batch 29 audience
// and the Batch 30 send queue.
//
//   The Communications seat writes a campaign.
//   The National Coordinator approves it, and never their own.
//   The National Coordinator or the Communications seat starts sending.
//   The Finance seat can read, like the audience it draws on.
//
// The database decides all of that (row rules and functions in
// batch30-campaign-sending.sql). This screen only hides the buttons a
// person could not use, and says things in plain words before the
// database has to refuse. Nothing on this screen ever shows an address:
// the send queue is closed to every signed-in user, and the counts here
// come from a function that returns numbers only.

const TONES = {
  muted: [B.offWhite, B.muted], gold: [B.yellowLight, B.gold], red: [B.redLight, B.red],
  blue: [B.blueLight, B.blueDark], purple: [B.purpleLight, B.purple], green: ["#E6F4EC", B.green],
};

const fmtWhen = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const people = (n) => (n === 1 ? "1 person" : `${n} people`);

export default function CampaignSection({ profile, showToast }) {
  const [tab, setTab] = useState("campaigns");
  const [campaigns, setCampaigns] = useState([]);
  const [senders, setSenders] = useState([]);
  const [providers, setProviders] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null); // null, "new", or a campaign being edited

  const load = useCallback(async () => {
    setErr("");
    const [c, s, p, k] = await Promise.all([
      // BATCH36-MARKER fetch-all-use
      fetchAllRows(() => supabase.from("email_campaigns").select("*").order("updated_at", { ascending: false }).order("id")),
      supabase.from("email_senders").select("*").order("label"),
      supabase.from("email_providers").select("*").order("label"),
      supabase.rpc("audience_segment_counts"),
    ]);
    if (c.error || s.error || p.error || k.error) {
      setErr("Could not load campaigns. If this keeps happening, the Batch 30 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setCampaigns(c.data || []);
    setSenders(s.data || []);
    setProviders(p.data || []);
    setCounts(k.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const waitingForMe = useMemo(
    () => (isNC(profile) ? campaigns.filter((c) => c.status === "submitted" && c.author_id !== profile.id).length : 0),
    [campaigns, profile],
  );
  const sentBackToMe = useMemo(
    () => campaigns.filter((c) => c.status === "returned" && c.author_id === profile.id).length,
    [campaigns, profile],
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading campaigns…</div>;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Email campaigns</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          The Communications Officer writes a campaign and the National Coordinator approves it. Nobody approves their own. It can only go to groups that YCDI may write to in bulk, and anyone on the do-not-email list is left out, even if they joined it after the campaign began. Every email carries an unsubscribe link.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => { setTab("campaigns"); setForm(null); }} style={tabBtn(tab === "campaigns")}>Campaigns{campaigns.length ? ` (${campaigns.length})` : ""}</button>
        <button onClick={() => { setTab("senders"); setForm(null); }} style={tabBtn(tab === "senders")}>Senders and limits</button>
      </div>

      {tab === "campaigns" ? (
        <div>
          {waitingForMe ? <Notice tone="gold">{waitingForMe === 1 ? "1 campaign is" : `${waitingForMe} campaigns are`} waiting for your approval.</Notice> : null}
          {sentBackToMe ? <Notice tone="red">{sentBackToMe === 1 ? "1 campaign was" : `${sentBackToMe} campaigns were`} sent back to you with a note.</Notice> : null}

          {form ? (
            <CampaignForm
              profile={profile} senders={senders} counts={counts} showToast={showToast}
              row={form === "new" ? null : form}
              onDone={() => { setForm(null); load(); }} onCancel={() => setForm(null)}
            />
          ) : (
            <>
              {canWrite(profile) ? (
                <div style={{ marginBottom: 14 }}>
                  <button onClick={() => setForm("new")} style={btnP}>New campaign</button>
                </div>
              ) : null}
              {campaigns.length === 0 ? (
                <Card style={{ textAlign: "center", color: B.muted, fontSize: 13, lineHeight: 1.7 }}>
                  No campaigns yet. {canWrite(profile) ? "Start one with New campaign." : "The Communications Officer writes them, and the National Coordinator approves them."}
                </Card>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {campaigns.map((c) => (
                    <CampaignCard
                      key={c.id} c={c} profile={profile} senders={senders} counts={counts}
                      showToast={showToast} reload={load} onEdit={() => setForm(c)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <SendersPanel
          profile={profile} senders={senders} providers={providers}
          showToast={showToast} reload={load}
        />
      )}
    </div>
  );
}

// ---- one campaign -------------------------------------------------------
export function CampaignCard({ c, profile, senders, counts, showToast, reload, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // null, preview, return, start, cancel, delete
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(null);
  const [sendStatus, setSendStatus] = useState(null);

  const actions = nextActions(c, profile);
  const sender = senders.find((s) => s.id === c.sender_id);
  const reach = counts.find((r) => r.segment === c.segment);
  const showsProgress = ["sending", "sent", "cancelled"].includes(c.status);
  const figures = progressFigures(progress);

  const loadProgress = useCallback(async () => {
    const { data } = await supabase.rpc("campaign_progress", { p_id: c.id });
    setProgress((data && data[0]) || null);
  }, [c.id]);

  useEffect(() => { if (showsProgress) loadProgress(); }, [showsProgress, c.status, loadProgress]);

  async function call(name, args, done) {
    setBusy(true);
    const { error } = await supabase.rpc(name, args);
    setBusy(false);
    if (error) { showToast(error.message, "error"); return false; }
    setMode(null); setNote("");
    if (done) showToast(done);
    await reload();
    return true;
  }

  async function submit() {
    const problem = validateForSubmit(c, sender);
    if (problem) { showToast(problem, "warning"); return; }
    await call("submit_campaign", { p_id: c.id }, "Sent for approval.");
  }
  async function sendBack() {
    if (!note.trim()) { showToast("Add a note so the author knows what to change.", "warning"); return; }
    await call("return_campaign", { p_id: c.id, p_note: note.trim() }, "Sent back with your note.");
  }
  async function remove() {
    setBusy(true);
    const { data, error } = await supabase.from("email_campaigns").delete().eq("id", c.id).select("id");
    setBusy(false);
    if (error || !data || !data.length) { showToast(error ? error.message : "That was not allowed.", "error"); return; }
    showToast("Draft deleted.");
    reload();
  }

  // Asks the server to send for a short while. The server checks who is
  // asking, applies the provider's daily limit and the do-not-email list,
  // and stops early on purpose. Whatever is left is picked up by the
  // hourly job, so pressing this is never the only thing that finishes a
  // campaign.
  async function sendNow() {
    setBusy(true);
    setSendStatus({ level: "info", message: "Sending…" });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSendStatus({ level: "error", message: "Not signed in." }); setBusy(false); return; }
      const res = await fetch("/.netlify/functions/send-campaign-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ campaign_id: c.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body.error || "Sending did not work. Nobody was lost, so it is safe to try again.";
        setSendStatus({ level: "error", message });
        showToast(message, "error");
      } else {
        setSendStatus(describeSendResult(body));
      }
    } catch {
      setSendStatus({ level: "error", message: "Could not reach the server. Nobody was lost. Try again." });
    }
    setBusy(false);
    await loadProgress();
    reload();
  }

  async function start() {
    setBusy(true);
    const { data, error } = await supabase.rpc("start_campaign", { p_id: c.id });
    if (error) { setBusy(false); showToast(error.message, "error"); return; }
    setMode(null);
    showToast(`${people(Number(data) || 0)} queued.`);
    setBusy(false);
    await sendNow();
  }

  const tone = TONES[(STATUS[c.status] || STATUS.draft).tone];

  return (
    <Card style={{ padding: 16, borderLeft: `3px solid ${tone[1]}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{c.title || c.subject || "Untitled campaign"}</div>
          {c.subject && c.title ? <div style={{ fontSize: 12.5, color: B.muted, marginTop: 2 }}>Subject: {c.subject}</div> : null}
        </div>
        <StatusPill status={c.status} />
      </div>

      <div style={{ fontSize: 12, color: B.muted, marginTop: 8, lineHeight: 1.7 }}>
        To: <strong style={{ color: B.black }}>{(reach && reach.label) || SEGMENT_LABEL[c.segment] || c.segment}</strong>
        {reach ? ` (${people(reach.emailable)} right now)` : ""}
        {sender ? <><br />From: {sender.from_name} &lt;{sender.from_email}&gt;</> : null}
        <br />Last changed {fmtWhen(c.updated_at)}
      </div>

      {c.status === "returned" && c.review_note ? (
        <div style={{ marginTop: 10, padding: "8px 12px", background: B.redLight, borderRadius: 6, fontSize: 12.5, color: B.red, lineHeight: 1.6 }}>
          <strong>Sent back:</strong> {c.review_note}
        </div>
      ) : null}

      {showsProgress && progress ? <Progress f={figures} cancelled={c.status === "cancelled"} /> : null}
      {sendStatus ? (
        <div {...liveRegionProps(sendStatus.level === "error" ? "error" : "info")} style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6, color: sendStatus.level === "error" ? B.red : B.blueDark }}>
          {sendStatus.message}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={() => setMode(mode === "preview" ? null : "preview")} style={btnG} disabled={busy} aria-expanded={mode === "preview"}>
          {mode === "preview" ? "Hide preview" : "Preview"}
        </button>
        {actions.includes("edit") ? <button onClick={onEdit} style={btnG} disabled={busy}>Edit</button> : null}
        {actions.includes("submit") ? <button onClick={submit} style={btnP} disabled={busy}>Send for approval</button> : null}
        {actions.includes("approve") ? <button onClick={() => call("approve_campaign", { p_id: c.id, p_note: null }, "Approved. It can now be started.")} style={btnP} disabled={busy}>Approve</button> : null}
        {actions.includes("return") ? <button onClick={() => setMode("return")} style={btnG} disabled={busy}>Send back</button> : null}
        {actions.includes("start") ? <button onClick={() => setMode("start")} style={btnP} disabled={busy}>Start sending</button> : null}
        {actions.includes("send_more") ? <button onClick={sendNow} style={btnP} disabled={busy}>Send next batch</button> : null}
        {actions.includes("cancel") ? <button onClick={() => setMode("cancel")} style={btnG} disabled={busy}>Cancel campaign</button> : null}
        {actions.includes("delete") ? <button onClick={() => setMode("delete")} style={btnG} disabled={busy}>Delete draft</button> : null}
      </div>

      {mode === "preview" ? <div style={{ marginTop: 12 }}><EmailPreview subject={c.subject} body={c.body} /></div> : null}

      {mode === "return" ? (
        <div style={{ marginTop: 12 }}>
          <Field label="What needs to change?" required>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} style={ta} placeholder="e.g. Say who this is from in the first line, and shorten the second paragraph." />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={sendBack} style={btnP} disabled={busy}>Send back with note</button>
            <button onClick={() => { setMode(null); setNote(""); }} style={btnG} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : null}

      {mode === "start" ? (
        <Confirm
          text={`This writes to about ${reach ? people(reach.emailable) : "everyone"} in "${(reach && reach.label) || SEGMENT_LABEL[c.segment]}", from ${sender ? sender.from_email : "the chosen sender"}. Anyone on the do-not-email list is left out. Emails already sent cannot be recalled, but you can cancel whatever has not gone out yet.`}
          yes="Yes, start sending" onYes={start} onNo={() => setMode(null)} busy={busy}
        />
      ) : null}
      {mode === "cancel" ? (
        <Confirm
          text="Cancelling stops the campaign. Anyone not yet written to is skipped. Emails already sent stay sent."
          yes="Yes, cancel it" onYes={() => call("cancel_campaign", { p_id: c.id }, "Campaign cancelled.")}
          onNo={() => setMode(null)} busy={busy} danger
        />
      ) : null}
      {mode === "delete" ? (
        <Confirm text="Delete this draft? It cannot be brought back." yes="Yes, delete it" onYes={remove} onNo={() => setMode(null)} busy={busy} danger />
      ) : null}
    </Card>
  );
}

// ---- writing a campaign -------------------------------------------------
export function CampaignForm({ profile, senders, counts, showToast, row, onDone, onCancel }) {
  const active = senders.filter((s) => s.active);
  const [f, setF] = useState({
    title: row?.title || "",
    subject: row?.subject || "",
    body: row?.body || "",
    segment: row?.segment || "",
    sender_id: row?.sender_id || (active.length === 1 ? active[0].id : ""),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const reachOf = (key) => counts.find((r) => r.segment === key);

  async function save(andSubmit) {
    const sender = senders.find((s) => s.id === f.sender_id);
    const problem = andSubmit ? validateForSubmit(f, sender) : validateDraft(f);
    if (problem) { showToast(problem, "warning"); return; }

    setBusy(true);
    const fields = {
      title: f.title.trim(), subject: f.subject.trim(), body: f.body,
      segment: f.segment, sender_id: f.sender_id || null,
    };
    let id = row?.id;
    if (row) {
      const { data, error } = await supabase.from("email_campaigns").update(fields).eq("id", row.id).select("id");
      if (error || !data || !data.length) { setBusy(false); showToast(error ? error.message : "That was not allowed.", "error"); return; }
    } else {
      const { data, error } = await supabase.from("email_campaigns")
        .insert({ ...fields, author_id: profile.id }).select("id").single();
      if (error) { setBusy(false); showToast(error.message, "error"); return; }
      id = data.id;
    }
    if (andSubmit) {
      const { error } = await supabase.rpc("submit_campaign", { p_id: id });
      if (error) { setBusy(false); showToast(`Saved as a draft, but it could not be sent for approval: ${error.message}`, "error"); onDone(); return; }
      showToast("Sent for approval.");
    } else {
      showToast("Draft saved.");
    }
    setBusy(false);
    onDone();
  }

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 12 }}>{row ? "Edit campaign" : "New campaign"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18, alignItems: "start" }}>
        <div>
          <Field label="Name" required hint="For your team's list only. The reader never sees it.">
            <input value={f.title} onChange={set("title")} style={inp} placeholder="e.g. October update to supporters" />
          </Field>
          <Field label="Send to" required hint="Only groups YCDI may write to in bulk are listed. Champions, Partners and grant funders get personal contact.">
            <select value={f.segment} onChange={set("segment")} style={sel}>
              <option value="">Choose a group</option>
              {BROADCAST_SEGMENTS.map(([key, label]) => (
                <option key={key} value={key}>{(reachOf(key) && reachOf(key).label) || label}{reachOf(key) ? ` (${reachOf(key).emailable})` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Send from" required hint={active.length ? "The address the email comes from." : "There is no sender yet. Add one in Senders and limits first."}>
            <select value={f.sender_id} onChange={set("sender_id")} style={sel}>
              <option value="">Choose a sender</option>
              {active.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.from_email})</option>)}
            </select>
          </Field>
          <Field label="Subject" required>
            <input value={f.subject} onChange={set("subject")} style={inp} maxLength={150} placeholder="e.g. Peace to you, {{first_name}}" />
          </Field>
          <Field label="Message" required hint="Leave a blank line between paragraphs. {{first_name}} and {{chapter}} are filled in for each person. The unsubscribe line is added for you.">
            <textarea value={f.body} onChange={set("body")} style={{ ...ta, minHeight: 200 }} />
          </Field>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "'Montserrat',sans-serif" }}>Preview</div>
          <EmailPreview subject={f.subject} body={f.body} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <button onClick={() => save(false)} style={btnG} disabled={busy}>Save draft</button>
        <button onClick={() => save(true)} style={btnP} disabled={busy}>Save and send for approval</button>
        <button onClick={onCancel} style={btnG} disabled={busy}>Cancel</button>
      </div>
    </Card>
  );
}

// What the email will look like. The words are placed as text, never as
// markup, so nothing typed here can change the page.
export function EmailPreview({ subject, body }) {
  const paras = paragraphsOf(fillPreview(body));
  return (
    <div style={{ border: `1px solid ${B.border}`, borderRadius: 10, overflow: "hidden", background: B.white }}>
      <div style={{ padding: "8px 14px", background: B.offWhite, fontSize: 12, color: B.muted, borderBottom: `1px solid ${B.border}` }}>
        Subject: <strong style={{ color: B.black }}>{fillPreview(subject) || "(no subject yet)"}</strong>
      </div>
      <div style={{ background: B.blue, color: B.white, padding: "10px 16px", fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>Young Christian Development Initiative</div>
      <div style={{ padding: "16px", fontSize: 13.5, color: B.black, lineHeight: 1.65 }}>
        {paras.length ? paras.map((p, i) => <p key={i} style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{p}</p>) : <span style={{ color: B.muted }}>Your message appears here as you write it.</span>}
      </div>
      <div style={{ padding: "10px 16px", background: B.offWhite, fontSize: 11.5, color: B.muted, lineHeight: 1.6 }}>
        You are receiving this because you are part of the YCDI community. <u>Unsubscribe</u>
      </div>
      <div style={{ padding: "6px 16px", fontSize: 11, color: B.muted, borderTop: `1px solid ${B.border}` }}>
        Shown with a sample name and chapter ({SAMPLE.first_name}, {SAMPLE.chapter}).
      </div>
    </div>
  );
}

// ---- senders and the daily limit ----------------------------------------
export function SendersPanel({ profile, senders, providers, showToast, reload }) {
  const [form, setForm] = useState(null); // null, "new", or a sender
  const manage = canManage(profile);
  const providerLabel = Object.fromEntries(providers.map((p) => [p.code, p.label]));

  return (
    <div>
      <GroupTitle>Senders</GroupTitle>
      <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.7, margin: "0 0 10px" }}>
        A sender is who an email comes from. Its address must be on a domain that the email provider has verified, or the provider will refuse every send. Nothing is lost when that happens: sending stops and everybody is put back in the queue.
      </p>
      {form ? (
        <SenderForm profile={profile} providers={providers} row={form === "new" ? null : form} showToast={showToast}
          onDone={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
      ) : (
        <>
          {manage ? <div style={{ marginBottom: 12 }}><button onClick={() => setForm("new")} style={btnP}>Add a sender</button></div> : null}
          {senders.length === 0 ? (
            <Card style={{ color: B.muted, fontSize: 13 }}>No senders yet. {manage ? "Add one to be able to write a campaign." : ""}</Card>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {senders.map((s) => (
                <SenderRow key={s.id} s={s} providerLabel={providerLabel[s.provider] || s.provider} manage={manage}
                  showToast={showToast} reload={reload} onEdit={() => setForm(s)} />
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ height: 22 }} />
      <GroupTitle>Daily limit</GroupTitle>
      <p style={{ fontSize: 12, color: B.muted, lineHeight: 1.7, margin: "0 0 10px" }}>
        The most campaign emails a provider may send in any 24 hours. Set it below your plan's own limit, so the approval notices and other system emails sharing the account always get through. A big campaign is spread over as many days as the limit needs, and finishes by itself.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {providers.map((p) => (
          <ProviderRow key={p.code} p={p} canEdit={isNC(profile)} showToast={showToast} reload={reload} />
        ))}
      </div>
    </div>
  );
}

export function SenderRow({ s, providerLabel, manage, showToast, reload, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function toggle() {
    setBusy(true);
    const { data, error } = await supabase.from("email_senders").update({ active: !s.active }).eq("id", s.id).select("id");
    setBusy(false);
    if (error || !data || !data.length) { showToast(error ? error.message : "That was not allowed.", "error"); return; }
    showToast(s.active ? "Sender switched off." : "Sender switched on.");
    reload();
  }
  async function remove() {
    setBusy(true);
    const { data, error } = await supabase.from("email_senders").delete().eq("id", s.id).select("id");
    setBusy(false);
    if (error) {
      showToast(error.code === "23503" ? "A campaign has used this sender, so it cannot be deleted. Switch it off instead." : error.message, "error");
      return;
    }
    if (!data || !data.length) { showToast("That was not allowed.", "error"); return; }
    showToast("Sender deleted.");
    reload();
  }

  return (
    <Card style={{ padding: 14, opacity: s.active ? 1 : 0.75 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{s.label}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.7 }}>
            {s.from_name} &lt;{s.from_email}&gt;
            {s.reply_to ? <><br />Replies go to {s.reply_to}</> : null}
            <br />Sent through {providerLabel}
          </div>
        </div>
        <StatusPill custom={s.active ? { label: "On", tone: "green" } : { label: "Switched off", tone: "muted" }} />
      </div>
      {manage ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={onEdit} style={btnG} disabled={busy}>Edit</button>
          <button onClick={toggle} style={btnG} disabled={busy}>{s.active ? "Switch off" : "Switch on"}</button>
          <button onClick={() => setConfirming(true)} style={btnG} disabled={busy}>Delete</button>
        </div>
      ) : null}
      {confirming ? <Confirm text="Delete this sender? A sender that a campaign has used cannot be deleted; switch it off instead." yes="Yes, delete it" onYes={remove} onNo={() => setConfirming(false)} busy={busy} danger /> : null}
    </Card>
  );
}

export function SenderForm({ profile, providers, row, showToast, onDone, onCancel }) {
  const [f, setF] = useState({
    label: row?.label || "", from_name: row?.from_name || "", from_email: row?.from_email || "",
    reply_to: row?.reply_to || "", provider: row?.provider || (providers[0] ? providers[0].code : ""),
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.label.trim()) { showToast("Give the sender a label your team will recognise.", "warning"); return; }
    if (!f.from_name.trim()) { showToast("Add the name people will see.", "warning"); return; }
    if (/[<>"\r\n]/.test(f.from_name)) { showToast("The name cannot contain < > or quote marks.", "warning"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.from_email.trim())) { showToast("That is not an email address.", "warning"); return; }
    if (f.reply_to.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.reply_to.trim())) { showToast("The reply address is not an email address.", "warning"); return; }
    if (!f.provider) { showToast("Choose the email provider.", "warning"); return; }

    setBusy(true);
    const fields = {
      label: f.label.trim(), from_name: f.from_name.trim(), from_email: f.from_email.trim(),
      reply_to: f.reply_to.trim() || null, provider: f.provider,
    };
    const { data, error } = row
      ? await supabase.from("email_senders").update(fields).eq("id", row.id).select("id")
      : await supabase.from("email_senders").insert({ ...fields, created_by: profile.id }).select("id");
    setBusy(false);
    if (error) { showToast(error.code === "23505" ? "There is already a sender with that address." : error.message, "error"); return; }
    if (!data || !data.length) { showToast("That was not allowed.", "error"); return; }
    showToast(row ? "Saved." : "Sender added.");
    onDone();
  }

  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <Field label="Label" required hint="For your team's list, e.g. Communications."><input value={f.label} onChange={set("label")} style={inp} /></Field>
        <Field label="Name people see" required><input value={f.from_name} onChange={set("from_name")} style={inp} placeholder="YCDI Communications" /></Field>
        <Field label="From address" required hint="On a domain the provider has verified."><input value={f.from_email} onChange={set("from_email")} style={inp} inputMode="email" /></Field>
        <Field label="Replies go to" hint="A mailbox somebody reads. Optional."><input value={f.reply_to} onChange={set("reply_to")} style={inp} inputMode="email" /></Field>
        <Field label="Sent through" required>
          <select value={f.provider} onChange={set("provider")} style={sel}>
            {providers.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} style={btnP} disabled={busy}>{row ? "Save" : "Add sender"}</button>
        <button onClick={onCancel} style={btnG} disabled={busy}>Cancel</button>
      </div>
    </Card>
  );
}

export function ProviderRow({ p, canEdit, showToast, reload }) {
  const [cap, setCap] = useState(String(p.daily_cap));
  const [busy, setBusy] = useState(false);

  async function change(fields, done) {
    setBusy(true);
    const { data, error } = await supabase.from("email_providers").update(fields).eq("code", p.code).select("code");
    setBusy(false);
    if (error || !data || !data.length) { showToast(error ? error.message : "That was not allowed.", "error"); return; }
    showToast(done);
    reload();
  }
  function saveCap() {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 1) { showToast("Enter a whole number of emails, 1 or more.", "warning"); return; }
    change({ daily_cap: n }, "Daily limit saved.");
  }

  return (
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{p.label}</div>
        <StatusPill custom={p.active ? { label: "On", tone: "green" } : { label: "Switched off", tone: "muted" }} />
      </div>
      {canEdit ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <div style={{ width: 170 }}>
            <Field label="Emails per 24 hours"><input value={cap} onChange={(e) => setCap(e.target.value)} style={inp} inputMode="numeric" /></Field>
          </div>
          <div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
            <button onClick={saveCap} style={btnP} disabled={busy || String(p.daily_cap) === cap}>Save limit</button>
            <button onClick={() => change({ active: !p.active }, p.active ? "Provider switched off." : "Provider switched on.")} style={btnG} disabled={busy}>{p.active ? "Switch off" : "Switch on"}</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: B.muted, marginTop: 6 }}>Up to {p.daily_cap} emails in any 24 hours. Only the National Coordinator can change this.</div>
      )}
    </Card>
  );
}

// ---- small pieces -------------------------------------------------------
function StatusPill({ status, custom }) {
  const s = custom || STATUS[status] || STATUS.draft;
  const [bg, fg] = TONES[s.tone];
  return (
    <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: fg, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function Progress({ f, cancelled }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ height: 8, borderRadius: 4, background: B.border, overflow: "hidden" }} role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.percent} aria-label="How much of the campaign has been dealt with">
        <div style={{ width: `${f.percent}%`, height: "100%", background: cancelled ? B.muted : B.blue }} />
      </div>
      <div style={{ fontSize: 12, color: B.muted, marginTop: 6, lineHeight: 1.6 }}>
        {f.sent} sent{f.waiting ? `, ${f.waiting} waiting` : ""}{f.failed ? `, ${f.failed} could not be reached` : ""}{f.skipped ? `, ${f.skipped} skipped (stopped or cancelled)` : ""}
      </div>
    </div>
  );
}

function Confirm({ text, yes, onYes, onNo, busy, danger }) {
  return (
    <div style={{ marginTop: 12, padding: 12, background: danger ? B.redLight : B.blueLight, borderRadius: 8 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: B.black, lineHeight: 1.7 }}>{text}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onYes} style={danger ? btnR : btnP} disabled={busy}>{yes}</button>
        <button onClick={onNo} style={btnG} disabled={busy}>Not now</button>
      </div>
    </div>
  );
}

function Notice({ tone, children }) {
  const [bg, fg] = TONES[tone];
  return <div style={{ marginBottom: 12, padding: "9px 14px", background: bg, color: fg, borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>{children}</div>;
}

function GroupTitle({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: 0.6, margin: "4px 0 8px", fontFamily: "'Montserrat',sans-serif" }}>{children}</div>;
}

function tabBtn(on) {
  return {
    padding: "8px 16px", borderRadius: 8, border: "1.5px solid " + (on ? B.blue : B.border),
    background: on ? B.blue : B.white, color: on ? B.white : B.muted, fontSize: 12.5,
    fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
  };
}
