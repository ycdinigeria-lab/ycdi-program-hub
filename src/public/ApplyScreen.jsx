import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase.js";
import { B, GFONTS, inp, sel, ta, btnP } from "../theme.js";
import { Card, Field, YCDILogo } from "../components/ui.jsx";
import { A11Y_CSS, srOnly } from "../lib/a11y.js";
import { ROLE_KINDS, roleKind, validate } from "../lib/application.js";

// The volunteer application form.
//
// BATCH7A-MARKER apply-screen
//
// This is the one page in the hub that anybody can reach without signing
// in, which shapes almost everything about it. It never asks Supabase for
// anything except the chapter list and the submit function, both of which
// hand back exactly what a stranger is allowed to see and nothing else.
// It reads no session, renders no navigation, and cannot be used as a way
// into the rest of the app.
//
// It is also long. That is not an oversight: YCDI-SAF-005 section 3.2
// sets out what has to be collected before somebody can be put in front
// of children, and shortening it would mean collecting less than the
// policy requires. What can be done is make it feel like a conversation
// rather than a government form, which is what the grouping below is for.

const BLANK = {
  role_sought: "school_contact",
  chapter_id: "",
  full_name: "",
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
      {blurb ? (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: B.muted, lineHeight: 1.65 }}>{blurb}</p>
      ) : null}
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

export default function ApplyScreen() {
  const [form, setForm] = useState(BLANK);
  const [chapters, setChapters] = useState([]);
  const [errors, setErrors] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    supabase.rpc("public_chapter_list").then(({ data }) => setChapters(data || []));
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  }

  const kind = roleKind(form.role_sought);

  async function submit() {
    const check = validate(form);
    setErrors(check.errors);
    setWarnings(check.warnings);
    if (!check.ok) {
      setFailed("There are a few things still to fill in. They are marked below.");
      // Sending focus to the first problem, rather than leaving somebody
      // to hunt down a long form for a red line they cannot see.
      const first = Object.keys(check.errors)[0];
      const el = document.querySelector(`[name="${first}"]`);
      if (el && el.focus) el.focus();
      return;
    }
    setFailed("");
    setSending(true);
    const { data, error } = await supabase.rpc("submit_volunteer_application", { payload: form });
    setSending(false);
    if (error) {
      setFailed(error.message || "Something went wrong sending this. Please try again in a moment.");
      return;
    }
    setDone(data && data.reference ? data.reference : "sent");
  }

  if (done) {
    return (
      <Shell>
        <Card>
          <h1 style={{ margin: "0 0 10px", fontFamily: "'Montserrat',sans-serif", fontSize: 20, color: B.blue }}>
            Thank you. We have it.
          </h1>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: B.black, lineHeight: 1.7 }}>
            Your application reference is <strong>{done}</strong>. Keep it somewhere, it is
            the quickest way for us to find you if you get in touch.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: B.muted, lineHeight: 1.7 }}>
            A coordinator will read it and be in touch. We will contact your referees before
            any decision is made, as you have given us permission to do. If you are not
            appointed, we will tell you within two weeks of the decision.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontFamily: "'Montserrat',sans-serif", fontSize: 21, color: B.blue }}>
          Volunteer with YCDI
        </h1>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: B.black, lineHeight: 1.75 }}>
          We are glad you are here. This form is longer than most, and there is a reason for
          that: much of what YCDI does puts volunteers in front of young people, and we screen
          carefully before that happens. Taking the time now is part of how we keep children safe.
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: B.muted, lineHeight: 1.7 }}>
          It takes about fifteen minutes. Have your two referees' contact details to hand.
        </p>
      </Card>

      <Section
        title="What you would like to do"
        blurb="This decides how much screening the role needs, so it is worth getting right."
      >
        <div role="radiogroup" aria-label="What you would like to do" style={{ display: "grid", gap: 10 }}>
          {ROLE_KINDS.map((r) => (
            <label key={r.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", border: `1px solid ${form.role_sought === r.key ? B.blue : B.border}`, borderRadius: 8, background: form.role_sought === r.key ? B.blueLight : B.white }}>
              <input
                type="radio"
                name="role_sought"
                checked={form.role_sought === r.key}
                onChange={() => set("role_sought", r.key)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span>
                <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: B.black, fontFamily: "'Montserrat',sans-serif" }}>{r.label}</span>
                <span style={{ display: "block", fontSize: 12.5, color: B.muted, marginTop: 2, lineHeight: 1.6 }}>{r.blurb}</span>
              </span>
            </label>
          ))}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
          This role needs {kind.referees === 1 ? "one referee" : "two referees"}, and an
          interview is {kind.interview}.
        </p>
      </Section>

      <Section title="About you">
        <Field label="Full legal name" required>
          <input name="full_name" style={inp} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Err>{errors.full_name}</Err>

        <Field label="Date of birth">
          <input name="date_of_birth" style={inp} type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        </Field>

        <Field label="Phone number" required>
          <input name="phone" style={inp} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Err>{errors.phone}</Err>

        <Field label="Email address" required hint="We reply here, so please check it.">
          <input name="email" style={inp} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Err>{errors.email}</Err>

        <Field label="Which chapter are you applying to?">
          <select name="chapter_id" style={sel} value={form.chapter_id} onChange={(e) => set("chapter_id", e.target.value)}>
            <option value="">I am not sure</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="Home address">
          <textarea name="home_address" style={ta} value={form.home_address} onChange={(e) => set("home_address", e.target.value)} />
        </Field>

        <Field label="How long have you lived there?" hint="Roughly is fine. Two years, since 2019, that sort of thing.">
          <input name="address_since" style={inp} value={form.address_since} onChange={(e) => set("address_since", e.target.value)} />
        </Field>
      </Section>

      <Section title="Work and experience">
        <Field label="Current occupation">
          <input name="occupation" style={inp} value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </Field>
        <Field label="Employment history" hint="Briefly. Where you have worked and roughly when.">
          <textarea name="employment_history" style={ta} value={form.employment_history} onChange={(e) => set("employment_history", e.target.value)} />
        </Field>
        <Field label="Experience with young people, ministry or community work" hint="Formal or informal, paid or not. If you have none, say so, it is not a barrier.">
          <textarea name="youth_experience" style={ta} value={form.youth_experience} onChange={(e) => set("youth_experience", e.target.value)} />
        </Field>
      </Section>

      <Section title="Your church">
        <Field label="Church you attend" required>
          <input name="church_name" style={inp} value={form.church_name} onChange={(e) => set("church_name", e.target.value)} />
        </Field>
        <Err>{errors.church_name}</Err>
        <Field label="Where is it?">
          <input name="church_location" style={inp} value={form.church_location} onChange={(e) => set("church_location", e.target.value)} />
        </Field>
        <Field label="Your pastor or elder's name">
          <input name="pastor_name" style={inp} value={form.pastor_name} onChange={(e) => set("pastor_name", e.target.value)} />
        </Field>
        <Field label="How can we reach them?">
          <input name="pastor_contact" style={inp} value={form.pastor_contact} onChange={(e) => set("pastor_contact", e.target.value)} />
        </Field>
      </Section>

      <Section
        title="Referees"
        blurb={`${kind.referees === 1 ? "One referee" : "Two referees"} please, and at least one must be a pastor, elder or church leader. Not family members. We will contact them.`}
      >
        <h3 style={{ margin: "0 0 10px", fontSize: 12.5, fontFamily: "'Montserrat',sans-serif", color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>First referee</h3>
        <Field label="Name" required>
          <input name="referee1_name" style={inp} value={form.referee1_name} onChange={(e) => set("referee1_name", e.target.value)} />
        </Field>
        <Field label="How do they know you?">
          <input name="referee1_relationship" style={inp} value={form.referee1_relationship} onChange={(e) => set("referee1_relationship", e.target.value)} />
        </Field>
        <Field label="Phone or email" required>
          <input name="referee1_contact" style={inp} value={form.referee1_contact} onChange={(e) => set("referee1_contact", e.target.value)} />
        </Field>
        <Err>{errors.referee1_name}</Err>
        <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, marginBottom: 6, cursor: "pointer" }}>
          <input
            name="referee1_is_church_leader"
            type="checkbox"
            checked={form.referee1_is_church_leader}
            onChange={(e) => set("referee1_is_church_leader", e.target.checked)}
            style={{ width: 17, height: 17, flexShrink: 0 }}
          />
          This referee is a pastor, elder or church leader
        </label>
        <Err>{errors.referee1_is_church_leader}</Err>

        {kind.referees > 1 ? (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${B.offWhite}` }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12.5, fontFamily: "'Montserrat',sans-serif", color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Second referee</h3>
            <Field label="Name" required>
              <input name="referee2_name" style={inp} value={form.referee2_name} onChange={(e) => set("referee2_name", e.target.value)} />
            </Field>
            <Field label="How do they know you?">
              <input name="referee2_relationship" style={inp} value={form.referee2_relationship} onChange={(e) => set("referee2_relationship", e.target.value)} />
            </Field>
            <Field label="Phone or email" required>
              <input name="referee2_contact" style={inp} value={form.referee2_contact} onChange={(e) => set("referee2_contact", e.target.value)} />
            </Field>
            <Err>{errors.referee2_name}</Err>
            <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input
                name="referee2_is_church_leader"
                type="checkbox"
                checked={form.referee2_is_church_leader}
                onChange={(e) => set("referee2_is_church_leader", e.target.checked)}
                style={{ width: 17, height: 17, flexShrink: 0 }}
              />
              This referee is a pastor, elder or church leader
            </label>
          </div>
        ) : null}
      </Section>

      <Section title="Your faith and why you want to serve">
        <Field label="Tell us something about your faith">
          <textarea name="faith_statement" style={{ ...ta, minHeight: 110 }} value={form.faith_statement} onChange={(e) => set("faith_statement", e.target.value)} />
        </Field>
        <Field label="Why do you want to volunteer with YCDI?">
          <textarea name="motivation" style={{ ...ta, minHeight: 110 }} value={form.motivation} onChange={(e) => set("motivation", e.target.value)} />
        </Field>
      </Section>

      <Section
        title="Declaration"
        blurb="Everyone applying answers this, and answering yes does not end your application. What matters is that you tell us. Not telling us does end it."
      >
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
          <legend style={{ fontSize: 13, color: B.black, lineHeight: 1.7, padding: 0, marginBottom: 10 }}>
            Do you have any prior criminal conviction or caution, any disciplinary action taken
            against you, or any past or pending safeguarding concern, allegation or investigation?
          </legend>
          <div style={{ display: "flex", gap: 18 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input
                name="disclosure_made"
                type="radio"
                checked={form.disclosure_made && !form.has_disclosure}
                onChange={() => setForm((f) => ({ ...f, disclosure_made: true, has_disclosure: false, disclosure_detail: "" }))}
              />
              No
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input
                type="radio"
                checked={form.disclosure_made && form.has_disclosure}
                onChange={() => setForm((f) => ({ ...f, disclosure_made: true, has_disclosure: true }))}
              />
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
          <input
            name="consent_references"
            type="checkbox"
            checked={form.consent_references}
            onChange={(e) => set("consent_references", e.target.checked)}
            style={{ width: 17, height: 17, flexShrink: 0, marginTop: 2 }}
          />
          I confirm the above is true and complete, and I give YCDI permission to contact my
          referees and carry out the checks this role requires.
        </label>
        <Err>{errors.consent_references}</Err>
      </Section>

      {warnings.length ? (
        <Card style={{ marginBottom: 14, background: "#FFF8E1", border: "1px solid #FCDE02" }}>
          {warnings.map((w) => (
            <p key={w} style={{ margin: 0, fontSize: 13, color: B.black, lineHeight: 1.6 }}>{w}</p>
          ))}
        </Card>
      ) : null}

      {failed ? (
        <div role="alert" style={{ background: B.red, color: B.white, padding: "11px 14px", borderRadius: 8, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          {failed}
        </div>
      ) : null}

      <button onClick={submit} disabled={sending} style={{ ...btnP, width: "100%", padding: "13px 20px", fontSize: 14, opacity: sending ? 0.6 : 1 }}>
        {sending ? "Sending…" : "Send my application"}
      </button>

      <p style={{ fontSize: 11.5, color: B.muted, textAlign: "center", margin: "14px 0 0", lineHeight: 1.6 }}>
        What you write here is read by YCDI coordinators for the purpose of screening only, and
        kept in line with YCDI-SAF-005. If you are not appointed, it is destroyed after twelve months.
      </p>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: B.offWhite, fontFamily: "'Open Sans',sans-serif" }}>
      <style>{GFONTS}</style>
      <style>{A11Y_CSS}</style>
      <a className="ycdi-skip" href="#apply-main">Skip to the form</a>
      <div className="ycdi-onblue" style={{ background: B.blue, padding: "14px 16px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <YCDILogo height={34} dark />
        </div>
      </div>
      <main id="apply-main" tabIndex={-1} style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 60px", outline: "none" }}>
        {children}
      </main>
      <div style={srOnly} aria-live="polite" />
    </div>
  );
}
