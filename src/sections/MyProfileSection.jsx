import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, ta, btnP, btnG } from "../theme.js";
import { compressImage } from "../lib/imageCompress.js";
import {
  ONBOARDING_STEPS,
  onboardingProgress,
  describeRecord,
  certificateDue,
  statusLabel,
  statusTone,
  formatDay,
} from "../lib/volunteer.js";

// Your own profile. The only screen in the hub where a person changes
// something about themselves rather than about YCDI.
//
// Role and chapter are shown but not editable. They decide what a person
// can read across safeguarding, participants and the KPI report, so
// letting somebody set their own would let them set their own access.
// The database refuses the change as well; this screen just explains why
// rather than presenting a field that silently fails.
//
// BATCH6A-MARKER my-profile

const TONE = {
  good: { bg: "#E8F5E9", text: "#1a6b2f" },
  pending: { bg: B.blueLight, text: "#065f87" },
  warn: { bg: B.yellowLight, text: "#7a5c00" },
  bad: { bg: B.redLight, text: "#8b0a1c" },
  closed: { bg: B.offWhite, text: B.muted },
};

const card = {
  background: B.white,
  border: `1px solid ${B.border}`,
  borderRadius: 12,
  padding: "18px 20px",
  marginBottom: 16,
};

const legend = {
  fontFamily: "'Montserrat',sans-serif",
  fontWeight: 700,
  fontSize: 15,
  color: B.black,
  margin: "0 0 4px",
};

const help = { fontSize: 12.5, color: B.muted, lineHeight: 1.6, margin: "0 0 16px" };

function Label({ htmlFor, children, hint }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 700,
        color: B.muted,
        marginBottom: 5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontFamily: "'Montserrat',sans-serif",
      }}
    >
      {children}
      {hint ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}>{hint}</span> : null}
    </label>
  );
}

function Badge({ tone, children }) {
  const t = TONE[tone] || TONE.closed;
  return (
    <span style={{ background: t.bg, color: t.text, padding: "3px 11px", borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>
      {children}
    </span>
  );
}

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function MyProfileSection({ profile, showToast }) {
  const [card1, setCard1] = useState(null);
  const [record, setRecord] = useState(null);
  const [photoSrc, setPhotoSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const fileRef = useRef();

  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    phone: "",
    phone_hidden: false,
    availability: "",
    skills: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cardRows, error: cardErr }, { data: recRows }] = await Promise.all([
      supabase.rpc("my_profile_card"),
      supabase.rpc("my_volunteer_record"),
    ]);

    if (cardErr) {
      showToast(cardErr.message, "error");
      setLoading(false);
      return;
    }

    const c = (cardRows || [])[0] || null;
    const r = (recRows || [])[0] || null;
    setCard1(c);
    setRecord(r);
    setForm({
      full_name: c?.full_name || profile.full_name || "",
      bio: c?.bio || "",
      phone: c?.phone || "",
      phone_hidden: !!c?.phone_hidden,
      availability: r?.availability || "",
      skills: r?.skills || "",
    });

    // Photos sit in a private bucket, so the stored path has to be signed
    // before it will load.
    const marker = "/member-photos/";
    if (c?.photo_url && c.photo_url.includes(marker)) {
      const path = c.photo_url.slice(c.photo_url.indexOf(marker) + marker.length);
      const { data: signed } = await supabase.storage.from("member-photos").createSignedUrl(path, 3600);
      setPhotoSrc(signed?.signedUrl || "");
    } else {
      setPhotoSrc(c?.photo_url || "");
    }

    setLoading(false);
  }, [profile.full_name, showToast]);

  useEffect(() => { load(); }, [load]);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      showToast("That image is over 5MB. Please choose a smaller one.", "error");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function uploadPhoto(original) {
    const small = await compressImage(original, { maxEdge: 640 });
    const ext = (small.name?.split(".").pop() || "jpg").toLowerCase();
    // The folder is the account id. That is what the storage rule checks,
    // so a person can replace their own photo and nobody else's.
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("member-photos")
      .upload(path, small, { upsert: true, cacheControl: "3600" });
    if (error) throw new Error("Photo upload failed: " + error.message);
    return supabase.storage.from("member-photos").getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    if (!form.full_name.trim()) {
      showToast("A name is needed.", "error");
      return;
    }
    setSaving(true);
    try {
      let photo_url = null;
      if (file) photo_url = await uploadPhoto(file);

      const { error } = await supabase.rpc("update_my_profile", {
        p_full_name: form.full_name.trim(),
        p_bio: form.bio,
        p_photo_url: photo_url,
        p_phone: form.phone,
        p_phone_hidden: form.phone_hidden,
      });
      if (error) throw error;

      const { error: vErr } = await supabase.rpc("update_my_volunteer_details", {
        p_availability: form.availability,
        p_skills: form.skills,
      });
      if (vErr) throw vErr;

      setFile(null);
      setPreview("");
      await load();
      showToast("Your profile has been updated.");
    } catch (e) {
      showToast(e.message || "Something went wrong saving that.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: "40px 20px", textAlign: "center", color: B.muted, fontSize: 13 }}>Loading…</div>;
  }

  if (!card1) {
    return (
      <div style={card}>
        <h3 style={legend}>No directory card yet</h3>
        <p style={{ ...help, marginBottom: 0 }}>
          Your account is approved but your directory card has not been created. Ask an admin to
          take a look. Until then there is nothing here to edit.
        </p>
      </div>
    );
  }

  const shown = preview || photoSrc;
  const progress = record ? onboardingProgress(record) : null;
  const dueCert = record ? certificateDue(record) : false;

  return (
    <div style={{ fontFamily: "'Open Sans',sans-serif", maxWidth: 620 }}>

      {/* ---- Who you are ---- */}
      <section style={card} aria-labelledby="prof-you">
        <h3 id="prof-you" style={legend}>Your details</h3>
        <p style={help}>Everything in this box is yours to change.</p>

        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          {shown ? (
            <img src={shown} alt="Your profile photo" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: "50%", background: B.blue, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 24 }}>
              {initials(form.full_name)}
            </div>
          )}
          <div>
            <button type="button" onClick={() => fileRef.current?.click()} style={{ ...btnG, color: B.blue, borderColor: B.blue, fontWeight: 700 }}>
              {shown ? "Change photo" : "Add a photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={pickFile}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
              aria-label="Choose a profile photo"
            />
            <div style={{ fontSize: 11.5, color: B.muted, marginTop: 6 }}>
              Shrunk on your phone before it is sent, so it will not eat your data.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <Label htmlFor="p-name">Full name</Label>
            <input id="p-name" style={inp} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </div>

          <div>
            <Label htmlFor="p-phone">Phone number</Label>
            <input id="p-phone" style={inp} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234…" inputMode="tel" />
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 10, fontSize: 12.5, color: "#4B5563", lineHeight: 1.55, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.phone_hidden}
                onChange={(e) => set("phone_hidden", e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                Hide my phone number from everyone.
                <span style={{ display: "block", color: B.muted, fontSize: 11.5, marginTop: 2 }}>
                  This means everyone, including admins and the National Coordinator. Your email
                  address stays visible to your chapter so people can still reach you.
                </span>
              </span>
            </label>
          </div>

          <div>
            <Label htmlFor="p-bio">About you <span style={{ fontWeight: 400 }}>(optional)</span></Label>
            <textarea id="p-bio" style={ta} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="A sentence or two for your directory card." />
          </div>
        </div>
      </section>

      {/* ---- What you cannot change ---- */}
      <section style={{ ...card, background: B.offWhite }} aria-labelledby="prof-locked">
        <h3 id="prof-locked" style={legend}>Set by your coordinator</h3>
        <p style={help}>
          These two decide what you are able to see in the hub, so they are changed by an admin
          rather than by you. If either is wrong, say so and it will be corrected.
        </p>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", fontSize: 13 }}>
          <dt style={{ color: B.muted }}>Role</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>
            {profile.role === "NC" ? "National Coordinator" : profile.role === "RC" ? "Regional Coordinator" : "Team Member"}
            {profile.is_admin ? " (admin)" : ""}
          </dd>
          <dt style={{ color: B.muted }}>Chapter</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{card1.chapter_name || "National leadership"}</dd>
          <dt style={{ color: B.muted }}>Email</dt>
          <dd style={{ margin: 0, fontWeight: 600, wordBreak: "break-all" }}>{card1.email || "Not recorded"}</dd>
        </dl>
      </section>

      {/* ---- Volunteer record ---- */}
      <section style={card} aria-labelledby="prof-vol">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <h3 id="prof-vol" style={{ ...legend, margin: 0 }}>Your volunteer record</h3>
          {record ? <Badge tone={statusTone(record.status)}>{statusLabel(record.status)}</Badge> : null}
        </div>
        <p style={help}>{describeRecord(record)}</p>

        {dueCert ? (
          <p style={{ background: B.yellowLight, border: `1px solid ${B.yellow}`, borderRadius: 8, padding: "10px 13px", fontSize: 12.5, color: "#7a5c00", lineHeight: 1.6, margin: "0 0 16px" }}>
            You have passed twelve months of service, which qualifies you for a Certificate of
            Service under the Volunteer Handbook. Your coordinator issues it.
          </p>
        ) : null}

        {record && record.role_names && record.role_names.length ? (
          <div style={{ marginBottom: 16 }}>
            <Label>Serving as</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {record.role_names.map((r) => (
                <span key={r} style={{ background: B.blueLight, color: "#065f87", padding: "4px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{r}</span>
              ))}
            </div>
          </div>
        ) : null}

        {record && record.mentor_name ? (
          <div style={{ marginBottom: 16, fontSize: 13 }}>
            <Label>Your mentor</Label>
            {record.mentor_name}
          </div>
        ) : null}

        {progress ? (
          <div style={{ marginBottom: 18 }}>
            <Label>Joining steps <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({progress.done} of {progress.total} recorded)</span></Label>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 7 }}>
              {progress.steps.map((s) => (
                <li key={s.key} style={{ display: "flex", alignItems: "baseline", gap: 9, fontSize: 12.5 }}>
                  <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: "50%", flexShrink: 0, alignSelf: "center", background: s.date ? "#1a6b2f" : B.offWhite, border: s.date ? "none" : `1px solid ${B.border}` }} />
                  <span style={{ fontWeight: s.date ? 600 : 400, color: s.date ? B.black : B.muted }}>
                    {s.label}
                    <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                      {s.date ? " completed" : " not yet recorded"}
                    </span>
                  </span>
                  <span style={{ color: B.muted, marginLeft: "auto", fontSize: 11.5 }}>{s.date ? formatDay(s.date) : "Not yet"}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <Label htmlFor="p-avail">When you are free to serve</Label>
            <textarea id="p-avail" style={{ ...ta, minHeight: 62 }} value={form.availability} onChange={(e) => set("availability", e.target.value)} placeholder="Saturday mornings, and weekday evenings after 6." />
          </div>
          <div>
            <Label htmlFor="p-skills">What you are good at</Label>
            <textarea id="p-skills" style={{ ...ta, minHeight: 62 }} value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="Teaching teenagers, sound engineering, graphic design." />
          </div>
        </div>
        <p style={{ ...help, margin: "12px 0 0" }}>
          These two are yours to keep current. The dates and status above are recorded by your
          coordinator.
        </p>
      </section>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingBottom: 8 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={load} disabled={saving} style={btnG}>Undo my edits</button>
      </div>
    </div>
  );
}
