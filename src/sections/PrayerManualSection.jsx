import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";

const lbl = { fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em" };
const card = { background: B.white, border: `1px solid ${B.border}`, borderRadius: 10, padding: "18px 20px" };
const btnPrimary = { background: B.blue, color: B.white, border: "none", borderRadius: 6, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" };
const btnOutline = { background: "none", border: `1.5px solid ${B.blue}`, color: B.blue, borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" };

const PART_PDF_PATHS = {
  1: "YCDI_Prayer_Manual_Part1.pdf",
  2: "YCDI_Prayer_Manual_Part2.pdf",
  3: "YCDI_Prayer_Manual_Part3.pdf",
  4: "YCDI_Prayer_Manual_Part4.pdf",
  5: "YCDI_Prayer_Manual_Part5.pdf",
};

function ChapterBody({ ch }) {
  const h = { ...lbl, color: B.blue, marginTop: 14, marginBottom: 8 };
  return (
    <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
      <p style={{ fontSize: 13, color: B.black, lineHeight: 1.7 }}>{ch.intro}</p>

      <div style={h}>Scripture foundations</div>
      {(ch.scriptures || []).map((s, i) => (
        <div key={i} style={{ borderLeft: `3px solid ${B.yellow}`, paddingLeft: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontStyle: "italic", color: "#333" }}>"{s.text}" </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: B.red }}>- {s.ref}</span>
        </div>
      ))}

      {(ch.promises || []).length ? <>
        <div style={h}>God's promises</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(ch.promises || []).map((p, i) => <li key={i} style={{ fontSize: 13, color: B.black, marginBottom: 6, lineHeight: 1.6 }}>{p}</li>)}
        </ul>
      </> : null}

      {ch.sections ? ch.sections.map((sec, si) => (
        <div key={si}>
          <div style={{ ...h, color: B.red }}>{sec.heading}</div>
          {sec.intro ? <p style={{ fontSize: 13, color: B.black, lineHeight: 1.6 }}>{sec.intro}</p> : null}
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {(sec.points || []).map((pt, i) => <li key={i} style={{ fontSize: 13, color: B.black, marginBottom: 6, lineHeight: 1.6 }}>{pt}</li>)}
          </ol>
        </div>
      )) : (
        <>
          <div style={h}>Prayer points</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {(ch.points || []).map((pt, i) => <li key={i} style={{ fontSize: 13, color: B.black, marginBottom: 6, lineHeight: 1.6 }}>{pt}</li>)}
          </ol>
        </>
      )}

      {ch.declaration ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ background: B.red, color: "#fff", fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: "4px 4px 0 0", fontFamily: "'Montserrat',sans-serif", letterSpacing: "0.04em" }}>DECLARATION OF FAITH</div>
          <div style={{ background: "#FDF6F7", border: `1px solid ${B.red}`, borderTop: "none", padding: "12px 14px", borderRadius: "0 0 4px 4px", fontSize: 13, fontStyle: "italic", fontWeight: 600, color: B.black, lineHeight: 1.6 }}>{ch.declaration}</div>
        </div>
      ) : null}

      {ch.focus ? (
        <div style={{ marginTop: 14 }}>
          <div style={h}>Prayer focus</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}><strong style={{ color: B.red }}>Personal:</strong> {ch.focus.personal}</div>
          <div style={{ fontSize: 13 }}><strong style={{ color: B.red }}>Corporate:</strong> {ch.focus.corporate}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function PrayerManualSection() {
  const [parts, setParts] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activePartNum, setActivePartNum] = useState(1);
  const [openChapterId, setOpenChapterId] = useState(null);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p, error: pe }, { data: c, error: ce }] = await Promise.all([
        supabase.from("prayer_parts").select("*").order("part_number"),
        supabase.from("prayer_chapters").select("*").order("part_id", { ascending: true }).order("chapter_number", { ascending: true }),
      ]);
      if (pe || ce) { setErr("Could not load the prayer manual right now. Please try again shortly."); setLoading(false); return; }
      setParts(p || []);
      setChapters(c || []);
      if (p && p.length) setActivePartNum(p[0].part_number);
      setLoading(false);
    })();
  }, []);

  const activePart = parts.find((p) => p.part_number === activePartNum);
  const partChapters = chapters.filter((c) => c.part_id === (activePart && activePart.id)).sort((a, b) => a.chapter_number - b.chapter_number);
  const openChapter = chapters.find((c) => c.id === openChapterId);

  function matches(ch, q) {
    const hay = [
      ch.title, ch.intro,
      ...(ch.scriptures || []).flatMap((s) => [s.ref, s.text]),
      ...(ch.promises || []),
      ...(ch.points || []),
      ...(ch.sections || []).flatMap((s) => [s.heading, s.intro, ...(s.points || [])]),
      ch.declaration,
    ].filter(Boolean).join(" \n ").toLowerCase();
    return hay.includes(q);
  }
  const results = activeQuery.trim().length > 1 ? chapters.filter((ch) => matches(ch, activeQuery.trim().toLowerCase())) : [];

  function runSearch() { setActiveQuery(query); setOpenChapterId(null); }
  function clearSearch() { setActiveQuery(""); setQuery(""); }
  function openChapterFromSearch(ch) {
    const part = parts.find((p) => p.id === ch.part_id);
    if (part) setActivePartNum(part.part_number);
    setOpenChapterId(ch.id);
    setActiveQuery(""); setQuery("");
  }

  async function downloadPart(n) {
    const path = PART_PDF_PATHS[n];
    if (!path || pdfBusy) return;
    setPdfBusy(true);
    const { data, error } = await supabase.storage.from("prayer-manual").createSignedUrl(path, 3600);
    setPdfBusy(false);
    if (error || !data) { alert("Could not open that PDF right now. Please try again shortly."); return; }
    window.open(data.signedUrl, "_blank", "noreferrer");
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading the prayer manual...</div>;
  if (err) return <div style={{ ...card, borderColor: B.red, background: B.redLight, color: B.red }}>{err}</div>;

  return (
    <div style={{ fontFamily: "'Open Sans',Arial,sans-serif" }}>
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={lbl}>Search every prayer point</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="e.g. burnout, cultism, donors, fasting..."
            style={{ flex: 1, minWidth: 180, padding: "9px 12px", borderRadius: 6, border: `1px solid ${B.border}`, fontSize: 13, fontFamily: "'Open Sans',sans-serif" }}
          />
          <button onClick={runSearch} style={btnPrimary}>Search</button>
          {activeQuery ? <button onClick={clearSearch} style={btnOutline}>Clear</button> : null}
        </div>

        {activeQuery ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: B.muted, marginBottom: 10 }}>
              {results.length} chapter{results.length === 1 ? "" : "s"} match "{activeQuery}"
            </div>
            {results.length === 0 ? <div style={{ fontSize: 13, color: B.muted }}>No matches. Try a different word.</div> : null}
            {results.map((ch) => {
              const part = parts.find((p) => p.id === ch.part_id);
              return (
                <div key={ch.id} onClick={() => openChapterFromSearch(ch)} style={{ padding: "10px 4px", borderBottom: `1px solid ${B.offWhite}`, cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.blue, fontFamily: "'Montserrat',sans-serif" }}>{ch.title}</div>
                  <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>{part ? part.title : ""}</div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {!activeQuery ? (
        <>
          <div style={{ ...card, marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={lbl}>Choose a part</div>
                <select
                  value={activePartNum}
                  onChange={(e) => { setActivePartNum(Number(e.target.value)); setOpenChapterId(null); }}
                  style={{ marginTop: 8, width: "100%", padding: "9px 12px", borderRadius: 6, border: `1px solid ${B.border}`, fontSize: 13, fontFamily: "'Open Sans',sans-serif" }}
                >
                  {parts.map((p) => <option key={p.id} value={p.part_number}>Part {p.part_number}: {p.title}</option>)}
                </select>
              </div>
              {PART_PDF_PATHS[activePartNum] ? (
                <button onClick={() => downloadPart(activePartNum)} disabled={pdfBusy} style={{ ...btnOutline, opacity: pdfBusy ? 0.6 : 1, cursor: pdfBusy ? "default" : "pointer" }}>
                  {pdfBusy ? "Opening…" : "Download this Part (PDF)"}
                </button>
              ) : null}
            </div>
            {activePart ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 16, color: B.blue }}>{activePart.title}</div>
                {activePart.subtitle ? <div style={{ fontSize: 13, color: B.black, fontWeight: 600, marginTop: 2 }}>{activePart.subtitle}</div> : null}
                {(activePart.intro || []).map((t, i) => <p key={i} style={{ fontSize: 13, color: B.muted, lineHeight: 1.6, fontStyle: "italic", marginTop: 8 }}>{t}</p>)}
              </div>
            ) : null}
          </div>

          <div style={{ ...card, marginBottom: 18 }}>
            <div style={lbl}>Chapters in this part</div>
            <div style={{ marginTop: 10 }}>
              {partChapters.map((ch) => (
                <div key={ch.id} onClick={() => setOpenChapterId((id) => (id === ch.id ? null : ch.id))} style={{ padding: "11px 4px", borderBottom: `1px solid ${B.offWhite}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>Chapter {ch.chapter_number}: {ch.title}</div>
                    <span style={{ color: B.blue, fontSize: 16 }}>{openChapterId === ch.id ? "−" : "+"}</span>
                  </div>
                  {openChapterId === ch.id ? <ChapterBody ch={ch} /> : null}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {activeQuery && openChapter ? (
        <div style={{ ...card, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", marginBottom: 8 }}>Chapter {openChapter.chapter_number}: {openChapter.title}</div>
          <ChapterBody ch={openChapter} />
        </div>
      ) : null}
    </div>
  );
}
