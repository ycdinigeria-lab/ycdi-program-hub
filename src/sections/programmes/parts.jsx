import { useState, useMemo, useId } from "react";
import { B } from "../../theme.js";
import { srOnly } from "../../lib/a11y.js";
import { Avatar, Badge, Button, Card, EmptyState, MiniBar, Skeleton, SkeletonCard, SkeletonRegion } from "../../components/ui.jsx";
import { ShowMore } from "../../components/ShowMore.jsx";
import Icon from "../../components/Icon.jsx";
import { usePaged } from "../../lib/paging.js";
import { countByGroup, filterPrograms, visibleGroups, shortDate, plural, readinessTotals } from "../../lib/programmeView.js";

// BATCH41-MARKER programme-parts
//
// The pieces the programme screens are assembled from. They are all
// presentation: they are handed data and callbacks and decide only how to
// show them, so the rules about who may do what stay in the screens and the
// database where they always lived.

// A figure with a label. Neutral by design, so a row of them does not shout.
// Given an onClick it becomes a real button that filters the list below it.
export function Metric({ label, value, accent, onClick, selected }) {
  const inner = (
    <>
      <span className="hub-metric-value">{value}</span>
      <span className="hub-metric-label">
        {accent ? <span aria-hidden="true" className="hub-dot" style={{ background: accent }} /> : null}
        {label}
      </span>
    </>
  );
  if (!onClick) return <div className="hub-metric">{inner}</div>;
  return (
    <button type="button" className="hub-metric" onClick={onClick} aria-pressed={!!selected}>
      {inner}
    </button>
  );
}

// The panel at the top of a dashboard: what is waiting on this person, or a
// calm "all caught up" when nothing is. Each item is
// { id, title, sub, note, actionLabel, onAct }.
export function AttentionPanel({ tone = "attention", heading, items, caughtUp }) {
  if (!items || items.length === 0) {
    return (
      <Card variant="surface" className="hub-attn">
        <div className="hub-caught">
          <span className="hub-caught-icon"><Icon name="circleCheck" size={22} /></span>
          <div>
            <h3 className="hub-section-title" style={{ margin: 0 }}>{caughtUp.title}</h3>
            <p className="hub-attn-sub">{caughtUp.text}</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card variant={tone === "notice" ? "notice" : "attention"} className="hub-attn">
      <div className="hub-attn-head">
        <Icon name="alert" size={20} style={{ color: tone === "notice" ? B.gold : B.red }} />
        <h3 className="hub-section-title">{heading}</h3>
      </div>
      {items.map((it) => (
        <div className="hub-attn-item" key={it.id}>
          <div style={{ minWidth: 0 }}>
            <p className="hub-attn-title">{it.title}</p>
            {it.sub ? <p className="hub-attn-sub">{it.sub}</p> : null}
            {it.note ? <p className="hub-attn-note">&ldquo;{it.note}&rdquo;</p> : null}
          </div>
          <Button variant="secondary" size="sm" iconRight="arrowRight" onClick={it.onAct} aria-label={it.actionLabel + ": " + it.title}>
            {it.actionLabel}
          </Button>
        </div>
      ))}
    </Card>
  );
}

// One programme in a list. The title is the real button; a stretched
// pseudo-element makes the whole card clickable for a mouse or a thumb
// without nesting buttons or adding a second tab stop. An optional `action`
// (such as Log report) sits above that layer so it stays separately usable.
export function ProgrammeCard({ p, onView, action }) {
  const budget = Number(p.budget) || 0;
  const students = Number(p.students) || 0;
  const sub = [p.chapter_name ? p.chapter_name + " Chapter" : "", p.type].filter(Boolean).join(" · ");
  return (
    <Card variant="surface" interactive className="hub-prog">
      <div className="hub-prog-top">
        <div style={{ minWidth: 0 }}>
          <h3 className="hub-prog-title">
            <button type="button" className="hub-prog-link" onClick={() => onView(p)}>{p.title}</button>
          </h3>
          {sub ? <div className="hub-prog-sub">{sub}</div> : null}
        </div>
        <Badge status={p.status} />
      </div>
      <div className="hub-prog-meta">
        {p.date ? <span><Icon name="calendar" size={15} />{shortDate(p.date)}</span> : null}
        <span><Icon name="users" size={15} />{students.toLocaleString()} {plural(students, "student")}</span>
        {budget > 0 ? <span>NGN {budget.toLocaleString()}</span> : null}
        {p.school ? <span><Icon name="mapPin" size={15} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.school}</span></span> : null}
      </div>
      <div className="hub-prog-foot">
        {action ? <span className="hub-prog-action">{action}</span> : null}
        <span className="hub-prog-view" aria-hidden="true">View programme <Icon name="chevronRight" size={16} /></span>
      </div>
    </Card>
  );
}

// Search, status chips and the list itself, with a proper empty state for
// "nothing yet" and a different one for "nothing matches". The status filter
// is controlled by the caller so a dashboard's figures can drive it.
// Searching runs over everything loaded; only the first screenful is drawn
// until "show more" is pressed.
export function ProgrammeList({ programs, status, onStatus, onView, renderAction, emptyState, label = "programmes" }) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const counts = useMemo(() => countByGroup(programs), [programs]);
  const groups = visibleGroups(counts, status);
  const filtered = useMemo(() => filterPrograms(programs, { query, status }), [programs, query, status]);
  const paged = usePaged(filtered, query + "|" + status + "|" + programs.length);
  const narrowed = query.trim() !== "" || status !== "all";

  function clear() { setQuery(""); onStatus("all"); }

  if (programs.length === 0) return emptyState;

  return (
    <div>
      <div className="hub-toolbar">
        <div className="hub-search">
          <label htmlFor={searchId} style={srOnly}>Search {label}</label>
          <span className="hub-search-icon"><Icon name="search" size={17} /></span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, chapter or type"
            autoComplete="off"
          />
        </div>
        <div className="hub-chips" role="group" aria-label="Filter by status">
          {groups.map((g) => (
            <button key={g.key} type="button" className="hub-chip" aria-pressed={status === g.key} onClick={() => onStatus(g.key)}>
              {g.label}
              <span className="hub-chip-count">{counts[g.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="hub-results" role="status" aria-live="polite">
        {narrowed ? `${filtered.length} of ${programs.length} ${label}` : `${programs.length} ${plural(programs.length, label.replace(/s$/, ""), label)}`}
      </p>

      {filtered.length === 0 ? (
        <Card variant="surface">
          <EmptyState
            icon="search"
            title="No programmes found"
            text="Try changing your search or filters."
            action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="hub-list">
            {paged.visible.map((p) => (
              <ProgrammeCard key={p.id} p={p} onView={onView} action={renderAction ? renderAction(p) : null} />
            ))}
          </div>
          <ShowMore paged={paged} noun="more programmes" />
        </>
      )}
    </div>
  );
}

// A strip of the four or five facts someone needs before reading anything
// else. Each is { label, value }; a missing value shows as "Not given".
export function FactsStrip({ facts }) {
  return (
    <dl className="hub-facts" style={{ margin: 0 }}>
      {facts.map((f) => {
        const empty = f.value === undefined || f.value === null || f.value === "";
        return (
          <div className="hub-fact" key={f.label}>
            <dt className="hub-eyebrow">{f.label}</dt>
            <dd className={"hub-fact-value" + (empty ? " hub-fact-value--empty" : "")} style={{ margin: 0 }}>{empty ? "Not given" : f.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// Names as small chips instead of one comma-separated line.
export function PeopleList({ names, emptyText }) {
  if (!names || names.length === 0) return <p className="hub-prose hub-muted">{emptyText}</p>;
  return (
    <ul className="hub-people">
      {names.map((n, i) => (
        <li className="hub-person" key={n + i}>
          <Avatar name={n} size={24} decorative />
          {n}
        </li>
      ))}
    </ul>
  );
}

// The three checks, with a count and an honest note about what they are.
// A tick and an alert are different shapes, and every row also says in
// words what was found, so colour is never the only signal.
export function ReadinessChecklist({ checks }) {
  const { done, total } = readinessTotals(checks);
  return (
    <Card variant="surface">
      <h3 className="hub-section-title">Programme readiness</h3>
      {checks.map((c) => (
        <div className="hub-check" key={c.name}>
          <span className="hub-check-badge" style={{ background: c.ok ? c.color + "1f" : B.redLight, color: c.ok ? c.color : B.red }}>
            <Icon name={c.ok ? "check" : "alert"} size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p className="hub-check-name">{c.name}</p>
            <p className="hub-check-detail">
              <span style={srOnly}>{c.ok ? "Complete: " : "Needs attention: "}</span>
              {c.detail}
            </p>
            <p className="hub-check-q">{c.q}</p>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <MiniBar value={done} max={total} label="Readiness checks complete" />
        <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{done} / {total} complete</span>
      </div>
      <p className="hub-check-q" style={{ marginTop: 10 }}>
        These checks only confirm the information has been filled in. The reviewer still decides whether each test is truly met.
      </p>
    </Card>
  );
}

// What the programmes area shows while the list is still on its way.
export function ProgrammesSkeleton() {
  return (
    <SkeletonRegion label="Loading programmes">
      <Skeleton w="38%" h={28} />
      <div style={{ height: 8 }} />
      <Skeleton w="55%" h={14} />
      <div style={{ height: 24 }} />
      <div className="hub-metrics">
        {[0, 1, 2, 3].map((i) => (
          <div className="hub-metric" key={i}><Skeleton w="40%" h={24} /><Skeleton w="70%" h={12} /></div>
        ))}
      </div>
      <div className="hub-list"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
    </SkeletonRegion>
  );
}
