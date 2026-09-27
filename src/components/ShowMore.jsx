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
        disabled={!!paged.busy}
        style={{ background: B.white, border: `1px solid ${B.blue}`, color: B.blue, borderRadius: 20, padding: "8px 18px", fontSize: 12.5, fontWeight: 700, cursor: paged.busy ? "wait" : "pointer", opacity: paged.busy ? 0.6 : 1, fontFamily: "'Montserrat',sans-serif" }}
      >
        {paged.busy ? "Loading…" : <>Show {paged.add} {word}</>}
      </button>
      <span style={{ fontSize: 11.5, color: B.muted }}>
        {paged.total - paged.remaining} of {paged.total} shown
        {/* BATCH36-MARKER showmore-server: a list fetched page by page
            from the server has no showAll, because "all" can be 30,000. */}
        {paged.remaining > paged.add && paged.showAll ? (
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
