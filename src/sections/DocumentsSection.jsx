import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase.js";
import { B, inp, ta, sel, btnP, btnG } from "../theme.js";
import { Card, SHead, Field } from "../components/ui.jsx";
import { usePaged } from "../lib/paging.js";
import { ShowMore } from "../components/ShowMore.jsx";
import { compressImage } from "../lib/imageCompress.js";

// BATCH4-MARKER documents-perf

const BUCKET = "hub-documents";
const MAX_DOC_MB = 25;
const MAX_COVER_MB = 5;

// ---- small helpers --------------------------------------------------------

const ICON = {
  file: "M6 2h7l5 5v15H6zm7 1.5V8h4.5zM8 12h8v1.6H8zm0 3.4h8V17H8zm0-6.8h4v1.6H8z",
  download: "M12 3v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4L11 13.2V3zM4 19h16v2H4z",
  pencil: "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75z",
  trash: "M6 7h12l-1 14H7zM9 4h6l1 2H8zM4 6h16v2H4z",
  lock: "M17 9V7a5 5 0 00-10 0v2H5v12h14V9zm-8 0V7a3 3 0 016 0v2z",
  folder: "M3 5h6l2 2h10v12H3z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
};
const Icon = ({ d, size = 14, color = B.muted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d={d} /></svg>
);

const iconBtn = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${B.border}`, background: B.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };

function fmtBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function extOf(name) {
  const p = (name || "").split(".");
  return p.length > 1 ? p.pop().toUpperCase() : "FILE";
}

function Modal({ children, onClose, narrow }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "34px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: B.white, borderRadius: 14, width: "100%", maxWidth: narrow ? 400 : 560, marginBottom: 30 }}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, onClose }) {
  return (
    <div style={{ padding: "17px 22px", borderBottom: `1px solid ${B.offWhite}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 17, fontWeight: 700, color: B.black }}>{title}</h3>
      <button onClick={onClose} style={{ ...iconBtn, fontSize: 18, color: B.muted, lineHeight: 1 }}>×</button>
    </div>
  );
}

// ---- upload plumbing ------------------------------------------------------

async function uploadTo(folder, file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${crypto.randomUUID()}.${ext || "bin"}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, cacheControl: "3600" });
  if (error) throw new Error("Upload failed: " + error.message);
  return path;
}

async function removeQuietly(paths) {
  const clean = paths.filter(Boolean);
  if (!clean.length) return;
  // If a file is already gone this returns an error we don't need to surface.
  try { await supabase.storage.from(BUCKET).remove(clean); } catch { /* ignore */ }
}

// ---- document composer ----------------------------------------------------

function DocumentComposer({ profile, categories, editing, onClose, onSaved, showToast }) {
  const isNew = !editing;
  const [title, setTitle] = useState(editing ? editing.title : "");
  const [description, setDescription] = useState(editing ? editing.description || "" : "");
  const [categoryId, setCategoryId] = useState(editing ? editing.category_id : (categories[0] || {}).id || "");
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(editing ? editing.cover_url || "" : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function pickFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > MAX_DOC_MB * 1024 * 1024) { setErr(`That file is over ${MAX_DOC_MB}MB. Please compress it or split it up.`); return; }
    setErr(""); setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  function pickCover(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > MAX_COVER_MB * 1024 * 1024) { setErr(`That image is over ${MAX_COVER_MB}MB. Please choose a smaller one.`); return; }
    setErr(""); setCover(f); setCoverPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!title.trim()) { setErr("Give the document a title."); return; }
    if (!categoryId) { setErr("Pick a category."); return; }
    if (isNew && !file) { setErr("Choose a file to upload."); return; }
    setBusy(true); setErr("");
    try {
      const row = {
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        updated_at: new Date().toISOString(),
      };
      let oldFile = null, oldCover = null;

      if (file) {
        if (editing) oldFile = editing.file_path;
        row.file_path = await uploadTo("files", file);
        row.file_name = file.name;
        row.file_size = file.size;
        row.file_type = file.type || null;
      }
      if (cover) {
        if (editing) oldCover = editing.cover_path;
        // Only the cover thumbnail is shrunk. The document itself is
        // uploaded exactly as given, byte for byte, because it may be a
        // signed policy or a scan somebody needs to print.
        row.cover_path = await uploadTo("covers", await compressImage(cover, { maxEdge: 800 }));
      }

      let error;
      if (editing) {
        ({ error } = await supabase.from("documents").update(row).eq("id", editing.id));
      } else {
        ({ error } = await supabase.from("documents").insert({ ...row, created_by: profile.id, author_name: profile.full_name }));
      }
      if (error) throw error;

      await removeQuietly([oldFile, oldCover]);
      showToast(editing ? "Document updated." : "Document uploaded.");
      onSaved();
    } catch (e) {
      setErr(e.message || "Something went wrong saving that.");
    }
    setBusy(false);
  }

  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <ModalHead title={isNew ? "Add a document" : "Edit document"} onClose={onClose} />
      <div style={{ padding: "18px 22px" }}>
        <Field label="Title" required>
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter Reporting Guide 2026" />
        </Field>
        <Field label="Short description">
          <textarea style={{ ...ta, minHeight: 66 }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One or two lines on what this is and who it's for" />
        </Field>
        <Field label="Category" required>
          <select style={sel} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.nc_only ? " (National Coordinator only)" : ""}</option>)}
          </select>
        </Field>

        <Field label={isNew ? "File" : "Replace file"} required={isNew}>
          <input type="file" onChange={pickFile} style={{ fontSize: 12.5, width: "100%" }} />
          <div style={{ fontSize: 11.5, color: B.muted, marginTop: 6 }}>
            {file ? `${file.name} · ${fmtBytes(file.size)}` : editing ? `Currently: ${editing.file_name || "file on record"}. Leave this empty to keep it.` : `PDF, Word, Excel, PowerPoint, images. Up to ${MAX_DOC_MB}MB.`}
          </div>
        </Field>

        <Field label="Cover image (optional)">
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 86, height: 60, borderRadius: 8, border: `1px solid ${B.border}`, background: B.offWhite, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {coverPreview ? <img src={coverPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon d={ICON.file} size={20} color={B.border} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input type="file" accept="image/*" onChange={pickCover} style={{ fontSize: 12.5, width: "100%" }} />
              <div style={{ fontSize: 11.5, color: B.muted, marginTop: 6 }}>Leave this empty and the card shows a plain file tile instead.</div>
            </div>
          </div>
        </Field>

        {err ? <div style={{ background: B.redLight, color: B.red, border: `1px solid ${B.red}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>{err}</div> : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? "Uploading…" : isNew ? "Upload document" : "Save changes"}</button>
          <button onClick={onClose} disabled={busy} style={btnG}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

// ---- category manager -----------------------------------------------------

function CategoryManager({ categories, docs, onClose, onChanged, showToast }) {
  const [rows, setRows] = useState(categories);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ name: "", description: "", nc_only: false });
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setRows(categories); }, [categories]);

  const countIn = (id) => docs.filter((d) => d.category_id === id).length;

  function startEdit(c) {
    setAdding(false);
    setEditingId(c.id);
    setDraft({ name: c.name, description: c.description || "", nc_only: !!c.nc_only });
  }
  function startAdd() {
    setEditingId(null);
    setAdding(true);
    setDraft({ name: "", description: "", nc_only: false });
  }

  async function saveDraft() {
    if (!draft.name.trim()) { showToast("Give the category a name.", "error"); return; }
    setBusy(true);
    const payload = { name: draft.name.trim(), description: draft.description.trim() || null, nc_only: draft.nc_only };
    let error;
    if (editingId) {
      ({ error } = await supabase.from("document_categories").update(payload).eq("id", editingId));
    } else {
      const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) + 10 : 10;
      ({ error } = await supabase.from("document_categories").insert({ ...payload, sort_order: nextOrder }));
    }
    setBusy(false);
    if (error) { showToast("Could not save: " + error.message, "error"); return; }
    setEditingId(null); setAdding(false);
    showToast(editingId ? "Category updated." : "Category created.");
    onChanged();
  }

  async function reallyDelete(c) {
    setBusy(true);
    const inside = docs.filter((d) => d.category_id === c.id);
    await removeQuietly(inside.flatMap((d) => [d.file_path, d.cover_path]));
    const { error } = await supabase.from("document_categories").delete().eq("id", c.id);
    setBusy(false);
    if (error) { showToast("Could not delete: " + error.message, "error"); return; }
    setConfirmDel(null);
    showToast(inside.length ? `"${c.name}" and ${inside.length} document${inside.length === 1 ? "" : "s"} removed.` : `"${c.name}" removed.`);
    onChanged();
  }

  const editor = (
    <div style={{ background: B.offWhite, borderRadius: 10, padding: "14px 16px", marginTop: 12 }}>
      <Field label="Category name" required>
        <input style={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Training Materials" />
      </Field>
      <Field label="Description">
        <input style={inp} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="One line, shown under the category name" />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: B.black, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={draft.nc_only} onChange={(e) => setDraft({ ...draft, nc_only: e.target.checked })} />
        National Coordinator only. Nobody else sees this category or anything in it.
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={saveDraft} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : editingId ? "Save changes" : "Create category"}</button>
        <button onClick={() => { setEditingId(null); setAdding(false); }} style={btnG}>Cancel</button>
      </div>
    </div>
  );

  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <ModalHead title="Manage categories" onClose={onClose} />
      <div style={{ padding: "18px 22px" }}>
        {rows.length === 0 ? <div style={{ fontSize: 13, color: B.muted, marginBottom: 12 }}>No categories yet. Create the first one below.</div> : null}

        {rows.map((c) => (
          <div key={c.id} style={{ borderBottom: `1px solid ${B.offWhite}`, padding: "11px 0" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: B.black }}>{c.name}</span>
                  {c.nc_only ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: B.redLight, color: B.red, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'Montserrat',sans-serif" }}>
                      <Icon d={ICON.lock} size={9} color={B.red} /> NC only
                    </span>
                  ) : null}
                </div>
                {c.description ? <div style={{ fontSize: 12, color: B.muted, marginTop: 3, lineHeight: 1.5 }}>{c.description}</div> : null}
                <div style={{ fontSize: 11.5, color: B.muted, marginTop: 3 }}>{countIn(c.id)} document{countIn(c.id) === 1 ? "" : "s"}</div>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <button onClick={() => startEdit(c)} title="Rename" style={iconBtn}><Icon d={ICON.pencil} size={13} color="#4B5563" /></button>
                <button onClick={() => setConfirmDel(c)} title="Delete" style={iconBtn}><Icon d={ICON.trash} size={13} color={B.red} /></button>
              </div>
            </div>
            {editingId === c.id ? editor : null}
          </div>
        ))}

        {adding ? editor : (
          <button onClick={startAdd} style={{ ...btnG, marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon d={ICON.plus} size={13} color={B.muted} /> New category
          </button>
        )}

        {confirmDel ? (
          <div style={{ marginTop: 16, border: `1px solid ${B.red}`, background: B.redLight, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13.5, color: B.red, marginBottom: 6 }}>Delete "{confirmDel.name}"?</div>
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: B.black, lineHeight: 1.6 }}>
              {countIn(confirmDel.id) === 0
                ? "This category is empty, so nothing else goes with it."
                : `The ${countIn(confirmDel.id)} document${countIn(confirmDel.id) === 1 ? "" : "s"} inside will be deleted too, files and all. This cannot be undone.`}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => reallyDelete(confirmDel)} disabled={busy} style={{ background: B.red, color: B.white, border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Deleting…" : "Yes, delete it"}
              </button>
              <button onClick={() => setConfirmDel(null)} style={btnG}>Keep it</button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ---- document card --------------------------------------------------------

function DocumentCard({ doc, category, canManage, onDownload, onEdit, onDelete, downloading }) {
  return (
    <div style={{ background: B.white, border: `1px solid ${B.border}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", height: 124, background: doc.cover_url ? B.offWhite : B.blueLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {doc.cover_url ? (
          <img src={doc.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ textAlign: "center" }}>
            <Icon d={ICON.file} size={30} color={B.blue} />
            <div style={{ fontSize: 10.5, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", letterSpacing: "0.08em", marginTop: 2 }}>{extOf(doc.file_name)}</div>
          </div>
        )}
        {canManage ? (
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 5 }}>
            <button onClick={onEdit} title="Edit" style={iconBtn}><Icon d={ICON.pencil} size={13} color="#4B5563" /></button>
            <button onClick={onDelete} title="Remove" style={iconBtn}><Icon d={ICON.trash} size={13} color={B.red} /></button>
          </div>
        ) : null}
      </div>

      <div style={{ padding: "13px 15px 15px", display: "flex", flexDirection: "column", flex: 1 }}>
        {category ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start", background: category.nc_only ? B.redLight : B.yellowLight, color: category.nc_only ? B.red : B.gold, padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", marginBottom: 8 }}>
            {category.nc_only ? <Icon d={ICON.lock} size={9} color={B.red} /> : null}
            {category.name}
          </div>
        ) : null}
        <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 14, color: B.black, lineHeight: 1.35 }}>{doc.title}</div>
        {doc.description ? <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#4B5563", lineHeight: 1.55 }}>{doc.description}</p> : null}
        <div style={{ fontSize: 11, color: B.muted, marginTop: 8 }}>
          {extOf(doc.file_name)}{doc.file_size ? " · " + fmtBytes(doc.file_size) : ""}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={onDownload} disabled={downloading} style={{ ...btnP, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: downloading ? 0.6 : 1 }}>
            <Icon d={ICON.download} size={14} color={B.white} />
            {downloading ? "Opening…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- section --------------------------------------------------------------

export default function DocumentsSection({ profile, showToast }) {
  const [cats, setCats] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [managing, setManaging] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const isAdmin = !!profile.is_admin;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c, error: ce }, { data: d, error: de }] = await Promise.all([
      supabase.from("document_categories").select("*").order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
    ]);
    if (ce || de) {
      setErr("Could not load the documents library right now. If this keeps happening, the Stage 3 database script may not have been run yet.");
      setLoading(false);
      return;
    }
    const rows = d || [];
    // Cover images live in a private bucket, so each one gets a short-lived
    // signed link on load. They expire after an hour, which is fine because
    // the page reloads them every time it opens.
    // One request for the whole page of covers rather than one each. A
    // library of forty documents used to mean forty round trips before any
    // thumbnail appeared.
    const withCovers = rows.filter((r) => r.cover_path);
    if (withCovers.length) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(withCovers.map((r) => r.cover_path), 3600);
      (signed || []).forEach((r, i) => {
        if (r && r.signedUrl && withCovers[i]) withCovers[i].cover_url = r.signedUrl;
      });
    }
    setErr("");
    setCats(c || []);
    setDocs(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const catById = useMemo(() => {
    const m = {};
    cats.forEach((c) => { m[c.id] = c; });
    return m;
  }, [cats]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== "all" && d.category_id !== filter) return false;
      if (!needle) return true;
      return [d.title, d.description, d.file_name, (catById[d.category_id] || {}).name]
        .filter(Boolean).some((v) => v.toLowerCase().includes(needle));
    });
  }, [docs, filter, q, catById]);

  const paged = usePaged(visible, q + "\u0000" + filter);

  async function download(d) {
    setBusyId(d.id);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 3600, { download: d.file_name || true });
    setBusyId(null);
    if (error || !data) { showToast("Could not open that file. Please try again shortly.", "error"); return; }
    window.open(data.signedUrl, "_blank", "noreferrer");
  }

  async function deleteDoc(d) {
    setBusyId(d.id);
    await removeQuietly([d.file_path, d.cover_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    setBusyId(null);
    if (error) { showToast("Could not remove that: " + error.message, "error"); return; }
    setRemoving(null);
    showToast("Document removed.");
    load();
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.muted }}>Loading documents…</div>;

  return (
    <div>
      <Card style={{ background: B.blueLight, borderColor: B.blue + "30", marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.blueDark, fontFamily: "'Montserrat',sans-serif", marginBottom: 4 }}>Documents & Resources</div>
        <p style={{ margin: 0, fontSize: 12, color: B.muted, lineHeight: 1.7 }}>
          {isAdmin
            ? "Everything the chapters need in one place. You can add, rename and remove categories here. Categories marked National Coordinator only are invisible to everyone else."
            : "Guides, templates and resources for your work. Tap Download on any card to open the file."}
        </p>
      </Card>

      {err ? <Card style={{ borderColor: B.red, background: B.redLight, color: B.red, marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>{err}</Card> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents…"
          style={{ ...inp, flex: "1 1 200px", width: "auto", minWidth: 160 }}
        />
        {isAdmin ? (
          <>
            <button onClick={() => { setEditing(null); setComposing(true); }} disabled={!cats.length} style={{ ...btnP, opacity: cats.length ? 1 : 0.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon d={ICON.plus} size={13} color={B.white} /> Add document
            </button>
            <button onClick={() => setManaging(true)} style={{ ...btnG, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon d={ICON.folder} size={13} color={B.muted} /> Categories
            </button>
          </>
        ) : null}
      </div>

      {cats.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {[{ id: "all", name: "All" }, ...cats].map((c) => {
            const on = filter === c.id;
            return (
              <button key={c.id} onClick={() => setFilter(c.id)} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (on ? B.blue : B.border), background: on ? B.blue : B.white, color: on ? B.white : B.muted, fontSize: 12, fontWeight: on ? 700 : 400, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", display: "inline-flex", alignItems: "center", gap: 5 }}>
                {c.nc_only ? <Icon d={ICON.lock} size={10} color={on ? B.white : B.red} /> : null}
                {c.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {!cats.length ? (
        <Card style={{ textAlign: "center", padding: "34px 20px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", color: B.black, marginBottom: 6 }}>No categories yet</div>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: B.muted, lineHeight: 1.6 }}>
            {isAdmin ? "Create the first category, then start adding documents to it." : "Nothing has been published here yet. Check back shortly."}
          </p>
          {isAdmin ? <button onClick={() => setManaging(true)} style={btnP}>Create a category</button> : null}
        </Card>
      ) : visible.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "30px 20px", fontSize: 13, color: B.muted }}>
          {q.trim() ? `Nothing matches "${q.trim()}".` : "No documents in here yet."}
        </Card>
      ) : (
        <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 228px), 1fr))", gap: 14 }}>
          {paged.visible.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              category={catById[d.category_id]}
              canManage={isAdmin}
              downloading={busyId === d.id}
              onDownload={() => download(d)}
              onEdit={() => { setEditing(d); setComposing(true); }}
              onDelete={() => setRemoving(d)}
            />
          ))}
        </div>
        <ShowMore paged={paged} noun="more documents" />
        </>
      )}

      {composing ? (
        <DocumentComposer
          profile={profile}
          categories={cats}
          editing={editing}
          showToast={showToast}
          onClose={() => { setComposing(false); setEditing(null); }}
          onSaved={() => { setComposing(false); setEditing(null); load(); }}
        />
      ) : null}

      {managing ? (
        <CategoryManager
          categories={cats}
          docs={docs}
          showToast={showToast}
          onClose={() => setManaging(false)}
          onChanged={load}
        />
      ) : null}

      {removing ? (
        <Modal onClose={() => setRemoving(null)} narrow>
          <ModalHead title="Remove this document?" onClose={() => setRemoving(null)} />
          <div style={{ padding: "18px 22px" }}>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: B.black, lineHeight: 1.6 }}>
              "{removing.title}" and its file will be deleted for everyone. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => deleteDoc(removing)} disabled={busyId === removing.id} style={{ background: B.red, color: B.white, border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", opacity: busyId === removing.id ? 0.6 : 1 }}>
                {busyId === removing.id ? "Removing…" : "Yes, remove it"}
              </button>
              <button onClick={() => setRemoving(null)} style={btnG}>Cancel</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
