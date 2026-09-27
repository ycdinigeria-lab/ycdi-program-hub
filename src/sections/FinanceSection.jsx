import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchAllRows, mergeById } from "../lib/fetchAll.js";
import { humanise } from "../lib/errors.js";
import { compressImage } from "../lib/imageCompress.js";
import { B, inp, sel, ta, btnP, btnG, btnR } from "../theme.js";
import { Card, SHead, Field, StatCard, MiniBar } from "../components/ui.jsx";
import {
  CATEGORIES, CATEGORY_LABEL, STATUS_WORD, EVENT_WORD, ACTION_LABEL, RECEIPT_LIMIT,
  formatNaira, parseNairaToKobo, koboToInput, todayLagos, dueInfo, actionsFor, canDecide,
  isOfficer, canReadAll, isChapterReader, checkReceiptFile, receiptPath, totals,
} from "../lib/finance.js";

// BATCH32-MARKER finance-screen
//
// Programme budgets and expense claims. A member claims back what they
// spent, attaches the receipt, and the Financial Secretary approves it and
// notes the payment. The Hub records money; it never moves it, and it
// never holds an account number.
//
// Row security and the functions in Batch 32 decide every one of these
// things. This screen only decides which buttons to show, using the same
// rules (lib/finance.js), so nobody is offered a door that will be shut.

const STATUS_TONE = {
  draft: [B.offWhite, B.muted],
  submitted: ["#FFF7E6", B.gold],
  returned: [B.redLight, B.red],
  approved: ["#E8F5EC", B.green],
  paid: [B.blueLight, B.blue],
  rejected: [B.redLight, B.red],
  withdrawn: [B.offWhite, B.muted],
};
const DUE_TONE = { ok: [B.offWhite, B.muted], soon: ["#FFF7E6", B.gold], late: [B.redLight, B.red] };

const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtStamp = (t) => (t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function Pill({ tone, children }) {
  const [bg, fg] = tone;
  return (
    <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>
      {children}
    </span>
  );
}

const tabBtn = (on) => ({
  background: on ? B.blue : B.white, color: on ? B.white : B.muted, border: "1px solid " + (on ? B.blue : B.border),
  borderRadius: 20, padding: "7px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
});

// ---------------------------------------------------------------------------
// One claim, as a card. Presentational only: it shows the facts and the
// buttons this person is offered, and reports which was pressed.
// ---------------------------------------------------------------------------
export function ClaimCard({ claim, profile, finHolderId, programmeTitle, chapterName, open, onAction, onToggle, today, children }) {
  const mine = claim.claimant_id === profile.id;
  const due = dueInfo(claim, today);
  const acts = actionsFor(profile, claim, finHolderId);
  return (
    <Card style={{ marginBottom: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, overflowWrap: "anywhere" }}>{claim.title}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.6 }}>
            {CATEGORY_LABEL[claim.category] || claim.category}
            {programmeTitle ? " · " + programmeTitle : ""}
            {" · spent " + fmtDate(claim.incurred_on)}
            {!mine ? " · " + claim.claimant_name : ""}
            {chapterName ? " · " + chapterName : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 17, color: B.black }}>{formatNaira(claim.amount_kobo)}</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
            <Pill tone={STATUS_TONE[claim.status] || STATUS_TONE.draft}>{STATUS_WORD[claim.status] || claim.status}</Pill>
            {due ? <Pill tone={DUE_TONE[due.level]}>{due.text}</Pill> : null}
            {claim.over_budget ? <Pill tone={[B.redLight, B.red]}>Over budget</Pill> : null}
          </div>
        </div>
      </div>

      {claim.status === "returned" && claim.review_note ? (
        <div style={{ marginTop: 10, background: B.redLight, borderRadius: 6, padding: "8px 12px", fontSize: 12.5, color: B.red, lineHeight: 1.6 }}>
          <strong>Sent back:</strong> {claim.review_note}
        </div>
      ) : null}
      {claim.status === "rejected" && claim.review_note ? (
        <div style={{ marginTop: 10, background: B.redLight, borderRadius: 6, padding: "8px 12px", fontSize: 12.5, color: B.red, lineHeight: 1.6 }}>
          <strong>Not approved:</strong> {claim.review_note}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {acts.map((a) => (
          <button key={a} type="button" onClick={() => onAction && onAction(claim, a)}
            style={a === "submit" || a === "approve" || a === "markpaid" ? btnP : a === "decline" ? { ...btnG, color: B.red, borderColor: B.red } : btnG}>
            {ACTION_LABEL[a]}
          </button>
        ))}
        <button type="button" onClick={() => onToggle && onToggle(claim)} aria-expanded={!!open} style={btnG}>
          {open ? "Hide details" : "Details"}
        </button>
      </div>

      {open ? <div style={{ marginTop: 14, borderTop: "1px solid " + B.offWhite, paddingTop: 14 }}>{children}</div> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The details under a claim: what was written, the receipts, the history.
// ---------------------------------------------------------------------------
export function ClaimFacts({ claim, receipts, events, onViewReceipt, programmeTitle }) {
  return (
    <div>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: "0 0 14px", fontSize: 13 }}>
        <dt style={{ color: B.muted }}>Claim number</dt><dd style={{ margin: 0 }}>EXP-{String(claim.claim_no).padStart(4, "0")}</dd>
        <dt style={{ color: B.muted }}>Claimed by</dt><dd style={{ margin: 0 }}>{claim.claimant_name}</dd>
        {programmeTitle ? (<><dt style={{ color: B.muted }}>Programme</dt><dd style={{ margin: 0 }}>{programmeTitle}</dd></>) : null}
        {claim.description ? (<><dt style={{ color: B.muted }}>Description</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{claim.description}</dd></>) : null}
        {claim.no_receipt_reason ? (<><dt style={{ color: B.muted }}>No receipt because</dt><dd style={{ margin: 0 }}>{claim.no_receipt_reason}</dd></>) : null}
        {claim.submitted_at ? (<><dt style={{ color: B.muted }}>Sent up</dt><dd style={{ margin: 0 }}>{fmtStamp(claim.submitted_at)}</dd></>) : null}
        {claim.due_by && claim.status === "submitted" ? (<><dt style={{ color: B.muted }}>Decision due by</dt><dd style={{ margin: 0 }}>{fmtDate(claim.due_by)}</dd></>) : null}
        {claim.status === "paid" ? (<><dt style={{ color: B.muted }}>Paid</dt><dd style={{ margin: 0 }}>{fmtDate(claim.paid_on)} · reference {claim.payment_ref}</dd></>) : null}
        {claim.review_note && claim.status !== "returned" && claim.status !== "rejected" ? (<><dt style={{ color: B.muted }}>Reviewer's note</dt><dd style={{ margin: 0 }}>{claim.review_note}</dd></>) : null}
      </dl>

      <SHead as="h3">Receipts</SHead>
      {receipts && receipts.length ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
          {receipts.map((r) => (
            <li key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ overflowWrap: "anywhere" }}>{r.file_name}</span>
              <button type="button" onClick={() => onViewReceipt && onViewReceipt(r)} style={{ ...btnG, padding: "3px 10px", fontSize: 11.5 }}>View</button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: B.muted }}>No receipt attached.</p>
      )}

      <SHead as="h3">History</SHead>
      {events && events.length ? (
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((e) => (
            <li key={e.id} style={{ padding: "5px 0", fontSize: 12.5, color: B.black, lineHeight: 1.6 }}>
              <strong>{EVENT_WORD[e.kind] || e.kind}</strong>
              <span style={{ color: B.muted }}> · {e.actor_name} · {fmtStamp(e.at)}</span>
              {e.note ? <div style={{ color: B.muted }}>{e.note}</div> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nothing has happened to this claim yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Writing or mending a claim.
// ---------------------------------------------------------------------------
export function ClaimForm({ claim, programmes, saving, onSave, onCancel }) {
  const [title, setTitle] = useState(claim ? claim.title : "");
  const [category, setCategory] = useState(claim ? claim.category : "transport");
  const [amount, setAmount] = useState(claim ? koboToInput(claim.amount_kobo) : "");
  const [date, setDate] = useState(claim ? claim.incurred_on : todayLagos());
  const [programme, setProgramme] = useState(claim && claim.programme_id ? claim.programme_id : "");
  const [description, setDescription] = useState(claim && claim.description ? claim.description : "");
  const [noReceipt, setNoReceipt] = useState(claim && claim.no_receipt_reason ? claim.no_receipt_reason : "");
  const [problem, setProblem] = useState("");

  function submit(e) {
    e.preventDefault();
    const parsed = parseNairaToKobo(amount);
    if (!title.trim()) return setProblem("Give the claim a short title.");
    if (!parsed.ok) return setProblem(parsed.error);
    if (!date) return setProblem("Say when the money was spent.");
    if (date > todayLagos()) return setProblem("The spend date cannot be in the future.");
    setProblem("");
    onSave({
      p_title: title.trim(), p_category: category, p_amount_kobo: parsed.kobo, p_incurred_on: date,
      p_programme: programme || null, p_description: description.trim() || null, p_no_receipt_reason: noReceipt.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="What was it for" required>
        <input style={inp} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Taxi to the school visit" />
      </Field>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Category" required>
            <select style={sel} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Amount (naira)" required hint="Exactly what you paid, for example 3500 or 3500.50.">
            <input style={inp} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Date spent" required>
            <input style={inp} type="date" value={date} max={todayLagos()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Programme" hint="Choose one if this was spent on an approved programme in your chapter. Leave blank for a general cost.">
        <select style={sel} value={programme} onChange={(e) => setProgramme(e.target.value)}>
          <option value="">Not for a programme</option>
          {(programmes || []).map((p) => <option key={p.id} value={p.id}>{p.title}{p.date ? " (" + fmtDate(p.date) + ")" : ""}</option>)}
        </select>
      </Field>
      <Field label="Details" hint="Anything the Financial Secretary needs to understand the cost.">
        <textarea style={ta} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="If you have no receipt, say why" hint="Only needed when there is nothing to attach. The reviewer will see it.">
        <textarea style={{ ...ta, minHeight: 60 }} value={noReceipt} maxLength={500} onChange={(e) => setNoReceipt(e.target.value)} />
      </Field>
      {problem ? <p role="alert" style={{ color: B.red, fontSize: 13, margin: "0 0 12px" }}>{problem}</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : claim ? "Save changes" : "Save draft"}</button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Attaching and removing receipts while a claim is still open.
// ---------------------------------------------------------------------------
function ReceiptsEditor({ claim, receipts, reload, showToast }) {
  const [busy, setBusy] = useState(false);

  async function add(e) {
    const picked = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!picked) return;
    const early = checkReceiptFile(picked);
    if (early) return showToast(early, "error");
    if (receipts.length >= RECEIPT_LIMIT) return showToast("A claim can carry five receipts at most.", "error");
    setBusy(true);
    let path = null;
    try {
      // A phone photo can be several megabytes; shrink it before it goes up
      // a mobile connection, but keep it sharp enough to read a till slip.
      const file = await compressImage(picked, { maxEdge: 2000, quality: 0.85 });
      const tooBig = checkReceiptFile(file);
      if (tooBig) throw new Error(tooBig);
      const rand = (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).slice(0, 8);
      path = receiptPath(claim.id, file.name, rand);
      const up = await supabase.storage.from("finance-receipts").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const reg = await supabase.rpc("add_receipt", { p_claim: claim.id, p_path: path, p_name: picked.name });
      if (reg.error) throw reg.error;
      showToast("Receipt attached.");
      await reload();
    } catch (err) {
      // A file that went up but was never registered would sit in storage
      // for nobody. Take it back down.
      if (path) await supabase.storage.from("finance-receipts").remove([path]).catch(() => {});
      showToast(humanise(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    if (!window.confirm(`Remove ${r.file_name}?`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("remove_receipt", { p_receipt: r.id });
      if (error) throw error;
      if (data) await supabase.storage.from("finance-receipts").remove([data]).catch(() => {});
      await reload();
    } catch (err) {
      showToast(humanise(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <SHead as="h3">Receipts</SHead>
      {receipts.length ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px" }}>
          {receipts.map((r) => (
            <li key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ overflowWrap: "anywhere" }}>{r.file_name}</span>
              <button type="button" disabled={busy} onClick={() => remove(r)} style={{ ...btnG, padding: "3px 10px", fontSize: 11.5 }}>Remove</button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: "0 0 10px", fontSize: 13, color: B.muted }}>Nothing attached yet.</p>
      )}
      <label style={{ ...btnG, display: "inline-block", opacity: busy || receipts.length >= RECEIPT_LIMIT ? 0.5 : 1 }}>
        {busy ? "Uploading…" : "Attach a receipt"}
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={add}
          disabled={busy || receipts.length >= RECEIPT_LIMIT} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
      </label>
      <div style={{ fontSize: 11.5, color: B.muted, marginTop: 6 }}>A photo or a PDF, up to 5 MB each, five at most.</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deciding a claim, and noting a payment.
// ---------------------------------------------------------------------------
export function DecisionBox({ decision, claim, remainingKobo, busy, onConfirm, onCancel }) {
  const [note, setNote] = useState("");
  const over = decision === "approve" && remainingKobo !== null && remainingKobo !== undefined && claim.amount_kobo > remainingKobo;
  const needs = decision === "return" || decision === "decline" || over;
  const title = decision === "approve" ? "Approve this claim" : decision === "return" ? "Send this claim back" : "Decline this claim";
  return (
    <div style={{ background: B.offWhite, borderRadius: 8, padding: 14 }}>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{title}</div>
      {over ? (
        <p role="alert" style={{ margin: "0 0 10px", fontSize: 12.5, color: B.red, lineHeight: 1.6 }}>
          This takes the programme over its approved budget by {formatNaira(claim.amount_kobo - remainingKobo)}. Say why it is being approved.
        </p>
      ) : null}
      <Field label={needs ? "Your note (required)" : "Your note (optional)"}
        hint={decision === "return" ? "Tell them what to fix. They can edit and send it up again." : decision === "decline" ? "This is final. Say why, so they understand." : undefined}>
        <textarea style={{ ...ta, minHeight: 70 }} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" disabled={busy || (needs && note.trim().length < (over ? 10 : 5))}
          onClick={() => onConfirm(note.trim())}
          style={{ ...(decision === "decline" ? btnR : btnP), opacity: busy || (needs && note.trim().length < (over ? 10 : 5)) ? 0.5 : 1 }}>
          {busy ? "Saving…" : "Confirm"}
        </button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </div>
  );
}

export function PayBox({ claim, busy, onConfirm, onCancel }) {
  const [ref, setRef] = useState("");
  const [paidOn, setPaidOn] = useState(todayLagos());
  const looksLikeAccount = /^\s*\d{10}\s*$/.test(ref);
  const ready = ref.trim() && paidOn && !looksLikeAccount;
  return (
    <div style={{ background: B.offWhite, borderRadius: 8, padding: 14 }}>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        Note the payment of {formatNaira(claim.amount_kobo)} to {claim.claimant_name}
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
        The Hub does not move money. Pay through your normal channel, then record it here.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 220px" }}>
          <Field label="Payment reference" required hint="The transfer reference or receipt number. Not a bank account number.">
            <input style={inp} value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Date paid" required>
            <input style={inp} type="date" value={paidOn} max={todayLagos()} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
      </div>
      {looksLikeAccount ? <p role="alert" style={{ color: B.red, fontSize: 12.5, margin: "0 0 10px" }}>That looks like a bank account number. Enter the transfer reference instead.</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" disabled={busy || !ready} onClick={() => onConfirm(ref.trim(), paidOn)} style={{ ...btnP, opacity: busy || !ready ? 0.5 : 1 }}>
          {busy ? "Saving…" : "Record payment"}
        </button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budgets against spend, one programme at a time.
// ---------------------------------------------------------------------------
export function BudgetCard({ row, officer, onRevise }) {
  const used = Number(row.committed_kobo) + Number(row.paid_kobo);
  const remaining = Number(row.remaining_kobo);
  const gap = Number(row.reported_kobo) - used;
  return (
    <Card style={{ marginBottom: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14 }}>{row.title}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>{row.chapter_name}{row.programme_date ? " · " + fmtDate(row.programme_date) : ""} · {row.status}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Approved budget</div>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 17 }}>{formatNaira(row.approved_kobo)}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 8px" }}>
        <MiniBar value={Math.max(used, 0)} max={Number(row.approved_kobo) || 1} label={`${row.title}: ${formatNaira(used)} of ${formatNaira(row.approved_kobo)} used`} />
        <span style={{ fontSize: 12, color: remaining < 0 ? B.red : B.muted, whiteSpace: "nowrap", fontWeight: 600 }}>
          {remaining < 0 ? formatNaira(-remaining) + " over" : formatNaira(remaining) + " left"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: B.black }}>
        <span>Paid <strong>{formatNaira(row.paid_kobo)}</strong></span>
        <span>Approved, unpaid <strong>{formatNaira(row.committed_kobo)}</strong></span>
        <span>Waiting <strong>{formatNaira(row.pending_kobo)}</strong></span>
        {Number(row.reported_kobo) > 0 ? <span style={{ color: B.muted }}>Reported after the programme <strong>{formatNaira(row.reported_kobo)}</strong>{gap !== 0 ? ` (${gap > 0 ? "+" : "-"}${formatNaira(Math.abs(gap))} against claims)` : ""}</span> : null}
      </div>
      {officer ? <button type="button" onClick={() => onRevise(row)} style={{ ...btnG, marginTop: 12 }}>Revise budget</button> : null}
    </Card>
  );
}

function ReviseBox({ row, busy, onConfirm, onCancel }) {
  const [amount, setAmount] = useState(koboToInput(row.approved_kobo));
  const [reason, setReason] = useState("");
  const parsed = parseNairaToKobo(amount);
  const ready = parsed.ok && reason.trim().length >= 10;
  return (
    <div style={{ background: B.offWhite, borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Revise the budget for {row.title}</div>
      <Field label="New approved budget (naira)" hint={`Currently ${formatNaira(row.approved_kobo)}. It cannot go below what is already approved or paid.`}>
        <input style={inp} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Reason" required hint="For example, the Board's decision and its date.">
        <textarea style={{ ...ta, minHeight: 60 }} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {!parsed.ok && amount ? <p role="alert" style={{ color: B.red, fontSize: 12.5, margin: "0 0 10px" }}>{parsed.error}</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" disabled={busy || !ready} onClick={() => onConfirm(parsed.kobo, reason.trim())} style={{ ...btnP, opacity: busy || !ready ? 0.5 : 1 }}>{busy ? "Saving…" : "Revise budget"}</button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
// BATCH36-MARKER claims-complete
// Claims that still need somebody to act on them are always loaded, however
// old. So is every claim the signed-in person made, because their own
// totals are added up from the list. Only other people's closed claims
// (paid, rejected, withdrawn) are trimmed to the newest few hundred.
const OPEN_CLAIM = ["draft", "submitted", "returned", "approved"];
const CLOSED_SHOWN = 300;

async function loadClaims(profileId) {
  const byNewest = (q) => q.order("created_at", { ascending: false }).order("id");
  const [open, own, closed] = await Promise.all([
    fetchAllRows(() => byNewest(supabase.from("expense_claims").select("*").in("status", OPEN_CLAIM))),
    fetchAllRows(() => byNewest(supabase.from("expense_claims").select("*").eq("claimant_id", profileId))),
    byNewest(supabase.from("expense_claims").select("*").not("status", "in", `(${OPEN_CLAIM.join(",")})`)).range(0, CLOSED_SHOWN - 1),
  ]);
  const error = open.error || own.error || closed.error || null;
  const data = mergeById(open.data, own.data, closed.data)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return { data, error, closedCapped: (closed.data || []).length >= CLOSED_SHOWN };
}

export default function FinanceSection({ profile, chapters, showToast }) {
  const readAll = canReadAll(profile);
  const chapterReader = isChapterReader(profile);
  const seesBudgets = readAll || chapterReader;

  const [tab, setTab] = useState("mine");
  const [claims, setClaims] = useState([]);
  const [closedCapped, setClosedCapped] = useState(false);
  const [summary, setSummary] = useState([]);
  const [overview, setOverview] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [finHolder, setFinHolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  const [openId, setOpenId] = useState(null);
  const [mode, setMode] = useState("view");        // view | edit | approve | return | decline | markpaid
  const [detail, setDetail] = useState({ receipts: [], events: [] });
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(null);

  const today = todayLagos();

  const load = useCallback(async () => {
    setErr("");
    const jobs = [
      loadClaims(profile.id),
      supabase.from("nec_portfolios").select("profile_id").eq("portfolio", "FIN").maybeSingle(),
    ];
    if (profile.chapter_id) {
      jobs.push(supabase.from("programs").select("id,title,date,status,chapter_id")
        .eq("chapter_id", profile.chapter_id).in("status", ["Approved", "Live", "Complete"]).order("date", { ascending: false }));
    }
    if (seesBudgets) jobs.push(supabase.rpc("finance_programme_summary"));
    if (readAll) jobs.push(supabase.rpc("finance_overview"));
    const out = await Promise.all(jobs);
    let i = 0;
    const cl = out[i++];
    const fin = out[i++];
    const pr = profile.chapter_id ? out[i++] : { data: [] };
    const su = seesBudgets ? out[i++] : { data: [] };
    const ov = readAll ? out[i++] : { data: [] };
    if (cl.error) {
      setErr("Could not load finance. If this keeps happening, the Batch 32 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setClaims(cl.data || []);
    setClosedCapped(!!cl.closedCapped);
    setFinHolder(fin.data ? fin.data.profile_id : null);
    setProgrammes(pr.data || []);
    setSummary(su.data || []);
    setOverview(ov.data && ov.data[0] ? ov.data[0] : null);
    setLoading(false);
  }, [profile.id, profile.chapter_id, readAll, seesBudgets]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOpenId(null); setMode("view"); setComposing(false); setRevising(null); }, [tab]);

  const loadDetail = useCallback(async (id) => {
    const [rc, ev] = await Promise.all([
      supabase.from("expense_receipts").select("*").eq("claim_id", id).order("uploaded_at"),
      supabase.from("finance_events").select("*").eq("claim_id", id).order("id"),
    ]);
    setDetail({ receipts: rc.data || [], events: ev.data || [] });
  }, []);

  useEffect(() => { if (openId) loadDetail(openId); else setDetail({ receipts: [], events: [] }); }, [openId, loadDetail]);

  const progTitle = useMemo(() => {
    const m = {};
    for (const p of programmes) m[p.id] = p.title;
    for (const s of summary) m[s.programme_id] = s.title;
    return (id) => m[id] || "";
  }, [programmes, summary]);
  const chapterName = useMemo(() => {
    const m = Object.fromEntries((chapters || []).map((c) => [c.id, c.name]));
    return (id) => m[id] || "";
  }, [chapters]);
  const remainingFor = useCallback((claim) => {
    if (!claim.programme_id) return null;
    const row = summary.find((s) => s.programme_id === claim.programme_id);
    return row ? Number(row.remaining_kobo) : null;
  }, [summary]);

  const mine = useMemo(() => claims.filter((c) => c.claimant_id === profile.id), [claims, profile.id]);
  const others = useMemo(() => claims.filter((c) => c.claimant_id !== profile.id), [claims, profile.id]);
  const chapterClaims = useMemo(() => others.filter((c) => c.chapter_id && c.chapter_id === profile.chapter_id), [others, profile.chapter_id]);
  const waiting = useMemo(() => others.filter((c) => c.status === "submitted"), [others]);
  const toDecide = useMemo(() => waiting.filter((c) => canDecide(profile, c, finHolder)), [waiting, profile, finHolder]);
  const officer = isOfficer(profile, finHolder);

  const shown = useMemo(() => {
    if (filter === "all") return others;
    if (filter === "waiting") return others.filter((c) => c.status === "submitted");
    if (filter === "unpaid") return others.filter((c) => c.status === "approved");
    if (filter === "paid") return others.filter((c) => c.status === "paid");
    return others.filter((c) => ["returned", "rejected", "withdrawn", "draft"].includes(c.status));
  }, [others, filter]);

  async function run(fn, done) {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.error) throw r.error;
      if (done) showToast(done);
      await load();
      if (openId) await loadDetail(openId);
      return true;
    } catch (e) {
      showToast(humanise(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveClaim(fields, existing) {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("save_claim", { p_id: existing ? existing.id : null, ...fields });
      if (error) throw error;
      showToast(existing ? "Changes saved." : "Draft saved. Attach a receipt, then send it for approval.");
      setComposing(false);
      await load();
      setOpenId(data);
      setMode("edit");
    } catch (e) {
      showToast(humanise(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onAction(claim, act) {
    if (act === "submit") {
      if (!window.confirm("Send this claim for approval? You will not be able to edit it while it waits.")) return;
      const ok = await run(() => supabase.rpc("submit_claim", { p_claim: claim.id }), "Sent for approval. The Financial Secretary has been told.");
      if (ok) setMode("view");
      return;
    }
    if (act === "withdraw") {
      if (!window.confirm("Withdraw this claim? It will be closed and cannot be reopened.")) return;
      await run(() => supabase.rpc("withdraw_claim", { p_claim: claim.id }), "Claim withdrawn.");
      return;
    }
    setOpenId(claim.id);
    setMode(act === "markpaid" ? "markpaid" : act);
  }

  function toggle(claim) {
    if (openId === claim.id) { setOpenId(null); setMode("view"); } else { setOpenId(claim.id); setMode("view"); }
  }

  async function viewReceipt(r) {
    // Opened first so a phone's pop-up blocker sees a tap, then pointed at
    // the short-lived link once the store has made it.
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("finance-receipts").createSignedUrl(r.storage_path, 120);
    if (error || !data) { if (w) w.close(); return showToast(humanise(error || "Could not open that receipt."), "error"); }
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else { window.location.href = data.signedUrl; }
  }

  function renderPanel(claim) {
    const forEdit = mode === "edit" && actionsFor(profile, claim, finHolder).includes("edit");
    return (
      <div>
        {forEdit ? (
          <>
            <ClaimForm claim={claim} programmes={programmes} saving={saving}
              onSave={(f) => saveClaim(f, claim)} onCancel={() => setMode("view")} />
            <ReceiptsEditor claim={claim} receipts={detail.receipts} reload={async () => { await loadDetail(claim.id); }} showToast={showToast} />
            <div style={{ marginTop: 16 }}>
              <button type="button" onClick={() => onAction(claim, "submit")} style={btnP}>Send for approval</button>
              <span style={{ fontSize: 12, color: B.muted, marginLeft: 12 }}>Save any changes above first.</span>
            </div>
          </>
        ) : null}
        {!forEdit && (mode === "approve" || mode === "return" || mode === "decline") && canDecide(profile, claim, finHolder) ? (
          <div style={{ marginBottom: 14 }}>
            <DecisionBox decision={mode} claim={claim} remainingKobo={remainingFor(claim)} busy={busy}
              onCancel={() => setMode("view")}
              onConfirm={async (note) => {
                const p_decision = mode === "decline" ? "reject" : mode;
                const ok = await run(() => supabase.rpc("review_claim", { p_claim: claim.id, p_decision, p_note: note || null }),
                  mode === "approve" ? "Claim approved." : mode === "return" ? "Sent back to the claimant." : "Claim declined.");
                if (ok) setMode("view");
              }} />
          </div>
        ) : null}
        {!forEdit && mode === "markpaid" && canDecide(profile, claim, finHolder) ? (
          <div style={{ marginBottom: 14 }}>
            <PayBox claim={claim} busy={busy} onCancel={() => setMode("view")}
              onConfirm={async (ref, paidOn) => {
                const ok = await run(() => supabase.rpc("mark_claim_paid", { p_claim: claim.id, p_ref: ref, p_paid_on: paidOn }), "Payment recorded.");
                if (ok) setMode("view");
              }} />
          </div>
        ) : null}
        <ClaimFacts claim={claim} receipts={detail.receipts} events={detail.events} onViewReceipt={viewReceipt} programmeTitle={progTitle(claim.programme_id)} />
      </div>
    );
  }

  const renderClaims = (list, empty) => (
    list.length === 0 ? (
      <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>{empty}</p></Card>
    ) : list.map((c) => (
      <ClaimCard key={c.id} claim={c} profile={profile} finHolderId={finHolder} today={today}
        programmeTitle={progTitle(c.programme_id)} chapterName={c.claimant_id !== profile.id ? chapterName(c.chapter_id) : ""}
        open={openId === c.id} onAction={onAction} onToggle={toggle}>
        {openId === c.id ? renderPanel(c) : null}
      </ClaimCard>
    ))
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading finance…</div>;

  const t = totals(mine);
  const overdue = overview ? Number(overview.overdue_count) : 0;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Finance</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Claim back what you spent on YCDI work. Attach the receipt, send the claim up, and the Financial Secretary decides it, aiming to have every valid claim settled within thirty days. This page records money. It never moves it, and it never stores a bank account number.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      {overview ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <StatCard label="Approved budgets" value={formatNaira(overview.approved_kobo)} />
            <StatCard label="Paid out" value={formatNaira(overview.paid_kobo)} accent={B.green} />
            <StatCard label="Approved, unpaid" value={formatNaira(overview.committed_kobo)} accent={B.gold} />
            <StatCard label="Waiting for a decision" value={`${overview.waiting_count} · ${formatNaira(overview.pending_kobo)}`} accent={B.gold} />
          </div>
          {overdue > 0 ? (
            <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 14, fontSize: 13 }}>
              {overdue === 1 ? "1 claim is" : `${overdue} claims are`} past the thirty-day mark.
            </Card>
          ) : null}
        </>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTab("mine")} style={tabBtn(tab === "mine")}>My claims{mine.length ? ` (${mine.length})` : ""}</button>
        {readAll ? (
          <button type="button" onClick={() => setTab("all")} style={tabBtn(tab === "all")}>
            All claims{toDecide.length ? ` (${toDecide.length} to decide)` : waiting.length ? ` (${waiting.length} waiting)` : ""}
          </button>
        ) : null}
        {!readAll && chapterReader ? (
          <button type="button" onClick={() => setTab("chapter")} style={tabBtn(tab === "chapter")}>My chapter{chapterClaims.length ? ` (${chapterClaims.length})` : ""}</button>
        ) : null}
        {seesBudgets ? <button type="button" onClick={() => setTab("budgets")} style={tabBtn(tab === "budgets")}>Budgets</button> : null}
      </div>

      {tab === "mine" ? (
        <div>
          {!composing ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <button type="button" onClick={() => setComposing(true)} style={btnP}>Make a claim</button>
              {mine.length ? (
                <span style={{ fontSize: 12.5, color: B.muted }}>
                  Waiting {formatNaira(t.submitted)} · Approved, unpaid {formatNaira(t.approved)} · Paid {formatNaira(t.paid)}
                </span>
              ) : null}
            </div>
          ) : (
            <Card style={{ marginBottom: 14 }}>
              <SHead>New claim</SHead>
              <ClaimForm programmes={programmes} saving={saving} onSave={(f) => saveClaim(f, null)} onCancel={() => setComposing(false)} />
            </Card>
          )}
          {renderClaims(mine, "You have not made a claim yet.")}
        </div>
      ) : null}

      {tab === "all" && readAll ? (
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[["all", "Everything"], ["waiting", "Waiting"], ["unpaid", "Approved, unpaid"], ["paid", "Paid"], ["other", "Sent back or closed"]].map(([k, v]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={tabBtn(filter === k)}>{v}</button>
            ))}
          </div>
          {renderClaims(shown, "Nothing here.")}
          {closedCapped && (filter === "all" || filter === "paid" || filter === "other") ? (
            <p style={{ fontSize: 12, color: B.muted, margin: "10px 0 0", lineHeight: 1.6 }}>
              Every open claim is here. Closed claims (paid, declined or withdrawn) show the newest {CLOSED_SHOWN}; older ones are kept on record and are counted in the totals above.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "chapter" && !readAll ? (
        <div>
          <p style={{ fontSize: 12.5, color: B.muted, margin: "0 0 12px", lineHeight: 1.7 }}>Claims made by people in your chapter. You can read them; the Financial Secretary decides them.</p>
          {renderClaims(chapterClaims, "Nobody else in your chapter has made a claim.")}
        </div>
      ) : null}

      {tab === "budgets" && seesBudgets ? (
        <div>
          <p style={{ fontSize: 12.5, color: B.muted, margin: "0 0 12px", lineHeight: 1.7 }}>
            Each programme's budget is copied from its approved concept note and held here. Changing the concept note later does not change it. Only the Financial Secretary can revise it, with a reason.
          </p>
          {summary.length === 0 ? (
            <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>No approved programmes yet.</p></Card>
          ) : summary.map((row) => (
            <div key={row.programme_id}>
              {revising && revising.programme_id === row.programme_id ? (
                <ReviseBox row={row} busy={busy} onCancel={() => setRevising(null)}
                  onConfirm={async (kobo, reason) => {
                    const ok = await run(() => supabase.rpc("revise_programme_budget", { p_programme: row.programme_id, p_new_kobo: kobo, p_reason: reason }), "Budget revised.");
                    if (ok) setRevising(null);
                  }} />
              ) : null}
              <BudgetCard row={row} officer={officer} onRevise={setRevising} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
