// BATCH8-MARKER dashboard-screen
//
// The landing screen. It repeats no data of its own: everything here is the
// programme list read a second time, arranged so the things waiting on you
// are the first thing you see and the numbers can be pressed rather than
// only read.
import { useState, useEffect, useCallback, useMemo, useId } from "react";
import { supabase } from "../lib/supabase.js";
import { B, STATUS_CFG, btnP } from "../theme.js";
import { Card, SHead, StatCard, MiniBar, Badge } from "../components/ui.jsx";
import {
  greetingLine, scopeFor, statCardsFor, attentionFor,
  filterPrograms, filterChipsFor, chapterTotals, quickActionsFor,
} from "../lib/dashboard.js";

const TONE = {
  alert: { bg: B.redLight, border: B.red + "40", text: B.red },
  warn: { bg: B.yellowLight, border: B.yellow + "80", text: B.gold },
};

function Chip({ label, count, on, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        background: on ? B.blue : B.white,
        color: on ? B.white : B.muted,
        border: "1px solid " + (on ? B.blue : B.border),
        borderRadius: 20,
        padding: "6px 13px",
        fontSize: 12,
        fontWeight: on ? 700 : 600,
        fontFamily: "'Montserrat',sans-serif",
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}{typeof count === "number" ? " " + count : ""}
    </button>
  );
}

// A small rotating set of KJV lines with a plain reading under each, so a
// team member has a reason to open the app on a day with nothing to file.
// KJV is the standard across YCDI; the plain line is for younger readers.
const VERSES = [
  { ref: "1 Timothy 4:12", kjv: "Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.", plain: "Do not let anyone look down on you for being young. Let the way you live show others what following Jesus looks like." },
  { ref: "Galatians 6:9", kjv: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", plain: "Do not get tired of doing good. The harvest comes if you do not give up." },
  { ref: "Joshua 1:9", kjv: "Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", plain: "Be strong and brave. Do not be afraid, because God is with you wherever you go." },
  { ref: "Colossians 3:23", kjv: "And whatsoever ye do, do it heartily, as to the Lord, and not unto men.", plain: "Whatever you do, put your heart into it, as if you are doing it for God and not only for people." },
  { ref: "Matthew 5:16", kjv: "Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.", plain: "Live so your good works are seen, and people give glory to God because of them." },
  { ref: "Philippians 4:13", kjv: "I can do all things through Christ which strengtheneth me.", plain: "With Christ giving me strength, I can face whatever comes." },
  { ref: "Proverbs 3:5", kjv: "Trust in the LORD with all thine heart; and lean not unto thine own understanding.", plain: "Trust God completely, and do not rely only on your own thinking." },
  { ref: "1 Corinthians 15:58", kjv: "Therefore, my beloved brethren, be ye stedfast, unmoveable, always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord.", plain: "Stand firm, give yourself fully to God's work, because with him your effort is never wasted." },
];
function todaysVerse() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const day = Math.floor((Date.now() - start) / 86400000);
  return VERSES[day % VERSES.length];
}
function firstName(full) { return (full || "").trim().split(/\s+/)[0] || "there"; }
function partOfDay() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }

function TmStat({ label, value }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 0, background: B.white, border: `1px solid ${B.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.blue }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

// The team member's home. Their chapter as plain totals, their own part in
// it, one clear action, and a verse. No programme list, no register.
function TeamMemberHome({ profile, pulse, contrib, loading, onNavigate }) {
  const v = todaysVerse();
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.black }}>
          Good {partOfDay()}, {firstName(profile.full_name)}
        </div>
        <div style={{ fontSize: 12.5, color: B.muted, marginTop: 2 }}>{profile.chapter_name} chapter</div>
      </div>

      <Card>
        <SHead>Your chapter this year</SHead>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <TmStat label="Programmes running now" value={loading ? null : pulse?.programmes_active} />
          <TmStat label="Outreaches this year" value={loading ? null : pulse?.outreaches_year} />
          <TmStat label="Young people reached this year" value={loading ? null : pulse?.young_people_year} />
          <TmStat label="Coming up" value={loading ? null : pulse?.upcoming} />
        </div>
      </Card>

      <Card>
        <SHead>Your part in it</SHead>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <TmStat label="Reports you have filed" value={loading ? null : contrib?.reports_filed} />
          <TmStat label="Acknowledged by the NC" value={loading ? null : contrib?.reports_acknowledged} />
          <TmStat label="Young people you mentor" value={loading ? null : contrib?.mentees} />
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => onNavigate("reports")} style={{ ...btnP, padding: "9px 18px", fontSize: 13 }}>File a report</button>
          <button onClick={() => onNavigate("reports")} style={{ background: "none", border: `1px solid ${B.border}`, borderRadius: 6, padding: "8px 16px", fontSize: 12, color: B.muted, cursor: "pointer", fontFamily: "'Open Sans',sans-serif" }}>See your reports</button>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 14, color: B.black, lineHeight: 1.7, fontFamily: "Georgia, 'Gelasio', serif" }}>{v.kjv}</div>
        <div style={{ fontSize: 12, color: B.blue, fontWeight: 700, marginTop: 6, fontFamily: "'Montserrat',sans-serif" }}>{v.ref} (KJV)</div>
        <div style={{ fontSize: 12.5, color: B.muted, marginTop: 8, lineHeight: 1.6 }}>{v.plain}</div>
      </Card>
    </div>
  );
}

export default function DashboardSection({ profile, chapters, onOpenProgram, onNavigate }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(profile.role !== "TM");
  const [status, setStatus] = useState("all");
  const [chapter, setChapter] = useState(null);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const [pulse, setPulse] = useState(null);
  const [contrib, setContrib] = useState(null);
  const [tmLoading, setTmLoading] = useState(profile.role === "TM");

  useEffect(() => {
    if (profile.role !== "TM") return;
    let live = true;
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.rpc("chapter_pulse"),
        supabase.rpc("my_contribution"),
      ]);
      if (!live) return;
      setPulse(Array.isArray(p) ? p[0] : p);
      setContrib(Array.isArray(c) ? c[0] : c);
      setTmLoading(false);
    })();
    return () => { live = false; };
  }, [profile.role]);

  // Team Members have no access to programme operations, so this screen
  // does not ask the database for them. An empty list would otherwise read
  // as "your chapter has done nothing" rather than "this is not your view".
  const showsProgrammes = profile.role !== "TM";

  const load = useCallback(async () => {
    if (!showsProgrammes) return;
    // The same shape ProgrammesSection uses. Written out again rather than
    // shared, because the two screens load at different moments and one
    // waiting on the other would leave the dashboard blank on arrival.
    let q = supabase
      .from("programs")
      .select("*, chapters(name), reports(*)")
      .order("created_at", { ascending: false });
    if (profile.role !== "NC" && profile.chapter_name) {
      const { data: ch } = await supabase.from("chapters").select("id").eq("name", profile.chapter_name).single();
      if (ch) q = q.eq("chapter_id", ch.id);
    }
    const { data } = await q;
    if (data) {
      setPrograms(data.map((p) => ({
        ...p,
        chapter_name: p.chapters?.name || "",
        report: p.reports?.[0] || null,
      })));
    }
    setLoading(false);
  }, [profile.role, profile.chapter_name, showsProgrammes]);

  useEffect(() => { load(); }, [load]);

  const mine = useMemo(() => scopeFor(programs, profile), [programs, profile]);
  const cards = useMemo(() => statCardsFor(programs, profile), [programs, profile]);
  const attention = useMemo(() => attentionFor(programs, profile), [programs, profile]);
  const chips = useMemo(() => filterChipsFor(programs, profile), [programs, profile]);
  const shown = useMemo(() => filterPrograms(mine, { status, chapter, query }), [mine, status, chapter, query]);
  const totals = useMemo(
    () => chapterTotals(mine, chapters.map((c) => c.name)),
    [mine, chapters]
  );
  const maxStudents = Math.max(...totals.map((t) => t.students), 1);
  const actions = quickActionsFor(profile);
  const filtering = status !== "all" || chapter !== null || query.trim() !== "";

  function clearFilters() {
    setStatus("all");
    setChapter(null);
    setQuery("");
  }

  // Pressing the card that is already chosen clears it, so there is always
  // a way back out without hunting for a reset button.
  function toggleStatus(next) {
    setStatus((cur) => (cur === next ? "all" : next));
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", lineHeight: 1.25 }}>
          {greetingLine(profile.full_name)}
        </h1>
        <div style={{ fontSize: 12.5, color: B.muted, marginTop: 4 }}>
          {profile.role === "NC" ? "National overview" : profile.chapter_name ? profile.chapter_name + " chapter" : "YCDI"}
          {" · "}
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>

      {actions.length ? (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 18 }}>
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => onNavigate(a.section, a.view)}
              style={{
                background: B.white, border: "1px solid " + B.border, borderRadius: 20,
                padding: "8px 15px", fontSize: 12.5, fontWeight: 600, color: B.blueDark,
                fontFamily: "'Montserrat',sans-serif", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      {!showsProgrammes ? (
        <TeamMemberHome profile={profile} pulse={pulse} contrib={contrib} loading={tmLoading} onNavigate={onNavigate} />
      ) : loading ? (
        <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13 }}>Loading your dashboard…</Card>
      ) : (
        <>
          <div className="rstats" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {cards.map((c) => (
              <StatCard
                key={c.key}
                label={c.label}
                value={c.value}
                accent={c.accent}
                onClick={c.filter ? () => toggleStatus(c.filter) : undefined}
                selected={!!c.filter && status === c.filter}
              />
            ))}
          </div>

          {attention.length > 0 ? (
            <Card style={{ background: TONE[attention[0].tone].bg, borderColor: TONE[attention[0].tone].border, marginBottom: 14 }}>
              <SHead>Needs your attention</SHead>
              {attention.slice(0, 4).map((a, i) => (
                <div
                  key={a.id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < Math.min(attention.length, 4) - 1 ? "1px solid " + TONE[a.tone].border : "none" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{a.meta}</div>
                  </div>
                  <button
                    onClick={() => onOpenProgram(a.id)}
                    style={{ background: "none", border: "1px solid " + TONE[a.tone].text, borderRadius: 20, color: TONE[a.tone].text, padding: "6px 14px", fontSize: 12, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer", flexShrink: 0 }}
                  >
                    {a.actionLabel}
                  </button>
                </div>
              ))}
              {attention.length > 4 ? (
                <div style={{ fontSize: 11.5, color: B.muted, paddingTop: 9 }}>
                  and {attention.length - 4} more below
                </div>
              ) : null}
            </Card>
          ) : null}

          <div className="ncsplit">
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <SHead>All programmes</SHead>
                {profile.role !== "NC" ? (
                  <button onClick={() => onNavigate("programmes")} style={{ ...btnP, padding: "7px 16px", fontSize: 12 }}>
                    + Submit outreach
                  </button>
                ) : null}
              </div>

              <label htmlFor={searchId} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                Search programmes
              </label>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, chapter or school"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid " + B.border, fontSize: 13, marginBottom: 10, boxSizing: "border-box", fontFamily: "'Open Sans',sans-serif" }}
              />

              <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
                {chips.map((c) => (
                  <Chip
                    key={c.key}
                    label={c.label}
                    count={c.key === "all" ? undefined : c.count}
                    on={status === c.key}
                    onClick={() => toggleStatus(c.key)}
                  />
                ))}
              </div>

              {filtering ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <div role="status" aria-live="polite" style={{ fontSize: 12, color: B.muted }}>
                    {shown.length} of {mine.length} shown{chapter ? " · " + chapter : ""}
                  </div>
                  <button onClick={clearFilters} style={{ background: "none", border: "none", color: B.blueDark, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    Clear
                  </button>
                </div>
              ) : null}

              {shown.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: B.muted, fontSize: 13 }}>
                  {mine.length === 0 ? "No programmes submitted yet." : "Nothing matches that."}
                </div>
              ) : null}

              {shown.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => onOpenProgram(p.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: i < shown.length - 1 ? "1px solid " + B.offWhite : "none", cursor: "pointer" }}
                >
                  <div style={{ width: 4, height: 40, borderRadius: 2, background: (STATUS_CFG[p.status] || {}).dot || B.border, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>
                      {[p.chapter_name, p.date, (Number(p.students) || 0) + " students"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Badge status={p.status} />
                </div>
              ))}
            </Card>

            {profile.role === "NC" ? (
              <Card>
                <SHead>Students by chapter</SHead>
                <div style={{ fontSize: 11.5, color: B.muted, marginBottom: 12, lineHeight: 1.5 }}>
                  Press a chapter to filter the list.
                </div>
                {totals.map((t) => {
                  const on = chapter === t.name;
                  return (
                    <button
                      key={t.name}
                      onClick={() => setChapter(on ? null : t.name)}
                      aria-pressed={on}
                      style={{ display: "block", width: "100%", textAlign: "left", background: on ? B.blueLight : "none", border: "none", borderRadius: 6, padding: on ? "7px 8px" : "7px 0", marginBottom: 6, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: on ? B.blueDark : B.muted, fontWeight: on ? 700 : 400, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: B.blue, flexShrink: 0, fontFamily: "'Montserrat',sans-serif" }}>{t.students}</span>
                      </div>
                      <MiniBar value={t.students} max={maxStudents} label={t.name + ", " + t.students + " students"} />
                    </button>
                  );
                })}
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
