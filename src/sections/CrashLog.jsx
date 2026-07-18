import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, btnG } from "../theme.js";
import { Card } from "../components/ui.jsx";

function when(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  if (mins < 1440) return Math.round(mins / 60) + " hr ago";
  return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function device(ua) {
  if (!ua) return "";
  if (/iPhone|iPad/i.test(ua)) return "iPhone or iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "Mac";
  return "Other";
}

export default function CrashLog({ showToast }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_errors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setErr("Could not load the crash log. If this keeps happening, the Batch 0 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    setErr("");
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // The same fault hitting five people is one problem, not five.
  const grouped = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = r.message;
      const g = map.get(key) || { message: key, count: 0, latest: r, people: new Set(), pages: new Set() };
      g.count += 1;
      if (new Date(r.created_at) > new Date(g.latest.created_at)) g.latest = r;
      if (r.full_name) g.people.add(r.full_name);
      if (r.page) g.pages.add(r.page);
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
  }, [rows]);

  async function clearAll() {
    if (!window.confirm("Clear the whole crash log? This can't be undone.")) return;
    setClearing(true);
    const { error } = await supabase.from("client_errors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setClearing(false);
    if (error) { showToast("Could not clear the log: " + error.message, "error"); return; }
    setRows([]);
    showToast("Crash log cleared.");
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading crash log…</div>;
  if (err) return <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, fontSize: 13, lineHeight: 1.6 }}>{err}</Card>;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Crash log</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          When the app breaks for somebody, it records itself here rather than leaving you to hear about it second hand. Identical faults are grouped together. Anything older than 90 days clears itself.
        </p>
      </Card>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: B.muted, flex: 1 }}>
          {rows.length === 0 ? "Nothing recorded." : `${grouped.length} distinct problem${grouped.length === 1 ? "" : "s"}, ${rows.length} report${rows.length === 1 ? "" : "s"}.`}
        </div>
        <button onClick={load} style={btnG}>Refresh</button>
        {rows.length > 0 ? (
          <button onClick={clearAll} disabled={clearing} style={{ ...btnG, color: B.red, borderColor: B.red, opacity: clearing ? 0.6 : 1 }}>
            {clearing ? "Clearing…" : "Clear log"}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "34px 20px", fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
          Nothing has crashed. That's the result you want here.
        </Card>
      ) : (
        grouped.map((g) => {
          const isOpen = open === g.message;
          return (
            <div key={g.message} style={{ background: B.white, border: `1px solid ${B.border}`, borderLeft: `3px solid ${B.red}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif", overflowWrap: "anywhere" }}>{g.message}</div>
                  <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3, lineHeight: 1.6 }}>
                    {when(g.latest.created_at)}
                    {g.count > 1 ? ` · ${g.count} times` : ""}
                    {g.people.size ? ` · ${[...g.people].slice(0, 3).join(", ")}${g.people.size > 3 ? ` and ${g.people.size - 3} more` : ""}` : ""}
                    {g.latest.user_agent ? ` · ${device(g.latest.user_agent)}` : ""}
                    {g.latest.app_version ? ` · v${g.latest.app_version}` : ""}
                  </div>
                  {g.pages.size ? (
                    <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2 }}>On: {[...g.pages].join(", ")}</div>
                  ) : null}
                </div>
                <button onClick={() => setOpen(isOpen ? null : g.message)} style={{ ...btnG, padding: "6px 12px", fontSize: 11.5 }}>
                  {isOpen ? "Hide" : "Detail"}
                </button>
              </div>

              {isOpen ? (
                <pre style={{ marginTop: 11, marginBottom: 0, background: B.offWhite, borderRadius: 7, padding: "10px 12px", fontSize: 10.5, lineHeight: 1.55, overflowX: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#4B5563" }}>
                  {(g.latest.stack || "No technical trace recorded.") + (g.latest.component_stack ? "\n\nWhere in the app:" + g.latest.component_stack : "")}
                </pre>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
