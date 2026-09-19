import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, sel, ta, btnP } from "../theme.js";
import { Card, Field } from "../components/ui.jsx";
import { ROLE_KINDS, roleKind, validate } from "../lib/application.js";

// Complete My Volunteer Record.
//
// BATCH24-MARKER complete-record
//
// The same YCDI-SAF-005 3.2 questions ApplyScreen.jsx asks a brand new
// applicant, offered to a volunteer who was already here before that
// form existed. Two things make this different from ApplyScreen:
//
// - It lives behind sign-in, inside the hub, so name and chapter are
//   read off the caller's own profile rather than typed in. Editing
//   either is locked to admins everywhere else in the hub for the same
//   reason it is not offered as a field here.
// - Submitting does not finish anything. It creates an ordinary
//   application on the Applications screen, flagged for the
//   coordinator as a retrospective record, reviewed the same way a
//   fresh application is. See Batch 24's SQL file for why.
//
// Two more things worth knowing before touching this file.
//
// - Somebody who genuinely applied through the front door before ever
//   being appointed should never see this. The SQL side checks that on
//   their behalf, matching by the caller's own linked_profile_id first
//   and their email second, since the hub does not yet link an
//   application to a profile at the point of appointment. Nothing here
//   needs to know which way it was matched, it is `existing` either way.
// - This renders nothing at all, not even a loading state, once a
//   record is already on file. The whole point is to ask for something
//   missing, so once nothing is missing it should take up no space on
//   the profile page.

const BLANK = {
  role_sought: "school_contact",
  date_of_birth: "",
  phone: "",
  email: "",
  home_address: "",
  address_since: "",
  occupation: "",
  employment_history: "",
  youth_experience: "",
  church_name: "",
  church_location: "",
  pastor_name: "",
  pastor_contact: "",
  referee1_name: "",
  referee1_relationship: "",
  referee1_contact: "",
  referee1_is_church_leader: false,
  referee2_name: "",
  referee2_relationship: "",
  referee2_contact: "",
  referee2_is_church_leader: false,
  faith_statement: "",
  motivation: "",
  disclosure_made: false,
  has_disclosure: false,
  disclosure_detail: "",
  consent_references: false,
};

function Section({ title, blurb, children }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 4px", fontFamily: "'Montserrat',sans-serif", fontSize: 15, color: B.blue }}>{title}</h2>
      {blurb ? <p style={{ margin: "0 0 14px", fontSize: 12.5, color: B.muted, lineHeight: 1.65 }}>{blurb}</p> : null}
      {children}
    </Card>
  );
}

function Err({ children }) {
  if (!children) return null;
  return (
    <div role="alert" style={{ fontSize: 12, color: B.red, marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

export default function CompleteVolunteerRecordSection({ profile, showToast }) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: statusRow }, { data: userData }] = await Promise.all([
        supabase.rpc("my_backfill_status"),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      if (statusRow && statusRow.length) {
        setExisting(statusRow[0]);
      } else {
        const email = userData && userData.user ? userData.user.email : "";
        setForm((f) => ({ ...f, email: email || "" }));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  }

  const kind = roleKind(form.role_sought);

  async function submit() {
    // full_name is checked by validate() but not shown here, since it
    // comes from the profile server-side. Passing the profile's name
    // through keeps that one check meaningful without a field nobody
    // can edit sitting on the screen.
    const check = validate({ ...form, full_name: profile.full_name });
    setErrors(check.errors);
    setWarnings(check.warnings);
    if (!check.ok) {
      setFailed("There are a few things still to fill in. They are marked below.");
      const first = Object.keys(check.errors)[0];
      const el = document.querySelector(`[name="${first}"]`);
      if (el && el.focus) el.focus();
      return;
    }
    setFailed("");
    setSending(true);
    const { data, error } = await supabase.rpc("submit_backfill_application", { payload: form });
    setSending(false);
    if (error) {
      setFailed(error.message || "Something went wrong sending this. Please try again in a moment.");
      return;
    }
    setDone(data && data.reference ? data.reference : "sent");
    if (showToast) showToast("Record sent to your coordinator for review.");
  }

  // While we're still checking, and once we know a record already exists
  // (whether it was there before this page loaded, or was matched just
  // now by email, see the SQL side), this renders nothing at all. The
  // point of this section is to ask for something missing, so once
  // nothing is missing it should not take up space on the profile.
  if (loading || existing) {
    return null;
  }

  // Shown once, right after a successful submit, so the person isn't left
  // wondering whether it went through. It will not appear again after
  // this: on the next visit `existing` will be set instead.
  if (done) {
    return (
      <Card>
        <h1 style={{ margin: "0 0 10px", fontFamily: "'Montserrat',sans-serif", fontSize: 18, color: B.blue }}>
          Thank you. We have it.
        </h1>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: B.black, lineHeight: 1.7 }}>
          Reference <strong>{done}</strong>.
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: B.muted, lineHeight: 1.7 }}>
          Your coordinator will read this and review it, the same as any application.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontFamily: "'Montserrat',sans-serif", fontSize: 18, color: B.blue }}>
          Complete my volunteer record
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: B.black, lineHeight: 1.75 }}>
          When you joined, this form did not exist yet, so a few things YCDI now asks every
          volunteer were never collected from you. Filling this in brings your file up to the
          same standard as everyone who has applied since, under YCDI-SAF-005. It takes about
          ten minutes.
        </p>
      </Card>

      <Section title="What you would like to do" blurb="This decides how much screening the role needs, so it is worth getting right.">
        <div role="radiogroup" aria-label="What you would like to do" style={{ display: "grid", gap: 10 }}>
          {ROLE_KINDS.map((r) => (
            <label key={r.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", border: `1px solid ${form.role_sought === r.key ? B.blue : B.border}`, borderRadius: 8, background: form.role_sought === r.key ? B.blueLight : B.white }}>
              <input type="radio" name="role_sought" checked={form.role_sought === r.key} onChange={() => set("role_sought", r.key)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span>
                <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{r.label}</span>
                <span style={{ display: "block", fontSize: 12.5, color: B.muted, marginTop: 2, lineHeight: 1.6 }}>{r.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="About you" blurb="Your name and chapter are already on your profile, so only what's missing is asked here.">
        <Field label="Date of birth"><input name="date_of_birth" style={inp} type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>

        <Field label="Phone number" required><input name="phone" style={inp} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Err>{errors.phone}</Err>

        <Field label="Email address" required hint="Prefilled from your login. Change it if you'd rather we used another."><input name="email" style={inp} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Err>{errors.email}</Err>

        <Field label="Home address"><textarea name="home_address" style={ta} value={form.home_address} onChange={(e) => set("home_address", e.target.value)} /></Field>
        <Field label="How long have you lived there?" hint="Roughly is fine."><input name="address_since" style={inp} value={form.address_since} onChange={(e) => set("address_since", e.target.value)} /></Field>
      </Section>

      <Section title="Work and experience">
        <Field label="Current occupation"><input name="occupation" style={inp} value={form.occupation} onChange={(e) => set("occupation", e.target.value)} /></Field>
        <Field label="Employment history" hint="Briefly. Where you have worked and roughly when."><textarea name="employment_history" style={ta} value={form.employment_history} onChange={(e) => set("employment_history", e.target.value)} /></Field>
        <Field label="Experience with young people, ministry or community work"><textarea name="youth_experience" style={ta} value={form.youth_experience} onChange={(e) => set("youth_experience", e.target.value)} /></Field>
      </Section>

      <Section title="Your church">
        <Field label="Church you attend" required><input name="church_name" style={inp} value={form.church_name} onChange={(e) => set("church_name", e.target.value)} /></Field>
        <Err>{errors.church_name}</Err>
        <Field label="Where is it?"><input name="church_location" style={inp} value={form.church_location} onChange={(e) => set("church_location", e.target.value)} /></Field>
        <Field label="Your pastor or elder's name"><input name="pastor_name" style={inp} value={form.pastor_name} onChange={(e) => set("pastor_name", e.target.value)} /></Field>
        <Field label="How can we reach them?"><input name="pastor_contact" style={inp} value={form.pastor_contact} onChange={(e) => set("pastor_contact", e.target.value)} /></Field>
      </Section>

      <Section title="Referees" blurb={`${kind.referees === 1 ? "One referee" : "Two referees"} please, at least one a pastor, elder or church leader. Not family members.`}>
        <h3 style={{ margin: "0 0 10px", fontSize: 12.5, fontFamily: "'Montserrat',sans-serif", color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>First referee</h3>
        <Field label="Name" required><input name="referee1_name" style={inp} value={form.referee1_name} onChange={(e) => set("referee1_name", e.target.value)} /></Field>
        <Field label="How do they know you?"><input name="referee1_relationship" style={inp} value={form.referee1_relationship} onChange={(e) => set("referee1_relationship", e.target.value)} /></Field>
        <Field label="Phone or email" required><input name="referee1_contact" style={inp} value={form.referee1_contact} onChange={(e) => set("referee1_contact", e.target.value)} /></Field>
        <Err>{errors.referee1_name}</Err>
        <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, marginBottom: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={form.referee1_is_church_leader} onChange={(e) => set("referee1_is_church_leader", e.target.checked)} style={{ width: 17, height: 17, flexShrink: 0 }} />
          This referee is a pastor, elder or church leader
        </label>
        <Err>{errors.referee1_is_church_leader}</Err>

        {kind.referees > 1 ? (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${B.offWhite}` }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12.5, fontFamily: "'Montserrat',sans-serif", color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Second referee</h3>
            <Field label="Name" required><input name="referee2_name" style={inp} value={form.referee2_name} onChange={(e) => set("referee2_name", e.target.value)} /></Field>
            <Field label="How do they know you?"><input name="referee2_relationship" style={inp} value={form.referee2_relationship} onChange={(e) => set("referee2_relationship", e.target.value)} /></Field>
            <Field label="Phone or email" required><input name="referee2_contact" style={inp} value={form.referee2_contact} onChange={(e) => set("referee2_contact", e.target.value)} /></Field>
            <Err>{errors.referee2_name}</Err>
            <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.referee2_is_church_leader} onChange={(e) => set("referee2_is_church_leader", e.target.checked)} style={{ width: 17, height: 17, flexShrink: 0 }} />
              This referee is a pastor, elder or church leader
            </label>
          </div>
        ) : null}
      </Section>

      <Section title="Your faith and why you serve">
        <Field label="Tell us something about your faith"><textarea name="faith_statement" style={{ ...ta, minHeight: 110 }} value={form.faith_statement} onChange={(e) => set("faith_statement", e.target.value)} /></Field>
        <Field label="Why do you volunteer with YCDI?"><textarea name="motivation" style={{ ...ta, minHeight: 110 }} value={form.motivation} onChange={(e) => set("motivation", e.target.value)} /></Field>
      </Section>

      <Section title="Declaration" blurb="Every volunteer answers this, including those already serving. Answering yes does not end anything. Not answering does.">
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
          <legend style={{ fontSize: 13, color: B.black, lineHeight: 1.7, padding: 0, marginBottom: 10 }}>
            Do you have any prior criminal conviction or caution, any disciplinary action taken
            against you, or any past or pending safeguarding concern, allegation or investigation?
          </legend>
          <div style={{ display: "flex", gap: 18 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={form.disclosure_made && !form.has_disclosure} onChange={() => setForm((f) => ({ ...f, disclosure_made: true, has_disclosure: false, disclosure_detail: "" }))} />
              No
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={form.disclosure_made && form.has_disclosure} onChange={() => setForm((f) => ({ ...f, disclosure_made: true, has_disclosure: true }))} />
              Yes
            </label>
          </div>
        </fieldset>
        <Err>{errors.disclosure_made}</Err>

        {form.has_disclosure ? (
          <>
            <Field label="Please tell us about it" required hint="Briefly is fine. Somebody will talk it through with you.">
              <textarea name="disclosure_detail" style={ta} value={form.disclosure_detail} onChange={(e) => set("disclosure_detail", e.target.value)} />
            </Field>
            <Err>{errors.disclosure_detail}</Err>
          </>
        ) : null}

        <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, lineHeight: 1.65, cursor: "pointer", marginTop: 6 }}>
          <input type="checkbox" checked={form.consent_references} onChange={(e) => set("consent_references", e.target.checked)} style={{ width: 17, height: 17, flexShrink: 0, marginTop: 2 }} />
          I confirm the above is true and complete, and I give YCDI permission to contact my
          referees and carry out the checks this role requires.
        </label>
        <Err>{errors.consent_references}</Err>
      </Section>

      {warnings.length ? (
        <Card style={{ marginBottom: 14, background: "#FFF8E1", border: "1px solid #FCDE02" }}>
          {warnings.map((w) => <p key={w} style={{ margin: 0, fontSize: 13, color: B.black, lineHeight: 1.6 }}>{w}</p>)}
        </Card>
      ) : null}

      {failed ? (
        <div role="alert" style={{ background: B.red, color: B.white, padding: "11px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          {failed}
        </div>
      ) : null}

      <button onClick={submit} disabled={sending} style={{ ...btnP, width: "100%", padding: "13px 20px", fontSize: 14, opacity: sending ? 0.6 : 1 }}>
        {sending ? "Sending…" : "Send my record"}
      </button>

      <p style={{ fontSize: 11.5, color: B.muted, textAlign: "center", margin: "14px 0 0", lineHeight: 1.6 }}>
        Read by your coordinator for screening purposes under YCDI-SAF-005, the same as any
        volunteer application.
      </p>
    </div>
  );
}
