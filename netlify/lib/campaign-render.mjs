// netlify/lib/campaign-render.mjs
//
// Batch 30. Turns a queued recipient into an email: fills in the merge
// fields, escapes everything that is not the sender's own layout, adds
// the unsubscribe line, and signs the unsubscribe link.
//
// Provider-neutral on purpose. Nothing in here knows which company will
// carry the message.
//
// Two rules that matter more than they look:
//
//   1. A merge value is somebody's name, typed by somebody else. It is
//      never trusted. Line breaks are removed before it goes anywhere
//      near a subject line (that is how a header gets forged), and it is
//      escaped before it goes into HTML.
//
//   2. The unsubscribe link is added here, at the last step, and is not
//      part of what the author writes. A campaign cannot be sent without
//      one because there is no path that leaves it out.

import { createHmac, timingSafeEqual } from "node:crypto";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// One line, no control characters, no runs of spaces.
function oneLine(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// {{first_name}} and {{chapter}}. Anything else is left exactly as
// written; the database refuses a campaign with any other tag before it
// can be approved, so this is only a second line of defence.
export function fillMerge(text, vars = {}) {
  return String(text ?? "").replace(/\{\{\s*([A-Za-z_]+)\s*\}\}/g, (whole, name) => {
    const key = name.toLowerCase();
    if (key === "first_name") return oneLine(vars.first_name) || "friend";
    if (key === "chapter") return oneLine(vars.chapter) || "YCDI";
    return whole;
  });
}

// Plain text with blank lines between paragraphs, to HTML. Everything is
// escaped first; only https links are turned into links.
export function textToHtml(text) {
  const paragraphs = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs
    .map((p) => {
      const safe = escapeHtml(p).replace(/\n/g, "<br>");
      const linked = safe.replace(
        /https:\/\/[^\s<]+/g,
        (url) => `<a href="${url}" style="color:#075B7D">${url}</a>`,
      );
      return `<p style="margin:0 0 14px;line-height:1.6">${linked}</p>`;
    })
    .join("");
}

// ---- unsubscribe tokens ------------------------------------------------
// The link carries the address and a signature made with a secret only
// the server holds, so a link cannot be made up for somebody else's
// address. It never expires: an unsubscribe link must keep working.

export function signUnsubscribeToken(email, secret) {
  const clean = String(email ?? "").trim().toLowerCase();
  const payload = Buffer.from(clean, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token, secret) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const email = Buffer.from(payload, "base64url").toString("utf8");
  return email.includes("@") ? email : null;
}

export function unsubscribeUrl(baseUrl, email, secret) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}/.netlify/functions/email-unsubscribe?t=${signUnsubscribeToken(email, secret)}`;
}

// ---- the message -------------------------------------------------------

function shell(bodyHtml, unsubscribe) {
  return (
    '<div style="background:#F2F2F2;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">' +
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:10px;overflow:hidden;">' +
    '<div style="background:#075B7D;padding:16px 24px;">' +
    '<div style="color:#FFFFFF;font-size:15px;font-weight:bold;">Young Christian Development Initiative</div>' +
    "</div>" +
    `<div style="padding:24px;font-size:15px;color:#2D0209;">${bodyHtml}</div>` +
    '<div style="padding:16px 24px;background:#FAF6F0;font-size:12px;color:#6B6D72;line-height:1.6;">' +
    "You are receiving this because you are part of the YCDI community. " +
    `<a href="${unsubscribe}" style="color:#075B7D">Unsubscribe</a>` +
    "</div></div></div>"
  );
}

// `row` is one claimed recipient, as claim_campaign_batch() returns it.
export function buildMessage({ row, secret, baseUrl }) {
  const vars = { first_name: row.first_name, chapter: row.chapter_name };
  const subject = oneLine(fillMerge(row.subject, vars));
  const bodyText = fillMerge(row.body, vars);
  const unsubscribe = unsubscribeUrl(baseUrl, row.email, secret);
  const fromName = String(row.from_name ?? "").replace(/[<>"\r\n]/g, "").trim();

  return {
    from: `${fromName} <${row.from_email}>`,
    to: row.email,
    replyTo: row.reply_to || undefined,
    subject,
    html: shell(textToHtml(bodyText), unsubscribe),
    text:
      `${bodyText.trim()}\n\n--\n` +
      `You are receiving this because you are part of the YCDI community.\n` +
      `Unsubscribe: ${unsubscribe}\n`,
    // RFC 8058 one-click unsubscribe. Mail apps show their own
    // "Unsubscribe" button from these two headers.
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
