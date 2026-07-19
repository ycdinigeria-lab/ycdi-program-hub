import { B } from "../theme.js";

// Sits under a paged list. Disappears entirely once everything is on
// screen, so a short list looks exactly as it did before.
//
// BATCH4-MARKER showmore

export function ShowMore({ paged, noun }) {
  if (!paged || paged.remaining <= 0) return null;
  const word = noun || "more";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", padding: "14px 4px 2px" }}>
      <button
        onClick={paged.showMore}
        style={{ background: B.white, border: `1px solid ${B.blue}`, color: B.blue, borderRadius: 20, padding: "8px 18px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
      >
        Show {paged.add} {word}
      </button>
      <span style={{ fontSize: 11.5, color: B.muted }}>
        {paged.total - paged.remaining} of {paged.total} shown
        {paged.remaining > paged.add ? (
          <>
            {" · "}
            <button
              onClick={paged.showAll}
              style={{ background: "none", border: "none", padding: 0, color: B.blue, fontSize: 11.5, cursor: "pointer", fontFamily: "'Open Sans',sans-serif", textDecoration: "underline" }}
            >
              show all {paged.total}
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}

export default ShowMore;
