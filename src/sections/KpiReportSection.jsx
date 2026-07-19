import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, btnP, btnG } from "../theme.js";
import { Card, SHead } from "../components/ui.jsx";
import { useIsMobile } from "../useIsMobile.js";
import {
  QUARTERS, quarterRange, ytdRange, quarterOfDate, buildBoardRows, splitRows,
  formatValue, formatVariance, statusOf, STATUS_COLOURS, TARGETABLE,
  buildBoardCsvRows, buildChapterCsvRows, toCsv, downloadCsv, csvFilename,
  yearOptions, numOrNull,
} from "../lib/kpi.js";

// The funder and Board KPI report.
//
// BATCH5-MARKER kpi-screen
//
// Three things live here: the Board table from YCDI-PROG-003 Template 2,
// the same figures split by chapter so the National Coordinator can see
// which chapter is carrying the national line, and the targets the whole
// thing is measured against.
//
// The screen deliberately does not hide the KPIs the hub cannot compute.
// A Board table that quietly drops the rows it has no data for looks like
// a complete report, and it is not one.

function StatusPill({ status }) {
  if (!status) return null;
  const c = STATUS_COLOURS[status] || { bg: B.offWhite, text: B.muted };
  return (
    <span style={{
      background: c.bg, color: c.text, padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif",
      whiteSpace: "nowrap", display: "inline-block",
    }}>{status}</span>
  );
}

function Note({ children }) {
  return (
    <p style={{ margin: "5px 0 0", fontSize: 11.5, color: B.muted, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------
// The Board table
// ---------------------------------------------------------------
function BoardRowsDesktop({ rows }) {
  const { kpis, secondary } = splitRows(rows);
  const th = {
    textAlign: "left", padding: "9px 10px", fontSize: 11,
    fontFamily: "'Montserrat',sans-serif", fontWeight: 700,
    color: B.muted, borderBottom: `2px solid ${B.border}`, whiteSpace: "nowrap",
  };
  const td = {
    padding: "11px 10px", fontSize: 12.5, borderBottom: `1px solid ${B.border}`,
    verticalAlign: "top",
  };
  const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
        <thead>
          <tr>
            <th style={th}>KPI</th>
            <th style={{ ...th, textAlign: "right" }}>Q Target</th>
            <th style={{ ...th, textAlign: "right" }}>Q Actual</th>
            <th style={{ ...th, textAlign: "right" }}>YTD Target</th>
            <th style={{ ...th, textAlign: "right" }}>YTD Actual</th>
            <th style={{ ...th, textAlign: "right" }}>Variance</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {kpis.map((r) => (
            <tr key={r.kpi_key}>
              <td style={{ ...td, maxWidth: 300 }}>
                <div style={{ fontWeight: 600, color: B.black }}>{r.label}</div>
                <Note>{r.note}</Note>
              </td>
              <td style={num}>{formatValue(r.qTarget, r.unit)}</td>
              <td style={num}>{formatValue(r.qActual, r.unit)}</td>
              <td style={num}>{formatValue(r.ytdTarget, r.unit)}</td>
              <td style={{ ...num, fontWeight: 700 }}>{formatValue(r.ytdActual, r.unit)}</td>
              <td style={num}>{formatVariance(r.variance, r.unit)}</td>
              <td style={td}><StatusPill status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {secondary.length ? (
        <div style={{ marginTop: 26 }}>
          <SHead color={B.muted}>Supporting figures, not KPI lines</SHead>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th}>Figure</th>
                <th style={{ ...th, textAlign: "right" }}>This quarter</th>
                <th style={{ ...th, textAlign: "right" }}>Year to date</th>
              </tr>
            </thead>
            <tbody>
              {secondary.map((r) => (
                <tr key={r.kpi_key}>
                  <td style={{ ...td, maxWidth: 380 }}>
                    <div style={{ fontWeight: 600, color: B.black }}>{r.label}</div>
                    <Note>{r.note}</Note>
                  </td>
                  <td style={num}>{formatValue(r.qActual, r.unit)}</td>
                  <td style={num}>{formatValue(r.ytdActual, r.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function BoardRowsMobile({ rows }) {
  const { kpis, secondary } = splitRows(rows);
  const cell = { fontSize: 12, color: B.muted };
  const val = { fontSize: 13, fontWeight: 700, color: B.black };

  const Block = ({ r, showTargets }) => (
    <div style={{
      border: `1px solid ${B.border}`, borderRadius: 10, padding: "13px 14px",
      marginBottom: 10, background: B.white,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: B.black }}>
          {r.label}
        </div>
        {showTargets ? <StatusPill status={r.status} /> : null}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: showTargets ? "1fr 1fr" : "1fr 1fr",
        gap: "9px 14px", marginTop: 11,
      }}>
        {showTargets ? (
          <>
            <div><div style={cell}>Q target</div><div style={val}>{formatValue(r.qTarget, r.unit)}</div></div>
            <div><div style={cell}>Q actual</div><div style={val}>{formatValue(r.qActual, r.unit)}</div></div>
            <div><div style={cell}>YTD target</div><div style={val}>{formatValue(r.ytdTarget, r.unit)}</div></div>
            <div><div style={cell}>YTD actual</div><div style={val}>{formatValue(r.ytdActual, r.unit)}</div></div>
            <div><div style={cell}>Variance</div><div style={val}>{formatVariance(r.variance, r.unit)}</div></div>
          </>
        ) : (
          <>
            <div><div style={cell}>This quarter</div><div style={val}>{formatValue(r.qActual, r.unit)}</div></div>
            <div><div style={cell}>Year to date</div><div style={val}>{formatValue(r.ytdActual, r.unit)}</div></div>
          </>
        )}
      </div>
      <Note>{r.note}</Note>
    </div>
  );

  return (
    <div>
      {kpis.map((r) => <Block key={r.kpi_key} r={r} showTargets />)}
      {secondary.length ? (
        <div style={{ marginTop: 20 }}>
          <SHead color={B.muted}>Supporting figures, not KPI lines</SHead>
          {secondary.map((r) => <Block key={r.kpi_key} r={r} showTargets={false} />)}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------
// Chapter breakdown
// ---------------------------------------------------------------
function ChapterTable({ rows }) {
  const th = {
    textAlign: "right", padding: "9px 8px", fontSize: 10.5,
    fontFamily: "'Montserrat',sans-serif", fontWeight: 700, color: B.muted,
    borderBottom: `2px solid ${B.border}`, whiteSpace: "nowrap",
  };
  const td = { padding: "10px 8px", fontSize: 12.5, textAlign: "right", borderBottom: `1px solid ${B.border}` };

  if (!rows.length) {
    return <p style={{ fontSize: 13, color: B.muted }}>No chapter figures for this period.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Chapter</th>
            <th style={th}>Activities</th>
            <th style={th}>Schools</th>
            <th style={th}>Beneficiaries</th>
            <th style={th}>Attendance</th>
            <th style={th}>Satisfaction</th>
            <th style={th}>Budget</th>
            <th style={th}>Spent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.chapter_id}>
              <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{c.chapter_name}</td>
              <td style={td}>{(c.activities ?? 0).toLocaleString()}</td>
              <td style={td}>{(c.schools ?? 0).toLocaleString()}</td>
              <td style={{ ...td, fontWeight: 700 }}>{(c.beneficiaries ?? 0).toLocaleString()}</td>
              <td style={{ ...td, color: B.muted }}>{(c.attendance_headcount ?? 0).toLocaleString()}</td>
              <td style={td}>{c.satisfaction_pct === null || c.satisfaction_pct === undefined ? "—" : `${c.satisfaction_pct}%`}</td>
              <td style={td}>{Number(c.budget ?? 0).toLocaleString()}</td>
              <td style={td}>{Number(c.spent ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>
        Beneficiaries counts people, once each, however many programmes they came to.
        Attendance counts seats and is always the larger of the two. They are different
        things and only the first belongs in a funder report.
      </Note>
    </div>
  );
}

// ---------------------------------------------------------------
// Targets
// ---------------------------------------------------------------
function TargetsEditor({ year, targets, canEdit, onSaved, showToast }) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = {};
    TARGETABLE.forEach((k) => {
      const t = (targets || []).find((x) => x.kpi_key === k.key) || {};
      d[k.key] = {
        baseline: t.baseline ?? "",
        annual_target: t.annual_target ?? "",
        q1_target: t.q1_target ?? "",
        q2_target: t.q2_target ?? "",
        q3_target: t.q3_target ?? "",
        q4_target: t.q4_target ?? "",
      };
    });
    setDraft(d);
  }, [targets, year]);

  function set(key, field, value) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));
  }

  async function save() {
    setSaving(true);
    const rows = TARGETABLE.map((k) => {
      const d = draft[k.key] || {};
      return {
        financial_year: Number(year),
        kpi_key: k.key,
        baseline: numOrNull(d.baseline),
        annual_target: numOrNull(d.annual_target),
        q1_target: numOrNull(d.q1_target),
        q2_target: numOrNull(d.q2_target),
        q3_target: numOrNull(d.q3_target),
        q4_target: numOrNull(d.q4_target),
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase
      .from("kpi_targets")
      .upsert(rows, { onConflict: "financial_year,kpi_key" });
    setSaving(false);
    if (error) {
      showToast?.(`Could not save targets: ${error.message}`, "error");
      return;
    }
    showToast?.(`Targets saved for ${year}.`, "success");
    onSaved?.();
  }

  const small = { ...inp, padding: "6px 8px", fontSize: 12, textAlign: "right" };
  const th = {
    textAlign: "right", padding: "8px", fontSize: 10.5, color: B.muted,
    fontFamily: "'Montserrat',sans-serif", fontWeight: 700,
    borderBottom: `2px solid ${B.border}`, whiteSpace: "nowrap",
  };
  const td = { padding: "7px 8px", borderBottom: `1px solid ${B.border}` };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: B.muted, lineHeight: 1.6, marginTop: 0 }}>
        Targets come from the Board-approved work plan, not from the system. YCDI-PROG-002
        sets most of them as an increase on last year, and the hub has no way of knowing
        what last year was, so they are entered here once at the start of the financial year.
        The four the policy states outright are already filled in. Leave a box empty rather
        than guessing at it. An empty cell in a Board paper is honest. A made-up one is not.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>KPI</th>
              <th style={th}>Baseline</th>
              <th style={th}>Annual</th>
              <th style={th}>Q1</th>
              <th style={th}>Q2</th>
              <th style={th}>Q3</th>
              <th style={th}>Q4</th>
            </tr>
          </thead>
          <tbody>
            {TARGETABLE.map((k) => {
              const d = draft[k.key] || {};
              return (
                <tr key={k.key}>
                  <td style={{ ...td, fontSize: 12.5, fontWeight: 600, minWidth: 190 }}>
                    {k.label}
                    {k.unit === "percent" ? (
                      <span style={{ color: B.muted, fontWeight: 400 }}> (%)</span>
                    ) : null}
                  </td>
                  {["baseline", "annual_target", "q1_target", "q2_target", "q3_target", "q4_target"].map((f) => (
                    <td style={td} key={f}>
                      <input
                        style={{ ...small, width: 72, opacity: canEdit ? 1 : 0.6 }}
                        value={d[f] ?? ""}
                        disabled={!canEdit}
                        inputMode="decimal"
                        onChange={(e) => set(k.key, f, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <button style={{ ...btnP, marginTop: 16 }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : `Save targets for ${year}`}
        </button>
      ) : (
        <p style={{ fontSize: 12.5, color: B.muted, marginTop: 14 }}>
          Targets are set nationally by the National Coordinator, so these are read-only for you.
          You can still see what your chapter is being measured against.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// The screen
// ---------------------------------------------------------------
export default function KpiReportSection({ profile, showToast }) {
  const isMobile = useIsMobile();
  const today = new Date().toISOString().slice(0, 10);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [quarter, setQuarter] = useState(quarterOfDate(today) || 1);
  const [tab, setTab] = useState("board");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [snapQ, setSnapQ] = useState([]);
  const [snapY, setSnapY] = useState([]);
  const [targets, setTargets] = useState([]);
  const [chapters, setChapters] = useState([]);

  const canEditTargets = profile?.role === "NC" || !!profile?.is_admin;
  const qr = quarterRange(year, quarter);
  const yr = ytdRange(year, quarter);
  const qSpec = QUARTERS.find((q) => q.id === Number(quarter));

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const a = quarterRange(year, quarter);
    const b = ytdRange(year, quarter);
    // Four separate calls rather than one joined query. A joined Supabase
    // query across these was silently emptied by row security earlier in
    // this project, and separate calls are both clearer and safer.
    const [rq, ry, rt, rc] = await Promise.all([
      supabase.rpc("kpi_snapshot", { p_from: a.from, p_to: a.to }),
      supabase.rpc("kpi_snapshot", { p_from: b.from, p_to: b.to }),
      supabase.from("kpi_targets").select("*").eq("financial_year", year),
      supabase.rpc("kpi_chapter_breakdown", { p_from: b.from, p_to: b.to }),
    ]);
    const bad = [rq, ry, rt, rc].find((r) => r.error);
    if (bad) {
      setErr(bad.error.message || "Could not load the KPI figures.");
      setLoading(false);
      return;
    }
    setSnapQ(rq.data || []);
    setSnapY(ry.data || []);
    setTargets(rt.data || []);
    setChapters(rc.data || []);
    setLoading(false);
  }, [year, quarter]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(
    () => buildBoardRows(snapQ, snapY, targets, quarter),
    [snapQ, snapY, targets, quarter]
  );

  const scope = profile?.role === "NC" || profile?.is_admin
    ? "All chapters"
    : "Limited to what your account is permitted to see";

  function exportBoard() {
    const meta = {
      year, quarter, months: qSpec ? qSpec.months : "",
      qFrom: qr.from, qTo: qr.to, yFrom: yr.from, yTo: yr.to,
      scope, preparedBy: profile?.full_name || "",
      generatedOn: new Date().toLocaleString(),
    };
    downloadCsv(csvFilename(year, quarter, "Board"), toCsv(buildBoardCsvRows(rows, meta)));
  }

  function exportChapters() {
    downloadCsv(csvFilename(year, quarter, "Chapters"), toCsv(buildChapterCsvRows(chapters)));
  }

  const TabBtn = ({ id, children }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        background: tab === id ? B.blue : "none",
        color: tab === id ? B.white : B.muted,
        border: tab === id ? "none" : `1px solid ${B.border}`,
        borderRadius: 6, padding: "8px 15px", fontSize: 12.5, fontWeight: 700,
        fontFamily: "'Montserrat',sans-serif", cursor: "pointer",
      }}
    >{children}</button>
  );

  return (
    <div>
      <Card>
        <SHead color={B.blue}>Board and funder KPI report</SHead>
        <p style={{ fontSize: 12.5, color: B.muted, lineHeight: 1.6, marginTop: 0 }}>
          Section A of the Quarterly NEC Report to Board, YCDI-PROG-003 Template 2, filled in
          from what the hub actually holds. Three of the ten KPIs are marked not captured
          rather than estimated. Nothing on this page is a guess.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: B.muted, marginBottom: 4 }}>Financial year</div>
            <select style={{ ...sel, width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: B.muted, marginBottom: 4 }}>Quarter</div>
            <select style={{ ...sel, width: 170 }} value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {QUARTERS.map((q) => (
                <option key={q.id} value={q.id}>{q.label} ({q.months})</option>
              ))}
            </select>
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: B.muted, marginTop: 12, marginBottom: 0 }}>
          Quarter covers {qr.from} to {qr.to}. Year to date covers {yr.from} to {yr.to}. Scope: {scope.toLowerCase()}.
        </p>
      </Card>

      <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
        <TabBtn id="board">Board report</TabBtn>
        <TabBtn id="chapters">By chapter</TabBtn>
        <TabBtn id="targets">Targets</TabBtn>
      </div>

      {err ? (
        <Card>
          <p style={{ color: B.red, fontSize: 13, margin: 0 }}>{err}</p>
          <p style={{ fontSize: 12, color: B.muted, marginBottom: 0 }}>
            If this says the function does not exist, the Batch 5 SQL has not been run yet.
          </p>
        </Card>
      ) : loading ? (
        <Card><p style={{ color: B.muted, fontSize: 13, margin: 0 }}>Working out the figures…</p></Card>
      ) : (
        <Card>
          {tab === "board" ? (
            <>
              {isMobile ? <BoardRowsMobile rows={rows} /> : <BoardRowsDesktop rows={rows} />}
              <button style={{ ...btnG, marginTop: 18 }} onClick={exportBoard}>
                Download the Board table (CSV)
              </button>
            </>
          ) : null}

          {tab === "chapters" ? (
            <>
              <ChapterTable rows={chapters} />
              <button style={{ ...btnG, marginTop: 18 }} onClick={exportChapters}>
                Download the chapter breakdown (CSV)
              </button>
            </>
          ) : null}

          {tab === "targets" ? (
            <TargetsEditor
              year={year}
              targets={targets}
              canEdit={canEditTargets}
              onSaved={load}
              showToast={showToast}
            />
          ) : null}
        </Card>
      )}
    </div>
  );
}
