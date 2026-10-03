import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase.js";
import { fetchAllRows } from "../../lib/fetchAll.js";
// BATCH41-MARKER programme-section
import { ProgrammesSkeleton } from "./parts.jsx";
import NCDashboard from "./NCDashboard.jsx";
import CoordDashboard from "./CoordDashboard.jsx";
import ProgramDetail from "./ProgramDetail.jsx";
import NewProgramForm from "./NewProgramForm.jsx";
import ReportForm from "./ReportForm.jsx";

export default function ProgrammesSection({ profile, chapters, showToast, openProgramId, onOpened }) {
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newMode, setNewMode] = useState(false);
  // The programme being edited after it was returned. Null the rest of
  // the time. BATCH4B-MARKER resubmit
  const [editProgram, setEditProgram] = useState(null);
  const [reportProgram, setReportProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    let chapterId = null;
    if (profile.role !== "NC" && profile.chapter_name) {
      const { data: ch } = await supabase.from("chapters").select("id").eq("name", profile.chapter_name).single();
      if (ch) chapterId = ch.id;
    }
    // BATCH36-MARKER fetch-all-use: every programme, read in pages.
    const { data } = await fetchAllRows(() => {
      let q = supabase.from("programs").select("*, chapters(name), reports(*)").order("created_at", { ascending: false }).order("id");
      if (chapterId) q = q.eq("chapter_id", chapterId);
      return q;
    });
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

  // BATCH8-MARKER deep-link
  //
  // Somebody pressed Review on the dashboard. The programme cannot be
  // opened until the list has arrived, so this waits for that and then
  // clears the request. Without the clear, pressing Back inside the detail
  // view would reopen the same programme immediately.
  useEffect(() => {
    if (!openProgramId || loading) return;
    const wanted = programs.find((p) => p.id === openProgramId);
    if (wanted) openProgram(wanted);
    if (onOpened) onOpened();
  }, [openProgramId, loading, programs]); // eslint-disable-line react-hooks/exhaustive-deps

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
    showToast("Programme approved. The coordinator has been notified.");
  }

  async function returnProgram(id, comment) {
    const { error } = await supabase.rpc("return_program", { program_id: id, note: comment });
    if (error) { showToast("Error returning program: " + error.message, "error"); return; }
    setPrograms((ps) => ps.map((p) => (p.id === id ? { ...p, status: "Returned", nc_comment: comment } : p)));
    setSelected((s) => (s?.id === id ? { ...s, status: "Returned", nc_comment: comment } : s));
    showToast("Feedback sent to the chapter coordinator.");
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

  // Sends a programme on to whoever looks at it next. Which status it
  // lands in depends on where it started (BATCH38-MARKER tm-rc-review-chain):
  //   - Returned (by the NC)   -> Pending, straight back to the NC. Unchanged
  //     from before this batch.
  //   - RC Returned (by the RC) -> RC Review: the team member's revision goes
  //     back to their RC, not straight to the NC.
  //   - RC Review              -> Pending: the RC has edited a team member's
  //     note themselves and is forwarding it on to the NC.
  //
  // `nc_comment` and `rc_comment` are deliberately never sent here: the
  // database refuses to let anyone but the reviewer who left them change a
  // review comment, and leaving them out also keeps each comment on the
  // record as history rather than clearing it on resubmission.
  // `submitted_by` is left as it was so the notification still reaches
  // whoever raised it originally.
  async function resubmitProgram(form) {
    const id = editProgram.id;
    const nextStatus = editProgram.status === "RC Returned" ? "RC Review" : "Pending";
    const { error } = await supabase.from("programs").update({
      title: form.title, chapter_id: form.chapter_id, type: form.type, date: form.date,
      students: form.students, school: form.school, objectives: form.objectives,
      budget: form.budget, safeguarding_lead: form.safeguarding_lead, facilitators: form.facilitators,
      status: nextStatus,
    }).eq("id", id);
    if (error) { showToast("Could not save that: " + error.message, "error"); return; }
    await loadPrograms();
    setEditProgram(null);
    setSelected(null);
    showToast(
      nextStatus === "RC Review"
        ? "Resubmitted to your Regional Coordinator."
        : "Resubmitted. The National Coordinator has been notified."
    );
  }

  // BATCH38-MARKER tm-rc-review-chain
  // The three moves a chapter's RC (or an admin) has on a team member's
  // note sitting in RC Review. Forwarding reuses resubmitProgram above
  // (RC Review -> Pending) once the RC has edited the note, so only
  // Decline and Return-with-comment need their own calls here.
  async function declineProgram(id, reason) {
    const { error } = await supabase.from("programs").update({ status: "Declined", rc_comment: reason }).eq("id", id);
    if (error) { showToast("Could not decline that: " + error.message, "error"); return; }
    setPrograms((ps) => ps.map((p) => (p.id === id ? { ...p, status: "Declined", rc_comment: reason } : p)));
    setSelected((s) => (s?.id === id ? { ...s, status: "Declined", rc_comment: reason } : s));
    showToast("Concept note declined.", "warning");
  }

  async function rcReturnProgram(id, comment) {
    const { error } = await supabase.from("programs").update({ status: "RC Returned", rc_comment: comment }).eq("id", id);
    if (error) { showToast("Could not return that: " + error.message, "error"); return; }
    setPrograms((ps) => ps.map((p) => (p.id === id ? { ...p, status: "RC Returned", rc_comment: comment } : p)));
    setSelected((s) => (s?.id === id ? { ...s, status: "RC Returned", rc_comment: comment } : s));
    showToast("Feedback sent to the team member.");
  }

  function onReportSaved() {
    loadPrograms();
    if (selected && reportProgram && selected.id === reportProgram.id) {
      setSelected((s) => s && { ...s, status: "Complete" });
    }
  }

  if (loading) {
    return <ProgrammesSkeleton />;
  }

  return (
    <>
      {!selected && !newMode && !editProgram && profile.role === "NC" ? (
        <NCDashboard programs={programs} chapters={chapters} onView={openProgram} />
      ) : null}
      {!selected && !newMode && !editProgram && profile.role !== "NC" ? (
        <CoordDashboard programs={programs} profile={profile} onView={openProgram} onNew={() => setNewMode(true)} onReport={setReportProgram} />
      ) : null}
      {selected && !editProgram ? (
        <ProgramDetail
          program={selected}
          profile={profile}
          onBack={() => setSelected(null)}
          onApprove={approveProgram}
          onReturn={returnProgram}
          onDecline={declineProgram}
          onRcReturn={rcReturnProgram}
          onLogReport={setReportProgram}
          onEdit={() => setEditProgram(selected)}
        />
      ) : null}
      {newMode ? (
        <NewProgramForm profile={profile} chapters={chapters} onSubmit={addProgram} onCancel={() => setNewMode(false)} />
      ) : null}
      {editProgram ? (
        <NewProgramForm
          profile={profile}
          chapters={chapters}
          existing={editProgram}
          onSubmit={resubmitProgram}
          onCancel={() => setEditProgram(null)}
        />
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
