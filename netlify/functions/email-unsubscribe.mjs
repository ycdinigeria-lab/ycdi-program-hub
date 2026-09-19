// netlify/functions/email-unsubscribe.mjs
//
// Batch 30. The link at the bottom of every campaign email points here.
// See lib/http-handlers.mjs for what it does and why GET does not
// unsubscribe anybody.

import { createClient } from "@supabase/supabase-js";
import { handleUnsubscribe } from "../lib/http-handlers.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dnympoqsnrlgsvhznsjb.supabase.co";

export default async (req) => {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) return new Response("Not set up yet.", { status: 500 });

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false } });
  return handleUnsubscribe(req, {
    secret,
    record: async (email) => {
      const { error } = await admin.rpc("record_unsubscribe", { p_email: email });
      if (error) throw new Error(error.message);
    },
  });
};
