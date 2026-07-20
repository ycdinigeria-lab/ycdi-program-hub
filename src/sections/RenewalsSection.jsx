import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, btnP, btnG } from "../theme.js";
import { Card, SHead, StatCard } from "../components/ui.jsx";
import {
  sortRenewals,
  renewalState,
  RENEWAL_LABELS,
  daysToDeadline,
  renewalWarnings,
} from "../lib/screening.js";

// The annual safeguarding declaration renewal.
//
// BATCH7B-MARKER renewals-screen
//
// YCDI-SAF-005 section 3.5. Everybody active renews by 31 January, and
// failing to renew puts the person on inactive status until they do.
//
// Nothing here happens on a timer. The list is always visible, and the
// lapse is a button somebody presses after the deadline has gone, which
// is also how Batch 3 treats destroying records. A schedule that quietly
// changes somebody's status is a thing you install and then forget you
// installed, and the first anybody hears of it is a volunteer who cannot
// get into a school gate.

const TONE = { renewed: B.green, due: B.gold, overdue: B.red, unknown: B.muted };

export default function RenewalsSection({ profile, showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const today = useMemo(() => new Date(), []);

  useEffect(() => { load(); }, [year]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("declaration_renewals", { p_year: year });
    if (error) showToast(error.message, "error");
    setRows(sortRenewals(data || [], today));
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c = { renewed: 0, due: 0, overdue: 0 };
    rows.forEach((r) => {
      const s = renewalState(r, today);
      if (c[s] !== undefined) c[s] += 1;
    });
    return c;
  }, [rows, today]);

  const deadline = rows.length ? rows[0].deadline : `${year}-01-31`;
  const left = daysToDeadline(deadline, today);
  const isNC = profile && (profile.role === "NC" || profile.is_safeguarding_lead);

  async function applyLapses() {
    setBusy(true);
    const { data, error } = await supabase.rpc("apply_renewal_lapses", { p_year: year });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast(
      data === 0
        ? "Nobody needed to be moved. Everyone active has renewed."
        : `${data} ${data === 1 ? "person is" : "people are"} now inactive until they renew.`
    );
    load();
  }

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <SHead as="h2">Annual declaration renewal</SHead>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: B.black, lineHeight: 1.7 }}>
          Everyone serving renews their Safeguarding Declaration by 31 January, confirming they
          have nothing new to disclose, that they have done their refresher training, and that
          they still hold to the standards. YCDI-SAF-005 section 3.5.
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: left !== null && left < 0 ? B.red : B.muted, lineHeight: 1.65 }}>
          {left === null
            ? null
            : left > 0
            ? `The ${year} deadline is ${deadline}, ${left} ${left === 1 ? "day" : "days"} away.`
            : left === 0
            ? `The ${year} deadline is today.`
            : `The ${year} deadline passed ${Math.abs(left)} ${Math.abs(left) === 1 ? "day" : "days"} ago.`}
        </p>
      </Card>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Renewed" value={counts.renewed} accent={B.green} />
        <StatCard label="Still due" value={counts.due} accent={B.gold} />
        <StatCard label="Overdue" value={counts.overdue} accent={B.red} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <label htmlFor="renewal-year" style={{ fontSize: 12.5, color: B.muted, display: "block", marginBottom: 6 }}>
          Year
        </label>
        <select
          id="renewal-year"
          style={{ ...inp, appearance: "none", maxWidth: 200 }}
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
        >
          {[0, 1, 2].map((back) => {
            const y = new Date().getFullYear() - back;
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>
      </Card>

      {loading ? (
        <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>Loading…</p></Card>
      ) : rows.length === 0 ? (
        <Card><p style={{ margin: 0, fontSize: 13, color: B.muted }}>Nobody to show.</p></Card>
      ) : (
        rows.map((r) => {
          const state = renewalState(r, today);
          const warnings = renewalWarnings(r);
          return (
            <Card key={r.profile_id} style={{ marginBottom: 10, borderLeft: `3px solid ${TONE[state]}` }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 14.5, color: B.black }}>
                  {r.full_name}
                </strong>
                <span style={{ background: TONE[state] + "18", color: TONE[state], padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>
                  {RENEWAL_LABELS[state]}
                </span>
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
                {[r.role, r.chapter_name, r.volunteer_status].filter(Boolean).join(" · ")}
                {r.renewed_on ? ` · signed ${r.renewed_on}` : ""}
              </p>
              {warnings.map((w, i) => (
                <p key={i} style={{ margin: "7px 0 0", fontSize: 12.5, color: B.red, lineHeight: 1.6 }}>{w}</p>
              ))}
            </Card>
          );
        })
      )}

      {isNC ? (
        <Card style={{ marginTop: 14 }}>
          <SHead as="h3">Applying the lapse</SHead>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: B.muted, lineHeight: 1.7 }}>
            Section 3.5 says failure to renew by the deadline puts somebody on inactive status
            until the declaration is completed. This does that, for everybody still showing as
            active without a {year} declaration. It refuses to run before the deadline has
            passed. Signing the declaration afterwards brings the person back automatically, so
            nobody has to remember to reverse it by hand.
          </p>
          <button onClick={applyLapses} disabled={busy || counts.overdue === 0} style={{ ...btnP, opacity: busy || counts.overdue === 0 ? 0.5 : 1 }}>
            {busy ? "Working…" : `Move overdue people to inactive (${counts.overdue})`}
          </button>
        </Card>
      ) : null}
    </div>
  );
}
