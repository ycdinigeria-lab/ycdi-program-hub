// netlify/functions/send-campaigns-scheduled.mjs
//
// Batch 30. Every hour, carries on with any campaign that is still
// sending. This is what finishes a campaign the provider's daily limit
// spread over more than one day, without anybody pressing anything.
//
// Netlify runs scheduled functions only on the published site, and only
// once this file has been deployed.

import { createClient } from "@supabase/supabase-js";
import { buildAdapters } from "../lib/email-providers.mjs";
import { runSendLoop } from "../lib/send-engine.mjs";
import { makeDb } from "../lib/campaign-db.mjs";

export const config = { schedule: "@hourly" };

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dnympoqsnrlgsvhznsjb.supabase.co";

export default async () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.URL;
  if (!serviceKey || !baseUrl || !secret || secret.length < 32) {
    console.error("send-campaigns-scheduled: sending is not set up on the server");
    return;
  }

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  const { data: campaigns, error } = await admin
    .from("email_campaigns").select("id").eq("status", "sending");
  if (error) { console.error("could not list campaigns:", error.message); return; }
  if (!campaigns?.length) return;

  const adapters = buildAdapters(process.env);
  const db = makeDb(admin);
  const each = Math.floor(24000 / campaigns.length);
  for (const { id } of campaigns) {
    try {
      const summary = await runSendLoop({
        db, adapters, campaignId: id, secret, baseUrl, deadline: Date.now() + each,
      });
      console.log(`campaign ${id}:`, JSON.stringify(summary));
    } catch (err) {
      console.error(`campaign ${id} failed:`, err?.message || err);
    }
  }
};
