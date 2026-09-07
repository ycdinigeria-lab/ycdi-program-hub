import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP, btnG } from "../theme.js";
import { Card, SHead, Field, StatCard } from "../components/ui.jsx";
import { usePaged } from "../lib/paging.js";
import { ShowMore } from "../components/ShowMore.jsx";

export const STAGES = ["Contact", "Connect", "Commit", "Grow", "Multiply"];
export const AGE_BANDS = ["10-12", "13-15", "16-17", "18+"];

// A hard ceiling on how many rows are ever pulled in one go. Well above
// anything YCDI holds today, and it stops a future chapter with thousands
// of names from freezing a phone. If it is ever hit the screen says so
// rather than quietly showing a partial list.
//
// BATCH4-MARKER participants-paging
const MAX_ROWS = 2000;

const STAGE_COLOUR = {
  Contact: B.muted,
  Connect: B.blue,
  Commit: B.purple,
  Grow: B.green,
  Multiply: B.gold,
};

const CONSENT_TYPES = [
  { id: "registration", label: "Registration and general safeguarding", note: "Covers group event photos with no identifying detail, and anonymous testimony." },
  { id: "photo_published", label: "Individual photograph published", note: "Signed parental form required, kept on file." },
  { id: "testimony_named", label: "Testimony with name and photo", note: "Signed consent, reviewed by the National Coordinator." },
  { id: "video", label: "Video recording used in communications", note: "Signed video consent form required." },
];

export function isMinorBand(band) {
  return band !== "18+";
}

// ------------------------------------------------------------
// Who may do what (Batch 13)
// ------------------------------------------------------------
// These decide what the screen offers. The database decides what actually
// goes through, so a wrong guess here is a missing or a dead button, never
// a hole. They are kept small and pure so they can be tested on their own.

// A team member may now add a young person, alongside coordinators and
// admins. The add form forces their own chapter and their own name.
export function canAddParticipant(profile) {
  return !!(profile.is_admin || profile.role === "RC" || profile.role === "TM");
}

// A team member becomes the mentor of anyone they add, so the record reads
// as theirs from the first day and keeps doing so even if the authorship
// link is ever cleared.
export function selfMentorsOnCreate(profile) {
  return profile.role === "TM";
}

// Editing here means moving a young person along the pathway and recording a
// consent. A coordinator may for their chapter; a team member for a young
// person they hold, which row security has already limited to ones they
// added or mentor, so once the record has loaded the answer is simply yes.
export function canEditParticipant(profile, p) {
  if (profile.is_admin) return true;
  if (profile.role === "RC") return !!(p && profile.chapter_name && p.chapters?.name === profile.chapter_name);
  if (profile.role === "TM") return !!p;
  return false;
}

// Withdrawing a consent, and assigning or ending a mentor, stay coordinator
// work. A team member never does either, in the screen or in the database.
export function isChapterCoordinator(profile, p) {
  if (profile.is_admin) return true;
  if (profile.role === "RC") return !!(p && profile.chapter_name && p.chapters?.name === profile.chapter_name);
  return false;
}

// The stage totals and the outstanding-withdrawals banner are a chapter-wide
// picture. A team member holds only their own few, so they get the list on
// its own; the overview would read as nothing but zeros for them.
export function showsChapterOverview(profile) {
  return !!(profile.is_admin || profile.role === "NC" || profile.role === "RC");
}

export function participantsEmptyCopy(profile) {
  if (profile.role === "TM") {
    return "You are not holding anyone yet. When you add a young person, or a coordinator names you as their mentor, they show up here.";
  }
  return "No participants recorded yet. Once young people are added here, the pathway stops being a page of theory and starts being a record of who is actually moving.";
}

function StagePill({ stage, small }) {
  const c = STAGE_COLOUR[stage] || B.muted;
  return (
    <span style={{ background: c, color: B.white, padding: small ? "2px 8px" : "3px 11px", borderRadius: 20, fontSize: small ? 10 : 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", whiteSpace: "nowrap" }}>
      {stage}
    </span>
  );
}

function niceDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ------------------------------------------------------------
// Add form
// ------------------------------------------------------------
function AddParticipant({ profile, chapters, onCancel, onSaved, showToast }) {
  const ownChapter = chapters.find((c) => c.name === profile.chapter_name);
  const [f, setF] = useState({
    full_name: "",
    gender: "",
    age_band: "13-15",
    class_level: "",
    school: "",
    chapter_id: profile.is_admin ? "" : ownChapter?.id || "",
    consent_on: "",
    consent_ref: "",
    phone: "",
    stage: "Contact",
  });
  const [saving, setSaving] = useState(false);
  const minor = isMinorBand(f.age_band);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.full_name.trim()) { showToast("A name is needed.", "error"); return; }
    if (!f.chapter_id) { showToast("Choose a chapter.", "error"); return; }
    if (!f.consent_on) { showToast("Record the date parental or guardian consent was given. A participant cannot be added without it.", "error"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("participants").insert({
      chapter_id: f.chapter_id,
      full_name: f.full_name.trim(),
      gender: f.gender || null,
      age_band: f.age_band,
      class_level: f.class_level || null,
      school: f.school || null,
      stage: f.stage,
      consent_on: f.consent_on,
      consent_ref: f.consent_ref || null,
      phone: minor ? null : f.phone || null,
      created_by: profile.id,
    }).select("id").single();
    if (error) { setSaving(false); showToast(error.message, "error"); return; }

    // The registration consent they just told us about becomes the first
    // record on file, so the consent trail starts on day one.
    await supabase.from("participant_consents").insert({
      participant_id: data.id,
      consent_type: "registration",
      granted_on: f.consent_on,
      document_ref: f.consent_ref || null,
      recorded_by: profile.id,
    });

    // A team member who adds a young person becomes their mentor, so the
    // record is theirs from the start. If this one write fails the young
    // person is still safely added and still theirs by authorship, so this
    // warns rather than unwinds anything.
    if (selfMentorsOnCreate(profile)) {
      const { error: mErr } = await supabase.from("participant_mentors").insert({
        participant_id: data.id,
        mentor_id: profile.id,
      });
      if (mErr) showToast("Added, but you were not set as the mentor automatically. A coordinator can set that.", "warning");
    }

    setSaving(false);
    showToast("Participant added.");
    onSaved();
  }

  return (
    <Card>
      <SHead>Add a participant</SHead>

      <div style={{ background: B.yellowLight, border: "1px solid " + B.yellow, borderRadius: 8, padding: "11px 13px", fontSize: 12, color: "#6b5200", lineHeight: 1.55, marginBottom: 16 }}>
        Under YCDI's Data Protection Policy, no personal information about anyone under 18 may be recorded until a parent or guardian has given documented consent. Only add someone here once you are holding that signed form.
      </div>

      <Field label="Full name" required>
        <input style={inp} value={f.full_name} onChange={set("full_name")} placeholder="As written on the register" />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Field label="Age band" required>
          <select style={sel} value={f.age_band} onChange={set("age_band")}>
            {AGE_BANDS.map((a) => <option key={a} value={a}>{a === "18+" ? "18 and over" : a + " years"}</option>)}
          </select>
        </Field>
        <Field label="Gender">
          <select style={sel} value={f.gender} onChange={set("gender")}>
            <option value="">Not recorded</option>
            <option>Male</option>
            <option>Female</option>
          </select>
        </Field>
        <Field label="Class">
          <input style={inp} value={f.class_level} onChange={set("class_level")} placeholder="JSS2, SS3, 200 level" />
        </Field>
      </div>

      <Field label="School or institution">
        <input style={inp} value={f.school} onChange={set("school")} />
      </Field>

      {profile.is_admin ? (
        <Field label="Chapter" required>
          <select style={sel} value={f.chapter_id} onChange={set("chapter_id")}>
            <option value="">Choose a chapter</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Field label="Date consent was given" required>
          <input type="date" style={inp} value={f.consent_on} max={new Date().toISOString().slice(0, 10)} onChange={set("consent_on")} />
        </Field>
        <Field label="Where the form is filed">
          <input style={inp} value={f.consent_ref} onChange={set("consent_ref")} placeholder="Register reference or file number" />
        </Field>
      </div>

      {minor ? (
        <div style={{ fontSize: 11.5, color: B.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Phone numbers and email addresses are not recorded for participants under 18. Contact details are held for tertiary students only.
        </div>
      ) : (
        <Field label="Phone (tertiary participants only)">
          <input style={inp} value={f.phone} onChange={set("phone")} placeholder="Optional" />
        </Field>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button style={btnP} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add participant"}</button>
        <button style={btnG} onClick={onCancel}>Cancel</button>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// One participant
// ------------------------------------------------------------
function ParticipantDetail({ id, profile, onBack, showToast }) {
  const [p, setP] = useState(null);
  const [history, setHistory] = useState([]);
  const [consents, setConsents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [moveTo, setMoveTo] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [newConsent, setNewConsent] = useState("");
  const [consentRef, setConsentRef] = useState("");
  const [consentBy, setConsentBy] = useState("");
  const [mentor, setMentor] = useState(null);
  const [mentorOptions, setMentorOptions] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [chapterProgs, setChapterProgs] = useState([]);
  const [busy, setBusy] = useState(false);

  const canEdit = canEditParticipant(profile, p);
  const coordinator = isChapterCoordinator(profile, p);

  const load = useCallback(async () => {
    const { data } = await supabase.from("participants").select("*, chapters(name)").eq("id", id).single();
    setP(data || null);
    const { data: h } = await supabase.from("participant_stages").select("*").eq("participant_id", id).order("moved_on", { ascending: false });
    setHistory(h || []);
    const { data: c } = await supabase.from("participant_consents").select("*").eq("participant_id", id).order("granted_on", { ascending: false });
    setConsents(c || []);
    const { data: a } = await supabase.from("participant_attendance").select("program_id, attended_on, programs(title, date)").eq("participant_id", id);
    setAttendance(a || []);
    const { data: m } = await supabase.from("participant_mentors")
      .select("id, mentor_id, assigned_on, profiles(full_name, role)")
      .eq("participant_id", id).is("ended_on", null)
      .order("assigned_on", { ascending: false }).limit(1);
    setMentor(m && m[0] ? m[0] : null);
    const { data: opts } = await supabase.rpc("chapter_mentor_options", { p_participant: id });
    setMentorOptions(opts || []);
    if (data?.chapter_id) {
      const { data: pr } = await supabase.from("programs")
        .select("id, title, date").eq("chapter_id", data.chapter_id)
        .not("date", "is", null).order("date", { ascending: false });
      setChapterProgs(pr || []);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function doMove() {
    if (!moveTo) return;
    setBusy(true);
    const { error } = await supabase.rpc("move_participant_stage", { p_id: id, p_new: moveTo, p_note: moveNote });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    setMoveTo(""); setMoveNote("");
    showToast("Stage updated.");
    load();
  }

  async function addConsent() {
    if (!newConsent) return;
    setBusy(true);
    const { error } = await supabase.from("participant_consents").insert({
      participant_id: id,
      consent_type: newConsent,
      granted_by: consentBy || null,
      document_ref: consentRef || null,
      recorded_by: profile.id,
    });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    setNewConsent(""); setConsentRef(""); setConsentBy("");
    showToast("Consent recorded.");
    load();
  }

  async function withdraw(consentId) {
    setBusy(true);
    const { error } = await supabase.rpc("withdraw_participant_consent", { consent_id: consentId });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Consent withdrawn. Anything published under it must come down within five working days.", "warning");
    load();
  }

  async function doAssignMentor() {
    if (!assignTo) return;
    setBusy(true);
    const { error } = await supabase.rpc("assign_mentor", { p_participant: id, p_mentor: assignTo });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    setAssignTo("");
    showToast("Mentor set.");
    load();
  }

  async function doEndMentorship() {
    setBusy(true);
    const { error } = await supabase.rpc("end_mentorship", { p_participant: id });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Mentorship ended.");
    load();
  }

  async function toggleAttendance(programId, present) {
    setBusy(true);
    const { error } = await supabase.rpc("record_mentee_attendance", { p_participant: id, p_program: programId, p_present: present });
    setBusy(false);
    if (error) { showToast(error.message, "error"); return; }
    load();
  }

  if (!p) return <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13 }}>Loading…</Card>;

  const live = consents.filter((c) => !c.withdrawn_on);
  const available = CONSENT_TYPES.filter((t) => !live.some((c) => c.consent_type === t.id));
  const attendedIds = new Set(attendance.map((a) => a.program_id));

  return (
    <>
      <button style={{ ...btnG, marginBottom: 14 }} onClick={onBack}>Back to list</button>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.black }}>{p.full_name}</div>
            <div style={{ fontSize: 12, color: B.muted, marginTop: 4, lineHeight: 1.6 }}>
              {p.chapters?.name} chapter · {p.age_band === "18+" ? "18 and over" : p.age_band + " years"}
              {p.class_level ? " · " + p.class_level : ""}
              {p.school ? " · " + p.school : ""}
              {!p.active ? " · No longer active" : ""}
            </div>
            <div style={{ fontSize: 11.5, color: B.muted, marginTop: 4 }}>
              First recorded {niceDate(p.first_contact_on)} · Consent held from {niceDate(p.consent_on)}
              {p.consent_ref ? " (" + p.consent_ref + ")" : ""}
            </div>
          </div>
          <StagePill stage={p.stage} />
        </div>
      </Card>

      {canEdit ? (
        <Card style={{ marginBottom: 14 }}>
          <SHead>Move along the pathway</SHead>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <Field label="New stage">
              <select style={sel} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Choose</option>
                {STAGES.filter((s) => s !== p.stage).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="What changed">
              <input style={inp} value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder="Came back a third time, made a commitment…" />
            </Field>
          </div>
          <button style={btnP} onClick={doMove} disabled={busy || !moveTo}>Record the move</button>
        </Card>
      ) : null}

      {coordinator ? (
        <Card style={{ marginBottom: 14 }}>
          <SHead>Mentor</SHead>
          <div style={{ fontSize: 12.5, color: "#333", marginBottom: 12, lineHeight: 1.5 }}>
            {mentor
              ? <>Mentored by <strong>{mentor.profiles?.full_name || "a team member"}</strong>{mentor.profiles?.role ? " (" + (mentor.profiles.role === "RC" ? "Coordinator" : "Team member") + ")" : ""}, since {niceDate(mentor.assigned_on)}.</>
              : "No mentor assigned yet."}
          </div>
          <Field label={mentor ? "Change the mentor to" : "Assign a mentor"}>
            <select style={sel} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Choose someone from this chapter</option>
              {mentorOptions.map((o) => (
                <option key={o.profile_id} value={o.profile_id}>
                  {o.full_name} ({o.role === "RC" ? "Coordinator" : "Team member"})
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnP} onClick={doAssignMentor} disabled={busy || !assignTo}>
              {mentor ? "Change mentor" : "Assign mentor"}
            </button>
            {mentor ? (
              <button style={{ ...btnG, color: B.red, borderColor: B.red }} onClick={doEndMentorship} disabled={busy}>
                End mentorship
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card style={{ marginBottom: 14 }}>
        <SHead>Their journey</SHead>
        {history.length === 0 ? (
          <div style={{ fontSize: 12.5, color: B.muted }}>Nothing recorded yet.</div>
        ) : (
          history.map((h, i) => (
            <div key={h.id} style={{ display: "flex", gap: 11, paddingBottom: i === history.length - 1 ? 0 : 14 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: STAGE_COLOUR[h.stage] || B.muted, marginTop: 4 }} />
                {i === history.length - 1 ? null : <span style={{ width: 1, flex: 1, background: B.border, marginTop: 3 }} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <StagePill stage={h.stage} small />
                  <span style={{ fontSize: 11.5, color: B.muted }}>{niceDate(h.moved_on)}</span>
                </div>
                {h.note ? <div style={{ fontSize: 12.5, color: "#333", marginTop: 4, lineHeight: 1.5 }}>{h.note}</div> : null}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SHead>Consent on file</SHead>
        <div style={{ fontSize: 11.5, color: B.muted, marginBottom: 12, lineHeight: 1.55 }}>
          Each use needs its own documented consent. Recording it here does not create it. The signed form must exist and be filed.
        </div>

        {consents.length === 0 ? (
          <div style={{ fontSize: 12.5, color: B.muted }}>Nothing recorded.</div>
        ) : (
          consents.map((c) => {
            const t = CONSENT_TYPES.find((x) => x.id === c.consent_type);
            const gone = !!c.withdrawn_on;
            return (
              <div key={c.id} style={{ border: "1px solid " + (gone ? B.red : B.border), background: gone ? B.redLight : B.white, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: gone ? "#8b0a1c" : B.black, fontFamily: "'Montserrat',sans-serif" }}>
                      {t ? t.label : c.consent_type}
                    </div>
                    <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3, lineHeight: 1.5 }}>
                      {gone
                        ? "Withdrawn " + niceDate(c.withdrawn_on) + ". Anything published under it must be removed within five working days."
                        : "Given " + niceDate(c.granted_on) + (c.granted_by ? " by " + c.granted_by : "") + (c.document_ref ? " · " + c.document_ref : "")}
                    </div>
                  </div>
                  {!gone && coordinator ? (
                    <button style={{ ...btnG, color: B.red, borderColor: B.red, flexShrink: 0 }} onClick={() => withdraw(c.id)} disabled={busy}>
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        {canEdit && available.length > 0 ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid " + B.offWhite }}>
            <Field label="Record another consent">
              <select style={sel} value={newConsent} onChange={(e) => setNewConsent(e.target.value)}>
                <option value="">Choose the use it covers</option>
                {available.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            {newConsent ? (
              <>
                <div style={{ fontSize: 11.5, color: B.muted, marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>
                  {CONSENT_TYPES.find((t) => t.id === newConsent)?.note}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                  <Field label="Given by">
                    <input style={inp} value={consentBy} onChange={(e) => setConsentBy(e.target.value)} placeholder="Parent or guardian name" />
                  </Field>
                  <Field label="Where the form is filed">
                    <input style={inp} value={consentRef} onChange={(e) => setConsentRef(e.target.value)} />
                  </Field>
                </div>
                <button style={btnP} onClick={addConsent} disabled={busy}>Record it</button>
              </>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <SHead>{canEdit ? "Attendance" : "Programmes attended"}</SHead>
        {canEdit ? (
          chapterProgs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: B.muted }}>No dated programmes in this chapter yet, so there is nothing to mark against.</div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: B.muted, marginBottom: 10, lineHeight: 1.55 }}>
                Mark this young person present at a dated chapter programme, or take it back off. One tap saves it.
              </div>
              {chapterProgs.map((pr, i) => {
                const here = attendedIds.has(pr.id);
                return (
                  <div key={pr.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: i === chapterProgs.length - 1 ? "none" : "1px solid " + B.offWhite }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{pr.title || "A programme"}</div>
                      <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2 }}>{niceDate(pr.date)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {here ? (
                        <span style={{ background: B.green, color: B.white, padding: "2px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>Present</span>
                      ) : null}
                      <button style={{ ...btnG, flexShrink: 0 }} onClick={() => toggleAttendance(pr.id, !here)} disabled={busy}>
                        {here ? "Mark absent" : "Mark present"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )
        ) : (
          attendance.length === 0 ? (
            <div style={{ fontSize: 12.5, color: B.muted }}>Nothing recorded yet.</div>
          ) : (
            attendance.map((a, i) => (
              <div key={i} style={{ fontSize: 12.5, color: "#333", padding: "6px 0", borderBottom: i === attendance.length - 1 ? "none" : "1px solid " + B.offWhite }}>
                {a.programs?.title || "A programme"}
                <span style={{ color: B.muted, fontSize: 11.5 }}> · {niceDate(a.attended_on)}</span>
              </div>
            ))
          )
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------
// The section
// ------------------------------------------------------------
export default function ParticipantsSection({ profile, chapters, showToast }) {
  const [people, setPeople] = useState([]);
  const [summary, setSummary] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);

  const canAdd = canAddParticipant(profile);

  const load = useCallback(async () => {
    setLoading(true);
    // Age band is not drawn in the list, so it is not fetched for the list.
    // The detail screen loads the full row when one is opened.
    const { data } = await supabase.from("participants")
      .select("id, full_name, class_level, school, stage, active, chapter_id, chapters(name)")
      .order("full_name")
      .range(0, MAX_ROWS - 1);
    setPeople(data || []);
    const { data: s } = await supabase.rpc("stage_summary", { p_chapter: null });
    setSummary(s || []);
    const { data: w } = await supabase.rpc("consent_withdrawals_outstanding");
    setWithdrawals(w || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Searching still runs across every participant that was loaded. Only the
  // drawing is limited, so nobody can be missed by a search.
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => {
      if (stageFilter && p.stage !== stageFilter) return false;
      if (!needle) return true;
      return [p.full_name, p.school, p.class_level, p.chapters?.name].filter(Boolean).some((v) => v.toLowerCase().includes(needle));
    });
  }, [people, q, stageFilter]);

  // Hooks have to run on every render, so this sits above the early returns
  // rather than down beside the list it feeds.
  const paged = usePaged(matches, q + "\u0000" + stageFilter);

  if (openId) {
    return <ParticipantDetail id={openId} profile={profile} showToast={showToast} onBack={() => { setOpenId(null); load(); }} />;
  }

  if (adding) {
    return <AddParticipant profile={profile} chapters={chapters} showToast={showToast} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />;
  }

  if (loading) return <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13 }}>Loading participants…</Card>;

  const totals = STAGES.map((s) => ({
    stage: s,
    n: summary.filter((r) => r.stage === s).reduce((a, r) => a + r.people, 0),
  }));

  const chapterOverview = showsChapterOverview(profile);

  return (
    <>
      {!chapterOverview ? (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          The young people you added or currently mentor. You will not see the rest of the chapter here.
        </p>
      ) : null}

      {chapterOverview && withdrawals.length > 0 ? (
        <div style={{ background: B.redLight, border: "1px solid " + B.red, borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 12.5, color: "#8b0a1c", lineHeight: 1.55 }}>
          <strong>{withdrawals.length} consent {withdrawals.length === 1 ? "withdrawal needs" : "withdrawals need"} acting on.</strong>
          <div style={{ marginTop: 6 }}>
            {withdrawals.map((w, i) => (
              <div key={i}>
                {w.full_name} withdrew {w.consent_type.replace(/_/g, " ")} consent {w.days_since === 0 ? "today" : w.days_since + " days ago"}. Remove published material within five working days.
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {chapterOverview ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {totals.map((t) => <StatCard key={t.stage} label={t.stage} value={t.n} accent={STAGE_COLOUR[t.stage]} />)}
        </div>
      ) : null}

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, flex: "2 1 200px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, school or chapter…" />
          <select style={{ ...sel, flex: "1 1 130px" }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">Every stage</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {canAdd ? <button style={{ ...btnP, flexShrink: 0 }} onClick={() => setAdding(true)}>Add participant</button> : null}
        </div>
      </Card>

      {people.length >= MAX_ROWS ? (
        <div style={{ background: B.yellowLight, border: "1px solid " + B.yellow, borderRadius: 8, padding: "10px 13px", marginBottom: 12, fontSize: 12, color: "#6b5200", lineHeight: 1.55 }}>
          This is the first {MAX_ROWS} participants by name. Use the search box to find anyone past that.
        </div>
      ) : null}

      {matches.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 30, color: B.muted, fontSize: 13, lineHeight: 1.6 }}>
          {people.length === 0
            ? participantsEmptyCopy(profile)
            : "Nobody matches that."}
        </Card>
      ) : (
        <>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {paged.visible.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              style={{
                display: "block", width: "100%", textAlign: "left", background: B.white,
                border: "none", borderBottom: i === paged.visible.length - 1 ? "none" : "1px solid " + B.offWhite,
                padding: "12px 16px", cursor: "pointer", fontFamily: "'Open Sans',sans-serif",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>
                    {p.full_name}{!p.active ? <span style={{ color: B.muted, fontWeight: 400 }}> · inactive</span> : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: B.muted, marginTop: 2 }}>
                    {p.chapters?.name}
                    {p.class_level ? " · " + p.class_level : ""}
                    {p.school ? " · " + p.school : ""}
                  </div>
                </div>
                <StagePill stage={p.stage} small />
              </div>
            </button>
          ))}
        </Card>
        <ShowMore paged={paged} noun="more participants" />
        </>
      )}
    </>
  );
}
