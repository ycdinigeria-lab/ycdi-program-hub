import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { Card } from "../../components/ui.jsx";
import NCDashboard from "./NCDashboard.jsx";
import CoordDashboard from "./CoordDashboard.jsx";
import ProgramDetail from "./ProgramDetail.jsx";
import NewProgramForm from "./NewProgramForm.jsx";
import ReportForm from "./ReportForm.jsx";

export default function ProgrammesSection({ profile, chapters, showToast }) {
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newMode, setNewMode] = useState(false);
  const [reportProgram, setReportProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    let q = supabase.from("programs").select("*, chapters(name), reports(*)").order("created_at", { ascending: false });
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
  }, [profile.role, profile.chapter_name]);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  async function openProgram(p) {
    const { data: full } = await supabase.from("programs").select("*, chapters(name)").eq("id", p.id).single();
    const { data: rep } = await supabase.from("reports").select("*").eq("program_id", p.id).single();
    const merged = { ...(full || p), chapter_name: full?.chapters?.name || p.chapter_name || "", report: rep || null };
    setPrograms((ps) => ps.map((x) => (x.id === p.id ? merged : x)));
    setSelected(merged);
  }

  async function approveProgram(id) {
    // Goes through a function on the database side rather than a direct
    // table update, so the "only an admin can do this" check lives in
    // one place instead of depending on the programs table's own rules.
    const { error } = await supabase.rpc("approve_program", { program_id: id });
    if (error) { showToast("Error approving program: " + error.message, "error"); return; }
    setPrograms((ps) => ps.map((p) => (p.id === id ? { ...p, status: "Approved", nc_comment: "" } : p)));
    setSelected((s) => (s?.id === id ? { ...s, status: "Approved", nc_comment: "" } : s));
    showToast("Program approved. Coordinator has been notified.");
  }

  async function returnProgram(id, comment) {
    const { error } = await supabase.rpc("return_program", { program_id: id, note: comment });
    if (error) { showToast("Error returning program: " + error.message, "error"); return; }
    setPrograms((ps) => ps.map((p) => (p.id === id ? { ...p, status: "Returned", nc_comment: comment } : p)));
    setSelected((s) => (s?.id === id ? { ...s, status: "Returned", nc_comment: comment } : s));
    showToast("Program returned with your comment.", "warning");
  }

  async function addProgram(form) {
    const { error } = await supabase.from("programs").insert({
      title: form.title, chapter_id: form.chapter_id, type: form.type, date: form.date,
      students: form.students, school: form.school, objectives: form.objectives,
      budget: form.budget, safeguarding_lead: form.safeguarding_lead, facilitators: form.facilitators,
      status: "Pending", submitted_by: profile.id,
    });
    if (error) { showToast("Error submitting program: " + error.message, "error"); return; }
    await loadPrograms();
    setNewMode(false);
    showToast("Concept note submitted to the National Coordinator.");
  }

  function onReportSaved() {
    loadPrograms();
    if (selected && reportProgram && selected.id === reportProgram.id) {
      setSelected((s) => s && { ...s, status: "Complete" });
    }
  }

  if (loading) {
    return <Card style={{ textAlign: "center", padding: 30, color: "#5a5a5a", fontSize: 13 }}>Loading programmes…</Card>;
  }

  return (
    <>
      {!selected && !newMode && profile.role === "NC" ? (
        <NCDashboard programs={programs} chapters={chapters} onView={openProgram} />
      ) : null}
      {!selected && !newMode && profile.role !== "NC" ? (
        <CoordDashboard programs={programs} profile={profile} onView={openProgram} onNew={() => setNewMode(true)} onReport={setReportProgram} />
      ) : null}
      {selected ? (
        <ProgramDetail
          program={selected}
          profile={profile}
          onBack={() => setSelected(null)}
          onApprove={approveProgram}
          onReturn={returnProgram}
          onLogReport={setReportProgram}
        />
      ) : null}
      {newMode ? (
        <NewProgramForm profile={profile} chapters={chapters} onSubmit={addProgram} onCancel={() => setNewMode(false)} />
      ) : null}

      {reportProgram ? (
        <ReportForm
          program={reportProgram}
          profile={profile}
          onClose={() => setReportProgram(null)}
          onSaved={onReportSaved}
          showToast={showToast}
        />
      ) : null}
    </>
  );
}
