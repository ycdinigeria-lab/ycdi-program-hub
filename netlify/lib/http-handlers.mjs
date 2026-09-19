// netlify/lib/http-handlers.mjs
//
// Batch 30. The two public doors into the sending system, written as
// plain functions of (request, dependencies) so they can be tested
// without a server. The files in netlify/functions/ are thin wrappers
// that hand them the real database and the real secrets.

import { verifyUnsubscribeToken, escapeHtml } from "./campaign-render.mjs";

const html = (body, status = 200) =>
  new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>YCDI</title></head>" +
    '<body style="margin:0;background:#FAF6F0;font-family:Arial,Helvetica,sans-serif;color:#2D0209">' +
    '<div style="max-width:440px;margin:60px auto;padding:0 20px">' +
    '<div style="background:#075B7D;color:#fff;padding:14px 20px;border-radius:10px 10px 0 0;font-weight:bold">' +
    "Young Christian Development Initiative</div>" +
    `<div style="background:#fff;padding:24px 20px;border-radius:0 0 10px 10px;line-height:1.6">${body}</div>` +
    "</div></body></html>",
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// a***@example.org: enough to recognise, not enough to read out.
export function maskEmail(email) {
  const [name, domain] = String(email).split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

// ---- unsubscribe -------------------------------------------------------
//
// GET  shows a page with one button. It does NOT unsubscribe, because
//      mail scanners open every link in an email, and would unsubscribe
//      everybody.
// POST does it. This is also what a mail app's own "Unsubscribe" button
//      sends (RFC 8058 one-click), to the same address.
export async function handleUnsubscribe(req, { secret, record }) {
  const token = new URL(req.url).searchParams.get("t");

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  const email = verifyUnsubscribeToken(token, secret);
  if (!email) {
    return html("<h2 style=\"margin-top:0\">That link is not valid</h2><p>It may have been copied incompletely. Reply to any YCDI email and we will stop writing to you.</p>", 400);
  }

  if (req.method === "GET") {
    return html(
      `<h2 style="margin-top:0">Stop emails from YCDI?</h2>` +
      `<p>This will stop emails to <strong>${escapeHtml(maskEmail(email))}</strong>.</p>` +
      `<form method="post"><button type="submit" style="background:#075B7D;color:#fff;border:0;border-radius:6px;padding:10px 20px;font-size:15px;cursor:pointer">Yes, unsubscribe me</button></form>`,
    );
  }

  try {
    await record(email);
  } catch (err) {
    console.error("unsubscribe failed:", err?.message || err);
    return html("<h2 style=\"margin-top:0\">Something went wrong</h2><p>Please try again in a few minutes, or reply to any YCDI email and we will stop writing to you.</p>", 500);
  }
  return html("<h2 style=\"margin-top:0\">You are unsubscribed</h2><p>YCDI will not email you again. God bless you.</p>");
}

// ---- provider webhook --------------------------------------------------
//
// The provider reports bounces and spam complaints here. The signature is
// checked against the RAW body before anything is read out of it. A
// permanent bounce and a complaint stop the address for good; a temporary
// bounce is only noted.
const RECORDED = new Set(["complained", "bounced_permanent", "bounced_transient"]);

export async function handleWebhook(req, { adapter, record }) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  if (!adapter) return json({ error: "Unknown provider." }, 404);
  if (!adapter.webhookConfigured) {
    return json({ error: "Webhook signing secret is not set on the server." }, 500);
  }

  const raw = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  if (!adapter.verifyWebhook(headers, raw)) return json({ error: "Invalid signature." }, 400);

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Malformed body." }, 400); }

  const events = adapter.parseWebhook(payload).filter((e) => RECORDED.has(e.type));
  try {
    for (const e of events) {
      await record({
        provider: adapter.code, messageId: e.messageId, email: e.email, event: e.type, detail: e.detail,
      });
    }
  } catch (err) {
    // A failure here must not look like success: the provider retries on
    // anything but a 2xx, and every step above is safe to repeat.
    console.error("recording a delivery event failed:", err?.message || err);
    return json({ error: "Could not record the event." }, 500);
  }
  return json({ ok: true, handled: events.length });
}
