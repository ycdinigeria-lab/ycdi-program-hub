import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchAllRows, mergeById } from "../lib/fetchAll.js";
import { humanise } from "../lib/errors.js";
import { B, inp, sel, ta, btnP, btnG, btnR } from "../theme.js";
import { Card, SHead, Field, StatCard } from "../components/ui.jsx";
import {
  METHODS, METHOD_LABEL, CAMPAIGNS, CAMPAIGN_LABEL, TIER_LABEL, EVENT_WORD,
  donorTier, canManageDonations, canReadDonations, validateDonation, yearOnYear,
  formatNaira, koboToInput, todayLagos,
} from "../lib/donations.js";

// BATCH34-MARKER donations-screen
//
// The gifts YCDI receives. Recorded by the Financial Secretary and the
// National Coordinator, read by the Deputy and the Treasurer. Every rule
// is enforced by the database (Batch 34); this screen only shows the
// buttons a person is allowed, using the same checks from lib/donations.js.

const TIER_TONE = {
  champion: ["#F0E8FA", B.purple || "#5B2D8E"],
  partner: [B.blueLight, B.blue],
  supporter: ["#E8F5EC", B.green],
  friend: [B.offWhite, B.muted],
  in_kind: ["#FFF7E6", B.gold],
};
const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const fmtStamp = (t) => (t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function Pill({ tone, children }) {
  const [bg, fg] = tone;
  return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "'Montserrat',sans-serif" }}>{children}</span>;
}
const tabBtn = (on) => ({
  background: on ? B.blue : B.white, color: on ? B.white : B.muted, border: "1px solid " + (on ? B.blue : B.border),
  borderRadius: 20, padding: "7px 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
});

// ---------------------------------------------------------------------------
// One gift, as a row.
// ---------------------------------------------------------------------------
export function DonationRow({ d, canManage, onCorrect, onAcknowledge, onVoid }) {
  const voided = d.status === "voided";
  return (
    <Card style={{ marginBottom: 8, padding: "12px 14px", opacity: voided ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, overflowWrap: "anywhere", textDecoration: voided ? "line-through" : "none" }}>{d.donor_name}</div>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.6 }}>
            {METHOD_LABEL[d.method] || d.method} · {fmtDate(d.received_on)}
            {d.reference ? " · " + d.reference : ""}
            {d.campaign ? " · " + (CAMPAIGN_LABEL[d.campaign] || d.campaign) : ""}
            {d.designation === "restricted" ? " · restricted: " + d.restricted_to : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: B.black }}>{formatNaira(d.amount_kobo)}</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
            {voided ? <Pill tone={[B.redLight, B.red]}>Voided</Pill> : d.acknowledged ? <Pill tone={["#E8F5EC", B.green]}>Acknowledged</Pill> : <Pill tone={["#FFF7E6", B.gold]}>Not acknowledged</Pill>}
          </div>
        </div>
      </div>
      {voided && d.void_reason ? <div style={{ marginTop: 8, fontSize: 12, color: B.red }}>Voided: {d.void_reason}</div> : null}
      {canManage && !voided ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" onClick={() => onCorrect(d)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Correct</button>
          {!d.acknowledged ? <button type="button" onClick={() => onAcknowledge(d)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5 }}>Mark acknowledged</button> : null}
          <button type="button" onClick={() => onVoid(d)} style={{ ...btnG, padding: "4px 10px", fontSize: 11.5, color: B.red, borderColor: B.red }}>Void</button>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recording or correcting a gift.
// ---------------------------------------------------------------------------
export function DonationForm({ donation, donors, saving, onSave, onCancel }) {
  const [f, setF] = useState(() => ({
    donor_name: donation ? donation.donor_name : "",
    donor_id: donation && donation.donor_id ? donation.donor_id : "",
    amount: donation ? koboToInput(donation.amount_kobo) : "",
    received_on: donation ? donation.received_on : todayLagos(),
    method: donation ? donation.method : "transfer",
    reference: donation && donation.reference ? donation.reference : "",
    designation: donation ? donation.designation : "general",
    restricted_to: donation && donation.restricted_to ? donation.restricted_to : "",
    campaign: donation && donation.campaign ? donation.campaign : "",
    note: donation && donation.note ? donation.note : "",
  }));
  const [problem, setProblem] = useState("");
  const set = (k, v) => setF((old) => ({ ...old, [k]: v }));

  function submit(e) {
    e.preventDefault();
    const r = validateDonation(f);
    if (!r.ok) return setProblem(r.error);
    setProblem("");
    onSave(r.values);
  }

  return (
    <form onSubmit={submit} noValidate>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 220px" }}>
          <Field label="Donor" required hint="Pick a donor from your contacts, or type the name (Anonymous is fine).">
            {donors && donors.length ? (
              <select style={sel} value={f.donor_id} onChange={(e) => {
                const id = e.target.value; const m = donors.find((x) => x.id === id);
                setF((old) => ({ ...old, donor_id: id, donor_name: m ? m.full_name : old.donor_name }));
              }}>
                <option value="">Type the name below</option>
                {donors.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
              </select>
            ) : null}
            <input style={{ ...inp, marginTop: donors && donors.length ? 8 : 0 }} value={f.donor_name} maxLength={160} onChange={(e) => set("donor_name", e.target.value)} placeholder="Donor name" />
          </Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Amount (naira)" required><input style={inp} inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" /></Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 150px" }}>
          <Field label="Date received" required><input style={inp} type="date" value={f.received_on} max={todayLagos()} onChange={(e) => set("received_on", e.target.value)} /></Field>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <Field label="Method" required><select style={sel} value={f.method} onChange={(e) => set("method", e.target.value)}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Reference" hint="Transfer or teller reference. Not an account number."><input style={inp} value={f.reference} maxLength={60} onChange={(e) => set("reference", e.target.value)} /></Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <Field label="Designation"><select style={sel} value={f.designation} onChange={(e) => set("designation", e.target.value)}><option value="general">General</option><option value="restricted">Restricted</option></select></Field>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <Field label="Campaign"><select style={sel} value={f.campaign} onChange={(e) => set("campaign", e.target.value)}><option value="">None</option>{CAMPAIGNS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
      </div>
      {f.designation === "restricted" ? (
        <Field label="Restricted to" required hint="What this gift may be spent on."><textarea style={{ ...ta, minHeight: 60 }} value={f.restricted_to} maxLength={300} onChange={(e) => set("restricted_to", e.target.value)} /></Field>
      ) : null}
      <Field label="Note"><textarea style={{ ...ta, minHeight: 60 }} value={f.note} maxLength={1000} onChange={(e) => set("note", e.target.value)} /></Field>
      {problem ? <p role="alert" style={{ color: B.red, fontSize: 13, margin: "0 0 12px" }}>{problem}</p> : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : donation ? "Save correction" : "Record gift"}</button>
        <button type="button" onClick={onCancel} style={btnG}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Giving by donor, with their tier.
// ---------------------------------------------------------------------------
export function DonorTable({ rows }) {
  if (!rows || rows.length === 0) return <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>No giving recorded for this year.</p></Card>;
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: B.offWhite, textAlign: "left" }}>
            <th style={{ padding: "10px 14px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: B.muted }}>Donor</th>
            <th style={{ padding: "10px 14px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: B.muted }}>Given</th>
            <th style={{ padding: "10px 14px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: B.muted }}>Gifts</th>
            <th style={{ padding: "10px 14px", fontFamily: "'Montserrat',sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: B.muted }}>Tier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={(r.donor_id || r.donor_name) + i} style={{ borderTop: "1px solid " + B.offWhite }}>
              <td style={{ padding: "10px 14px", overflowWrap: "anywhere" }}>{r.donor_name}{!r.acknowledged_all ? <span title="Not all gifts acknowledged" style={{ color: B.gold, marginLeft: 6 }}>●</span> : null}</td>
              <td style={{ padding: "10px 14px", fontWeight: 700 }}>{formatNaira(r.total_kobo)}</td>
              <td style={{ padding: "10px 14px", color: B.muted }}>{r.gifts}</td>
              <td style={{ padding: "10px 14px" }}>{r.tier ? <Pill tone={TIER_TONE[r.tier] || TIER_TONE.friend}>{TIER_LABEL[r.tier]}</Pill> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

// BATCH36-MARKER donations-complete
// Totals and donor tiers are worked out by the database, so the list here
// is history. It shows the newest few hundred gifts, and always every
// active gift that has not been thanked yet, however old, so the
// "not yet acknowledged" view can never quietly lose one.
const HISTORY_SHOWN = 500;

async function loadDonations() {
  const byNewest = (q) => q.order("received_on", { ascending: false }).order("id");
  const [recent, unthanked] = await Promise.all([
    byNewest(supabase.from("donations").select("*")).range(0, HISTORY_SHOWN - 1),
    fetchAllRows(() => byNewest(supabase.from("donations").select("*").eq("status", "active").eq("acknowledged", false))),
  ]);
  const error = recent.error || unthanked.error || null;
  const data = mergeById(recent.data, unthanked.data)
    .sort((a, b) => String(b.received_on || "").localeCompare(String(a.received_on || "")));
  return { data, error, capped: (recent.data || []).length >= HISTORY_SHOWN };
}

export default function DonationsSection({ profile, showToast }) {
  const canManage = canManageDonations(profile);
  const canRead = canReadDonations(profile);

  const [tab, setTab] = useState("gifts");
  const [donations, setDonations] = useState([]);
  const [historyCapped, setHistoryCapped] = useState(false);
  const [byDonor, setByDonor] = useState([]);
  const [overview, setOverview] = useState(null);
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const year = Number(todayLagos().slice(0, 4));

  const load = useCallback(async () => {
    setErr("");
    const jobs = [
      loadDonations(),
      supabase.rpc("donation_overview", { p_year: year }),
      supabase.rpc("donation_by_donor", { p_year: year }),
    ];
    if (canManage) jobs.push(supabase.from("audience_contacts").select("id,full_name").eq("category", "donor").order("full_name"));
    const out = await Promise.all(jobs);
    let i = 0;
    const dn = out[i++], ov = out[i++], bd = out[i++];
    const dr = canManage ? out[i++] : { data: [] };
    if (dn.error) {
      setErr("Could not load donations. If this keeps happening, the Batch 34 database script may not have been run yet.");
      setLoading(false); return;
    }
    setDonations(dn.data || []);
    setHistoryCapped(!!dn.capped);
    setOverview(ov.data && ov.data[0] ? ov.data[0] : null);
    setByDonor(bd.data || []);
    setDonors(dr.data || []);
    setLoading(false);
  }, [canManage, year]);

  useEffect(() => { load(); }, [load]);

  async function run(fn, done) {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.error) throw r.error;
      if (done) showToast(done);
      await load();
      return true;
    } catch (e) { showToast(humanise(e), "error"); return false; }
    finally { setBusy(false); }
  }

  async function save(values, existing) {
    setSaving(true);
    try {
      const rpc = existing ? "correct_donation" : "record_donation";
      const args = existing ? { p_id: existing.id, ...values } : values;
      const { error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      showToast(existing ? "Donation corrected." : "Donation recorded.");
      setComposing(false); setEditing(null);
      await load();
    } catch (e) { showToast(humanise(e), "error"); }
    finally { setSaving(false); }
  }

  function onVoid(d) {
    const why = window.prompt(`Void the ${formatNaira(d.amount_kobo)} gift from ${d.donor_name}? Say why:`, "");
    if (why === null) return;
    if (why.trim().length < 5) return showToast("A void needs a reason of at least five characters.", "error");
    run(() => supabase.rpc("void_donation", { p_id: d.id, p_reason: why.trim() }), "Donation voided.");
  }

  const shown = useMemo(() => {
    if (filter === "all") return donations;
    if (filter === "unacknowledged") return donations.filter((d) => d.status === "active" && !d.acknowledged);
    if (filter === "restricted") return donations.filter((d) => d.status === "active" && d.designation === "restricted");
    if (filter === "voided") return donations.filter((d) => d.status === "voided");
    return donations.filter((d) => d.status === "active");
  }, [donations, filter]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading donations…</div>;

  const yoy = overview ? yearOnYear(overview.total_kobo, overview.last_year_total_kobo) : null;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark || B.blue, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Donations</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          Every gift YCDI receives: who gave, when, how, and whether it was for anything in particular. Donors are partners in the mission, so their giving is recorded with care and kept confidential. This page records money received. It never moves money, and it never stores a bank account number.
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 16, fontSize: 13 }}>{err}</Card> : null}

      {overview ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <StatCard label={`Received in ${year}`} value={formatNaira(overview.total_kobo)} />
          <StatCard label="Donors this year" value={overview.donors} accent={B.green} />
          <StatCard label="Unrestricted" value={formatNaira(overview.unrestricted_kobo)} />
          <StatCard label="Not yet acknowledged" value={overview.unacknowledged} accent={Number(overview.unacknowledged) > 0 ? B.gold : B.muted} />
        </div>
      ) : null}
      {yoy !== null ? (
        <p style={{ margin: "-4px 0 14px", fontSize: 12.5, color: B.muted }}>
          {yoy >= 0 ? "Up" : "Down"} {Math.abs(yoy)}% on {year - 1} ({formatNaira(overview.last_year_total_kobo)}).
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTab("gifts")} style={tabBtn(tab === "gifts")}>Gifts</button>
        <button type="button" onClick={() => setTab("donors")} style={tabBtn(tab === "donors")}>By donor</button>
      </div>

      {tab === "gifts" ? (
        <div>
          {canManage && !composing && !editing ? <button type="button" onClick={() => setComposing(true)} style={{ ...btnP, marginBottom: 14 }}>Record a gift</button> : null}
          {composing ? (
            <Card style={{ marginBottom: 14 }}><SHead>New donation</SHead><DonationForm donors={donors} saving={saving} onSave={(v) => save(v, null)} onCancel={() => setComposing(false)} /></Card>
          ) : null}
          {editing ? (
            <Card style={{ marginBottom: 14 }}><SHead>Correct donation</SHead><DonationForm donation={editing} donors={donors} saving={saving} onSave={(v) => save(v, editing)} onCancel={() => setEditing(null)} /></Card>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[["all", "Everything"], ["active", "Active"], ["unacknowledged", "Not acknowledged"], ["restricted", "Restricted"], ["voided", "Voided"]].map(([k, v]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} style={tabBtn(filter === k)}>{v}</button>
            ))}
          </div>

          {shown.length === 0 ? (
            <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>No gifts here.</p></Card>
          ) : shown.map((d) => (
            <DonationRow key={d.id} d={d} canManage={canManage}
              onCorrect={(x) => { setEditing(x); setComposing(false); }}
              onAcknowledge={(x) => run(() => supabase.rpc("acknowledge_donation", { p_id: x.id }), "Marked acknowledged.")}
              onVoid={onVoid} />
          ))}
          {historyCapped && filter !== "unacknowledged" ? (
            <p style={{ fontSize: 12, color: B.muted, margin: "10px 0 0", lineHeight: 1.6 }}>
              Showing the newest {HISTORY_SHOWN} gifts, plus every gift still waiting for a thank-you. Older gifts are kept on record and are counted in the totals above.
            </p>
          ) : null}
        </div>
      ) : (
        <DonorTable rows={byDonor} />
      )}
    </div>
  );
}
