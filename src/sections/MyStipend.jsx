import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";
import { Card, SHead } from "../components/ui.jsx";
import { formatNaira, monthLabel, dateToMonth, spanLabel } from "../lib/stipends.js";

// BATCH39-MARKER my-stipend
//
// A person on the stipend list sees their own stipend here, inside
// Finance, which every member already has. Row security returns only
// their own entry and payments, so this asks for "everything" and gets
// theirs. Anyone not on the list gets nothing and this draws nothing.

const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export function MyStipendCard({ entry, payments }) {
  if (!entry) return null;
  const live = (payments || []).filter((p) => p.status === "paid");
  return (
    <Card style={{ marginBottom: 16 }}>
      <SHead>Your stipend</SHead>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 18 }}>{formatNaira(entry.monthly_kobo)}</span>
        <span style={{ fontSize: 12.5, color: B.muted }}>a month · {entry.role_label} · {spanLabel(entry.start_month, entry.end_month)}</span>
      </div>
      {live.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: B.muted }}>No payment has been recorded yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {live.slice(0, 6).map((p) => (
            <li key={p.id} style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid " + B.offWhite, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600 }}>{monthLabel(dateToMonth(p.month))}</span>
              <span style={{ color: B.muted }}>{formatNaira(p.amount_kobo)} · paid {fmtDay(p.paid_on)} · ref {p.payment_ref}</span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: B.muted, lineHeight: 1.6 }}>
        If a month you were paid for is missing, or something here looks wrong, speak to the Financial Secretary.
      </p>
    </Card>
  );
}

export default function MyStipend({ profile }) {
  const [entry, setEntry] = useState(null);
  const [payments, setPayments] = useState([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const [e, p] = await Promise.all([
        supabase.from("stipend_recipients").select("*").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("stipend_payments").select("id,month,amount_kobo,paid_on,payment_ref,status")
          .eq("profile_id", profile.id).order("month", { ascending: false }).limit(24),
      ]);
      // Before Batch 39 is run the tables do not exist; stay quiet.
      if (!live || e.error || !e.data) return;
      setEntry(e.data);
      setPayments(p.data || []);
    })();
    return () => { live = false; };
  }, [profile.id]);
  return <MyStipendCard entry={entry} payments={payments} />;
}
