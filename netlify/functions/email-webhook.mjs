// netlify/functions/email-webhook.mjs
//
// Batch 30. The email provider reports bounces and spam complaints here.
// In Resend's dashboard, add a webhook pointing at
//   https://<your site>/.netlify/functions/email-webhook?provider=resend
// for the events email.bounced and email.complained, then copy the
// signing secret it shows you into Netlify as RESEND_WEBHOOK_SECRET.
//
// Nothing is acted on unless the signature checks out.

import { createClient } from "@supabase/supabase-js";
import { createResendAdapter } from "../lib/email-providers.mjs";
import { handleWebhook } from "../lib/http-handlers.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dnympoqsnrlgsvhznsjb.supabase.co";

export default async (req) => {
  const provider = new URL(req.url).searchParams.get("provider") || "resend";
  const adapter = provider === "resend"
    ? createResendAdapter({
        apiKey: process.env.RESEND_API_KEY,
        webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
      })
    : null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return new Response("Not set up yet.", { status: 500 });
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });

  return handleWebhook(req, {
    adapter,
    record: async ({ provider: p, messageId, email, event, detail }) => {
      const { error } = await admin.rpc("record_delivery_event", {
        p_provider: p, p_message_id: messageId, p_email: email, p_event: event, p_detail: detail,
      });
      if (error) throw new Error(error.message);
    },
  });
};
