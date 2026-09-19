// netlify/functions/send-campaign-batch.mjs
//
// Batch 30. Sends the next batch of an approved, started campaign.
//
// Called from the Hub by the National Coordinator or the Communications
// seat after start_campaign(). The caller's own session is used to check
// who they are and what they may do; the server key is used only for the
// queue, which no signed-in user can touch.
//
// It sends for a short time and stops. Anything the provider's daily
// limit holds back is picked up by send-campaigns-scheduled.mjs.
//
// Needs, in Netlify's environment variables:
//   SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   (already set for the invite functions)
//   RESEND_API_KEY                                  (new: the same key the Hub already uses for system email)
//   UNSUBSCRIBE_SECRET                              (new: a long random string, 32 characters or more)

import { createClient } from "@supabase/supabase-js";
import { buildAdapters } from "../lib/email-providers.mjs";
import { runSendLoop } from "../lib/send-engine.mjs";
import { makeDb } from "../lib/campaign-db.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dnympoqsnrlgsvhznsjb.supabase.co";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.URL;
  if (!anonKey || !serviceKey || !baseUrl || !secret || secret.length < 32) {
    console.error("send-campaign-batch: missing SUPABASE keys, base URL, or a 32+ character UNSUBSCRIBE_SECRET");
    return json({ error: "Sending is not set up on the server yet." }, 500);
  }

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in." }, 401);

  let campaignId;
  try { campaignId = (await req.json()).campaign_id; } catch { return json({ error: "Malformed request." }, 400); }
  if (!campaignId) return json({ error: "campaign_id is required." }, 400);

  const userClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Not signed in." }, 401);

  const { data: allowed } = await userClient.rpc("can_manage_audience");
  if (allowed !== true) return json({ error: "Sending is for the National Coordinator and the Communications seat." }, 403);

  const { data: campaign } = await userClient
    .from("email_campaigns").select("id, status").eq("id", campaignId).maybeSingle();
  if (!campaign) return json({ error: "Campaign not found." }, 404);
  if (campaign.status !== "sending") {
    return json({ error: `This campaign is "${campaign.status}", not sending.` }, 400);
  }

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  // Sync functions have a short time limit, so this stops early on purpose.
  const budget = Number(process.env.SEND_BUDGET_MS) || 8000;

  try {
    const summary = await runSendLoop({
      db: makeDb(admin),
      adapters: buildAdapters(process.env),
      campaignId, secret, baseUrl,
      deadline: Date.now() + budget,
    });
    const { data: progress } = await userClient.rpc("campaign_progress", { p_id: campaignId });
    return json({ ok: true, summary, progress: progress?.[0] ?? null });
  } catch (err) {
    console.error("send-campaign-batch failed:", err?.message || err);
    return json({ error: "Sending stopped unexpectedly. Nothing was lost; it will carry on." }, 500);
  }
};
