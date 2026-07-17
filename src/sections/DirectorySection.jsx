import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B } from "../theme.js";

const NAT = "National Leadership";

const ICON = {
  pin: "M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z",
  mail: "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v.5l8 5 8-5V6l-8 5z",
  phone: "M6.6 10.8a15.5 15.5 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.57 3.6 1 1 0 01-.24 1z",
  pencil: "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75z",
  trash: "M6 7h12l-1 14H7zM9 4h6l1 2H8zM4 6h16v2H4z",
  camera: "M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM9 3l-1.8 2H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2h-3.2L15 3z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
  close: "M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.7 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z",
};
const Icon = ({ d, size = 14, color = B.muted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d={d} /></svg>
);

const fieldInput = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${B.border}`, fontSize: 13, fontFamily: "'Open Sans',sans-serif", boxSizing: "border-box" };
const pill = (link) => ({ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", color: "#5B6470", ...(link ? { cursor: "pointer" } : {}) });
const btn = (bg) => ({ display: "inline-flex", alignItems: "center", gap: 6, background: bg, color: bg === "#fff" ? B.black : "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" });
const iconBtn = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${B.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Field({ label, req, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: B.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Montserrat',sans-serif" }}>
        {label}{req ? <span style={{ color: B.red, marginLeft: 3 }}>*</span> : null}
      </label>
      {children}
    </div>
  );
}

function Modal({ children, onClose, narrow }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "34px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: narrow ? 380 : 540, marginBottom: 30 }}>
        {children}
      </div>
    </div>
  );
}

function MemberCard({ member, canEdit, onEdit, onRemove }) {
  const src = member.photo_signed_url || member.photo_url;
  return (
    <div style={{ position: "relative", background: "#fff", border: `1px solid ${B.border}`, borderRadius: 12, padding: "16px 18px" }}>
      {canEdit ? (
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 5 }}>
          <button onClick={onEdit} title="Edit" style={iconBtn}><Icon d={ICON.pencil} size={14} color="#4B5563" /></button>
          <button onClick={onRemove} title="Remove" style={iconBtn}><Icon d={ICON.trash} size={14} color={B.red} /></button>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 13, alignItems: "center", marginBottom: member.bio ? 11 : 4 }}>
        {src ? (
          <img src={src} alt={member.full_name} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: B.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "'Montserrat',sans-serif", fontSize: 18, flexShrink: 0 }}>{initials(member.full_name)}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{member.full_name}</div>
          {member.role_title ? <div style={{ fontSize: 13, color: B.blue, fontWeight: 600, marginTop: 2 }}>{member.role_title}</div> : null}
        </div>
      </div>
      {member.bio ? <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.5, margin: "0 0 11px" }}>{member.bio}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12.5, color: "#5B6470" }}>
        <span style={pill()}><Icon d={ICON.pin} size={13} color="#5B6470" /> {member.chapter_name || NAT}</span>
        {member.email ? <a href={`mailto:${member.email}`} style={pill(true)}><Icon d={ICON.mail} size={13} color="#5B6470" /> Email</a> : null}
        {member.phone ? <a href={`tel:${member.phone}`} style={pill(true)}><Icon d={ICON.phone} size={13} color="#5B6470" /> {member.phone}</a> : null}
      </div>
    </div>
  );
}

function MemberForm({ member, chapters, profile, onClose, onSave }) {
  const isNew = !member.id;
  const isRC = profile.role === "RC";
  const [form, setForm] = useState({
    id: member.id || null,
    full_name: member.full_name || "",
    role_title: member.role_title || "",
    chapter_id: member.chapter_id || (isRC ? profile.chapter_id : ""),
    email: member.email || "",
    phone: member.phone || "",
    bio: member.bio || "",
    photo_url: member.photo_url || "",
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(member.photo_signed_url || member.photo_url || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setErr("That image is over 5MB. Please choose a smaller one."); return; }
    setErr(""); setFile(f); setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!form.full_name.trim()) { setErr("A name is needed. Everything else is optional."); return; }
    if (isRC && !form.chapter_id) { setErr("A chapter is needed."); return; }
    setSaving(true);
    await onSave(form, file);
    setSaving(false);
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: "17px 22px", borderBottom: `1px solid ${B.offWhite}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 18, fontWeight: 700 }}>{isNew ? "Add a member" : "Edit member"}</h3>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer" }}><Icon d={ICON.close} size={20} color={B.muted} /></button>
      </div>
      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 15 }}>
        <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
          {preview ? (
            <img src={preview} alt="" style={{ width: 66, height: 66, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 66, height: 66, borderRadius: "50%", background: B.offWhite, display: "flex", alignItems: "center", justifyContent: "center", color: "#B4BAC1" }}><Icon d={ICON.camera} size={24} color="#B4BAC1" /></div>
          )}
          <div>
            <button onClick={() => fileRef.current?.click()} style={{ ...btn("#fff"), color: B.blue, border: `1px solid ${B.blue}` }}>
              <Icon d={ICON.camera} size={15} color={B.blue} /> {preview ? "Change photo" : "Upload photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
            <div style={{ fontSize: 11.5, color: B.muted, marginTop: 6 }}>Optional. A clear headshot works best.</div>
          </div>
        </div>

        <Field label="Full name" req><input style={fieldInput} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Grace Adeyemi" /></Field>
        <Field label="Role or title"><input style={fieldInput} value={form.role_title} onChange={(e) => set("role_title", e.target.value)} placeholder="e.g. Volunteer, Chapter Secretary" /></Field>
        <Field label="Chapter">
          {isRC ? (
            <input style={{ ...fieldInput, background: B.offWhite, color: B.muted }} value={profile.chapter_name || ""} disabled />
          ) : (
            <select style={fieldInput} value={form.chapter_id} onChange={(e) => set("chapter_id", e.target.value)}>
              <option value="">{NAT} (no chapter)</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Email"><input style={fieldInput} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@ycdinigeria.org" /></Field>
          <Field label="Phone / WhatsApp"><input style={fieldInput} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234…" /></Field>
        </div>
        <Field label="Brief profile"><textarea style={{ ...fieldInput, minHeight: 74, resize: "vertical" }} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="A line or two: what they do, how long they've served, anything worth knowing." /></Field>
        {err ? <div style={{ fontSize: 13, color: B.red, background: "#FDECEF", padding: "9px 12px", borderRadius: 9 }}>{err}</div> : null}
      </div>
      <div style={{ padding: "16px 22px", borderTop: `1px solid ${B.offWhite}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={{ ...btn("#fff"), color: "#4B5563", border: `1px solid ${B.border}` }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ ...btn(B.red), opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : isNew ? "Add member" : "Save changes"}</button>
      </div>
    </Modal>
  );
}

export default function DirectorySection({ profile, chapters, showToast }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [chapterFilter, setChapterFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("directory_members").select("*, chapters(name)").order("full_name");
    const rows = (data || []).map((d) => ({ ...d, chapter_name: d.chapters?.name || null }));
    await Promise.all(rows.map(async (d) => {
      if (!d.photo_url) return;
      const marker = "/member-photos/";
      const i = d.photo_url.indexOf(marker);
      if (i === -1) return;
      const path = d.photo_url.slice(i + marker.length);
      const { data: sd } = await supabase.storage.from("member-photos").createSignedUrl(path, 3600);
      if (sd) d.photo_signed_url = sd.signedUrl;
    }));
    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const canEdit = (m) => profile.role === "NC" || (profile.role === "RC" && m.chapter_id === profile.chapter_id);
  const canAdd = profile.role === "NC" || profile.role === "RC";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      const chName = m.chapter_name || NAT;
      if (chapterFilter !== "All" && chName !== chapterFilter) return false;
      if (!needle) return true;
      return [m.full_name, m.role_title, m.chapter_name, m.bio].filter(Boolean).some((v) => v.toLowerCase().includes(needle));
    });
  }, [members, q, chapterFilter]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((m) => {
      const key = m.chapter_name || NAT;
      (g[key] = g[key] || []).push(m);
    });
    const order = [NAT, ...chapters.map((c) => c.name)];
    return Object.keys(g)
      .sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map((k) => [k, g[k].sort((a, b) => a.full_name.localeCompare(b.full_name))]);
  }, [filtered, chapters]);

  async function uploadPhoto(file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const name = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("member-photos").upload(name, file, { upsert: true, cacheControl: "3600" });
    if (error) throw new Error("Photo upload failed: " + error.message);
    // Store the canonical object path; the reader signs it on load.
    return supabase.storage.from("member-photos").getPublicUrl(name).data.publicUrl;
  }

  async function saveMember(form, file) {
    try {
      let photo_url = form.photo_url || null;
      if (file) photo_url = await uploadPhoto(file);
      const row = {
        full_name: form.full_name.trim(),
        role_title: form.role_title.trim() || null,
        chapter_id: form.chapter_id || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        photo_url,
      };
      let error;
      if (form.id) ({ error } = await supabase.from("directory_members").update(row).eq("id", form.id));
      else ({ error } = await supabase.from("directory_members").insert({ ...row, created_by: profile.id }));
      if (error) throw error;
      await load();
      setEditing(null);
      showToast(form.id ? "Profile updated." : "Member added.");
    } catch (e) {
      showToast(e.message || "Something went wrong saving that.", "error");
    }
  }

  async function removeMember(m) {
    const { error } = await supabase.from("directory_members").delete().eq("id", m.id);
    if (error) { showToast(error.message, "error"); return; }
    await load();
    setRemoving(null);
    showToast("Member removed.");
  }

  return (
    <div style={{ fontFamily: "'Open Sans',sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: B.muted }}>
          {members.length} {members.length === 1 ? "person" : "people"} across national leadership and chapters.
        </div>
        {canAdd ? (
          <button onClick={() => setEditing({})} style={btn(B.red)}><Icon d={ICON.plus} size={17} color="#fff" /> Add member</button>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, role or chapter…" style={{ ...fieldInput, flex: 1, minWidth: 200, maxWidth: 340 }} />
        <select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)} style={{ ...fieldInput, width: "auto" }}>
          <option value="All">All chapters</option>
          <option value={NAT}>{NAT}</option>
          {chapters.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: B.muted, fontSize: 13 }}>Loading directory…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: B.muted, fontSize: 13 }}>No one matches that yet.</div>
      ) : (
        grouped.map(([chapterName, people]) => (
          <div key={chapterName} style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 12, color: B.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, borderBottom: `2px solid ${B.yellow}`, paddingBottom: 5 }}>
              {chapterName} <span style={{ color: B.border }}>· {people.length}</span>
            </div>
            <div className="rcol1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {people.map((m) => (
                <MemberCard key={m.id} member={m} canEdit={canEdit(m)} onEdit={() => setEditing(m)} onRemove={() => setRemoving(m)} />
              ))}
            </div>
          </div>
        ))
      )}

      {editing ? (
        <MemberForm member={editing} chapters={chapters} profile={profile} onClose={() => setEditing(null)} onSave={saveMember} />
      ) : null}

      {removing ? (
        <Modal onClose={() => setRemoving(null)} narrow>
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#FDECEF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Icon d={ICON.trash} size={20} color={B.red} />
            </div>
            <h3 style={{ margin: "0 0 6px", fontFamily: "'Montserrat',sans-serif", fontSize: 17, fontWeight: 700 }}>Remove {removing.full_name}?</h3>
            <p style={{ fontSize: 13, color: B.muted, lineHeight: 1.5, margin: "0 0 18px" }}>This takes them out of the directory. It doesn't affect any sign-in account they may have.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setRemoving(null)} style={{ ...btn("#fff"), color: "#4B5563", border: `1px solid ${B.border}` }}>Cancel</button>
              <button onClick={() => removeMember(removing)} style={btn(B.red)}>Remove</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
