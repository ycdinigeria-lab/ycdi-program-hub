// netlify/functions/invite-guardian-account.mjs
//
// Batch 26 / Track 2: invites a minor participant's guardian to a
// read-only account, the way invite-participant-account.mjs invites
// an 18+ participant to their own account. Same privilege split:
//
//   userClient  — the calling mentor's own session. Everything RLS
//                 governs goes through this one, including the final
//                 link_guardian_account call.
//   adminClient — the service role key. Used for exactly one thing:
//                 auth.admin.inviteUserByEmail.
//
// Uses the same SUPABASE_SERVICE_ROLE_KEY already added to Netlify
// for invite-participant-account.mjs; no new secret needed.
//
// This invites the GUARDIAN's email, never the participant's. A minor
// participant still has no login and no channel of their own; nothing
// here changes that.

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

  const userClient = createClient(SUPABASE_URL, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !caller) {
    return json({ error: "Not signed in." }, 401);
  }

  const { data: participant, error: pErr } = await userClient
    .from("participants")
    .select("id, full_name, age_band, active")
    .eq("id", participantId)
    .single();

  if (pErr || !participant) {
    return json({ error: "Participant not found." }, 404);
  }
  if (!participant.active) {
    return json({ error: "This participant is not active." }, 400);
  }

  // Mirrors enforce_guardian_account()'s trigger check.
  if (participant.age_band === "18+") {
    return json({ error: "Guardian accounts are for minor participants. This participant has their own direct-contact option instead." }, 400);
  }

  const { data: guardian, error: gErr } = await userClient
    .from("participant_guardians")
    .select("id, full_name, email")
    .eq("participant_id", participantId)
    .maybeSingle();

  if (gErr) {
    console.error("Guardian lookup failed:", gErr.message);
    return json({ error: "Could not look up guardian details. Try again." }, 500);
  }
  if (!guardian) {
    return json({ error: "No guardian contact details recorded for this participant yet." }, 400);
  }
  if (!guardian.email) {
    // Same limitation as the participant invite: Supabase Auth has no
    // admin-initiated invite for a phone number, only email. A
    // phone-only guardian can't be invited this way today.
    return json({ error: "No email on file for this guardian. Add one before inviting (phone-only invites aren't supported yet)." }, 400);
  }

  const { data: consents, error: cErr } = await userClient
    .from("participant_consents")
    .select("id")
    .eq("participant_id", participantId)
    .eq("consent_type", "guardian_digest")
    .is("withdrawn_on", null)
    .limit(1);

  if (cErr) {
    console.error("Consent check failed:", cErr.message);
    return json({ error: "Could not verify consent. Try again." }, 500);
  }
  if (!consents || consents.length === 0) {
    return json({ error: "Guardian-digest consent must be recorded before inviting." }, 400);
  }

  const { data: existing } = await userClient
    .from("guardian_accounts")
    .select("guardian_id, active")
    .eq("guardian_id", guardian.id)
    .maybeSingle();

  if (existing && existing.active) {
    return json({ error: "This guardian already has an active account." }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, serviceRoleKey);

  const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    guardian.email,
    {
      data: { guardian_account: true, participant_id: participantId },
      // Same open item as invite-participant-account.mjs: no landing
      // page exists yet for either kind of invited account. Set this
      // once a guardian-facing page (read-only touchpoint view) is built.
      redirectTo: `${process.env.URL || ""}/guardian-welcome`,
    }
  );

  if (inviteErr) {
    console.error("Guardian invite failed:", inviteErr.message);
    return json({ error: humaniseInviteError(inviteErr.message) }, 400);
  }

  const { error: linkErr } = await userClient.rpc("link_guardian_account", {
    p_guardian_id: guardian.id,
    p_auth_user_id: invited.user.id,
  });

  if (linkErr) {
    console.error("link_guardian_account failed after invite was sent:", linkErr.message);
    return json({
      error: "Invite was sent, but the account could not be linked: " + linkErr.message
        + " Contact an admin before this guardian tries to sign in.",
    }, 500);
  }

  return json({ ok: true, message: `Invite sent to ${guardian.full_name} for ${participant.full_name}.` });
};

function humaniseInviteError(msg) {
  if (/already registered|already exists/i.test(msg)) {
    return "This email is already registered in the system. Check whether this guardian already has an account, or whether the email belongs to someone else, including a mentor or staff account.";
  }
  return msg;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
