import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";
import { srOnly } from "../lib/a11y.js";
import { ENTITIES, describeEntry, actionTone, formatWhen, formatStamp, groupByDay } from "../lib/audit.js";

// The audit log, read-only by definition.
//
// BATCH6B-MARKER audit-screen
//
// There is no delete button on this screen and there is no edit button,
// because there is nothing behind them: the table refuses both. That is
// the point of the feature rather than a missing convenience.
//
// Nothing here shows safeguarding content. The database does not store
// any, so the screen could not display it even if somebody asked it to.

const PAGE = 40;

export default function AuditLogSection({ profile, showToast }) {
  const [rows, setRows] = useState([]);
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const now = useMemo(() => new Date(), [rows]);

  useEffect(() => { setPage(0); load(0, entity, true); }, [entity]);

  async function load(pageIndex, ent, replace) {
    setLoading(true);
    let q = supabase
      .from("audit_log")
      .select("*")
      .order("occurred_at", { ascending: false })
      .range(pageIndex * PAGE, pageIndex * PAGE + PAGE);

    if (ent !== "all") q = q.eq("entity", ent);

    const { data, error } = await q;
    if (error) {
      setLoading(false);
      showToast(error.message, "error");
      return;
    }
    // One row over the page size is asked for, purely to find out whether
    // there is anything after this page, then dropped.
    const hasMore = (data || []).length > PAGE;
    const slice = hasMore ? data.slice(0, PAGE) : (data || []);
    setMore(hasMore);
    setRows(replace ? slice : (prev) => prev.concat(slice));
    setLoading(false);
  }

  function loadMore() {
    const next = page + 1;
    setPage(next);
    load(next, entity, false);
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      describeEntry(r).toLowerCase().includes(q)
      || (r.actor_name || "").toLowerCase().includes(q)
      || (r.subject_name || "").toLowerCase().includes(q)
      || (r.entity_id || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const days = useMemo(() => groupByDay(shown), [shown]);

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
        Every change to somebody's access, every safeguarding movement, every KPI target edit,
        and every volunteer status change, in the order they happened. Entries cannot be edited
        or deleted by anyone, including whoever made them.
      </p>

      <Card style={{ marginBottom: 14, background: B.blueLight, border: "1px solid " + B.blue }}>
        <p style={{ margin: 0, fontSize: 12.5, color: B.black, lineHeight: 1.65 }}>
          Safeguarding entries record that an incident moved and who moved it. They never
          record what the incident says. If you need the case itself, it is in Safeguarding,
          where access follows YCDI-SAF-004.
        </p>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Field label="Search the log">
          <input
            style={inp}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="A name, or an incident reference"
          />
        </Field>
        <div role="group" aria-label="Filter by kind of change" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {[{ key: "all", label: "Everything" }, ...ENTITIES].map((e) => {
            const on = entity === e.key;
            return (
              <button
                key={e.key}
                onClick={() => setEntity(e.key)}
                aria-pressed={on}
                style={{
                  background: on ? B.blue : B.white,
                  color: on ? B.white : B.muted,
                  border: `1px solid ${on ? B.blue : B.border}`,
                  borderRadius: 20, padding: "5px 13px", fontSize: 12,
                  fontWeight: on ? 700 : 400, cursor: "pointer",
                  fontFamily: "'Open Sans',sans-serif",
                }}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      </Card>

      {loading && !rows.length ? (
        <div role="status" aria-live="polite" style={{ padding: "36px 0", textAlign: "center", color: B.muted, fontSize: 13 }}>
          Loading the log…
        </div>
      ) : !shown.length ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
            Nothing recorded yet under this filter. The log starts from the day Batch 6b was
            installed, so anything that happened before then is not here and cannot be.
          </p>
        </Card>
      ) : (
        <>
          <div aria-live="polite" style={srOnly}>{shown.length} entries shown.</div>
          {days.map((d) => (
            <section key={d.day} style={{ marginBottom: 20 }}>
              <SHead as="h3">{d.label}</SHead>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {d.rows.map((r) => {
                  const alert = actionTone(r) === "alert";
                  return (
                    <li key={r.id}>
                      <div style={{
                        background: B.white,
                        border: "1px solid " + (alert ? B.red + "44" : B.border),
                        borderLeft: "3px solid " + (alert ? B.red : B.blue),
                        borderRadius: 8,
                        padding: "11px 14px",
                      }}>
                        <div style={{ fontSize: 13, color: B.black, lineHeight: 1.6 }}>
                          {describeEntry(r)}
                        </div>
                        <div style={{ fontSize: 11.5, color: B.muted, marginTop: 5 }}>
                          <time dateTime={r.occurred_at} title={formatStamp(r.occurred_at)}>
                            {formatWhen(r.occurred_at, now)}
                          </time>
                          {" · "}{formatStamp(r.occurred_at)}
                          {r.actor_role ? " · " + r.actor_role : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {more ? (
            <button onClick={loadMore} disabled={loading} style={{ ...btnG, width: "100%" }}>
              {loading ? "Loading…" : "Load earlier entries"}
            </button>
          ) : (
            <p style={{ fontSize: 12, color: B.muted, textAlign: "center", margin: "6px 0 0" }}>
              That is the whole log.
            </p>
          )}
        </>
      )}
    </div>
  );
}
