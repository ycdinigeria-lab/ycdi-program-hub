// netlify/functions/invite-participant-account.mjs
//
// Batch 25: sends the actual invite that link_participant_account
// (batch25-adult-participant-accounts.sql) expects to receive an
// auth_user_id for.
//
// Two Supabase clients, on purpose, at two different privilege levels:
//
//   userClient  — created with the calling mentor's own access token.
//                 Everything that is supposed to go through RLS goes
//                 through this one: reading the participant record,
//                 checking consent, and calling link_participant_account
//                 (whose own authorisation logic depends on auth.uid()
//                 resolving to the real caller, not a service role).
//
//   adminClient — created with the Supabase service role key. Used for
//                 exactly one thing: auth.admin.inviteUserByEmail, the
//                 one operation that genuinely requires admin rights.
//                 Never used to read or write application data.
//
// Requires a new environment variable in Netlify that does not exist
// yet: SUPABASE_SERVICE_ROLE_KEY. This is the project's service role
// key from the Supabase dashboard (Settings > API), not the anon key
// already in use elsewhere in this repo. It must only ever be set as a
// server-side Netlify environment variable, never shipped to the
// browser bundle the way SUPABASE_ANON_KEY is.
//
// What this deliberately does not do: it does not decide whether this
// feature should exist for a given participant. That decision already
// lives in the database (the 18+ trigger, the direct_contact consent
// check on participant_accounts). This function fails the same way the
// database would if those aren't satisfied; it just gives a clearer
// message before spending an invite email on a request that would have
// been rejected anyway.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dnympoqsnrlgsvhznsjb.supabase.co";

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceRoleKey) {
    console.error("Missing SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Server is not configured for this action yet." }, 500);
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Not signed in." }, 401);
  }

  let participantId;
  try {
    const body = await req.json();
    participantId = body.participant_id;
  } catch {
    return json({ error: "Malformed request." }, 400);
  }
  if (!participantId) {
    return json({ error: "participant_id is required." }, 400);
  }

  // Acts as the calling mentor. Every read below is exactly as
  // restricted as it would be in the app itself.
  const userClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !caller) {
    return json({ error: "Not signed in." }, 401);
  }

  const { data: participant, error: pErr } = await userClient
    .from("participants")
    .select("id, full_name, age_band, email, active")
    .eq("id", participantId)
    .single();

  if (pErr || !participant) {
    // RLS hid it, or it does not exist. Same response either way, so
    // this never confirms or denies a record's existence to someone
    // who should not see it.
    return json({ error: "Participant not found." }, 404);
  }

  if (!participant.active) {
    return json({ error: "This participant is not active." }, 400);
  }

  if (participant.age_band !== "18+") {
    // Mirrors the database trigger. Caught here so the mentor gets a
    // plain answer instead of a raw Postgres error, but the trigger
    // is what actually enforces this, not this check.
    return json({ error: "Direct contact is only available for 18+ participants." }, 400);
  }

  if (!participant.email) {
    return json({ error: "No email on file for this participant. Add one before inviting." }, 400);
  }

  const { data: consents, error: cErr } = await userClient
    .from("participant_consents")
    .select("id")
    .eq("participant_id", participantId)
    .eq("consent_type", "direct_contact")
    .is("withdrawn_on", null)
    .limit(1);

  if (cErr) {
    console.error("Consent check failed:", cErr.message);
    return json({ error: "Could not verify consent. Try again." }, 500);
  }
  if (!consents || consents.length === 0) {
    return json({ error: "Direct-contact consent must be recorded before inviting." }, 400);
  }

  const { data: existing } = await userClient
    .from("participant_accounts")
    .select("participant_id, active")
    .eq("participant_id", participantId)
    .maybeSingle();

  if (existing && existing.active) {
    return json({ error: "This participant already has an active account." }, 400);
  }

  // The one call that genuinely needs the service role key.
  const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

  const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    participant.email,
    {
      data: { participant_account: true, participant_id: participantId },
      // TODO: point this at the participant-facing page once it
      // exists. There is no such page yet (see the migration's notes
      // and App.jsx's SignupPending fallback) — set this before this
      // function is used with a real participant.
      redirectTo: `${process.env.URL || ""}/participant-welcome`,
    }
  );

  if (inviteErr) {
    console.error("Invite failed:", inviteErr.message);
    // A duplicate invite to an email already in auth.users is the
    // most likely real-world failure here; surfaced plainly rather
    // than as a generic 500.
    return json({ error: humaniseInviteError(inviteErr.message) }, 400);
  }

  // Back to the mentor's own session for this, so link_participant_account's
  // own authorisation check (is_admin / can_touch_participant / owns_participant)
  // runs against the real caller, and its 18+ and consent checks run
  // again, independently, at the database layer.
  const { error: linkErr } = await userClient.rpc("link_participant_account", {
    p_participant_id: participantId,
    p_auth_user_id: invited.user.id,
  });

  if (linkErr) {
    console.error("link_participant_account failed after invite was sent:", linkErr.message);
    // The invite email has already gone out at this point. Not
    // rolled back automatically — see the note below.
    return json({
      error: "Invite was sent, but the account could not be linked: " + linkErr.message
        + " Contact an admin before this participant tries to sign in.",
    }, 500);
  }

  return json({ ok: true, message: `Invite sent to ${participant.full_name}.` });
};

function humaniseInviteError(msg) {
  if (/already registered|already exists/i.test(msg)) {
    return "This email is already registered in the system. Check whether this participant already has an account, or whether the email belongs to someone else.";
  }
  return msg;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
