// netlify/lib/email-providers.mjs
//
// Batch 30. The email providers the Hub can send through.
//
// The rest of the sending code (the engine, the queue, the approval, the
// do-not-email list) never mentions a company. It talks to an "adapter",
// which is an object with this shape:
//
//   {
//     code:       "resend",          // matches email_providers.code in the database
//     maxBatch:   100,               // most messages one sendBatch call may carry
//     pauseMs:    250,               // wait between calls, to stay inside the provider's rate limit
//
//     sendBatch(messages, { idempotencyKey })
//        -> Promise<{ results: [{ ok, id?, error?, retryable? }, ...] }>   one per message, same order
//         | Promise<{ fatal: "why" }>       nothing is wrong with the people; the setup is wrong
//         | Promise<{ throttled: true }>    the provider asked us to slow down
//
//     verifyWebhook(headers, rawBody, opts) -> boolean
//     parseWebhook(payload)  -> [{ type, email, messageId, detail }]
//        where type is "complained" | "bounced_permanent" | "bounced_transient"
//   }
//
// To add a second provider: write a createXAdapter() with that shape, add
// it to buildAdapters() below, and add a row to email_providers in the
// database. Nothing else changes. The tests in tests/email-providers.test.js
// run every adapter through the same contract checks.
//
// Only Resend is a real adapter. The "fake" adapter at the bottom is a
// stand-in that never contacts anyone: it is how the tests prove the
// engine works with a provider that is not Resend.

import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------
// Resend
//
// What is checked against Resend's own documentation: the batch endpoint
// takes up to 100 emails; the header x-batch-validation chooses between
// strict (one bad address fails the whole batch) and permissive (partial
// success); the Idempotency-Key header makes a repeat of the same request
// safe for 24 hours; webhooks are signed the Svix way, over the raw body.
//
// What is NOT checked against the real service, because it cannot be from
// here: the exact shape of the "errors" list in a permissive reply, and
// the exact field names inside a bounce notice. Both are read defensively
// below, and anything that does not match is treated as "retry later",
// never as "sent".
// ---------------------------------------------------------------------
export function createResendAdapter({
  apiKey,
  webhookSecret,
  fetchImpl = globalThis.fetch,
  baseUrl = "https://api.resend.com",
} = {}) {
  const toPayload = (m) => {
    const payload = {
      from: m.from,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      text: m.text,
    };
    if (m.replyTo) payload.reply_to = m.replyTo;
    if (m.headers) payload.headers = m.headers;
    return payload;
  };

  const allRetry = (messages, error) => ({
    results: messages.map(() => ({ ok: false, retryable: true, error })),
  });

  return {
    code: "resend",
    maxBatch: 100,
    // Resend's default limit is 5 requests a second per team. Pausing a
    // quarter of a second between calls stays well under it.
    pauseMs: 250,
    webhookConfigured: Boolean(webhookSecret),

    async sendBatch(messages, { idempotencyKey } = {}) {
      if (!apiKey) return { fatal: "RESEND_API_KEY is not set on the server." };

      let res;
      try {
        res = await fetchImpl(`${baseUrl}/emails/batch`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "x-batch-validation": "permissive",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          },
          body: JSON.stringify(messages.map(toPayload)),
        });
      } catch (err) {
        return allRetry(messages, `network: ${err?.message || err}`);
      }

      if (res.status === 429) return { throttled: true };
      if (res.status === 401 || res.status === 403) {
        return {
          fatal:
            `Resend refused the request (HTTP ${res.status}). Check RESEND_API_KEY, ` +
            `and that the sender's domain is verified in Resend.`,
        };
      }
      if (res.status >= 500) return allRetry(messages, `Resend error (HTTP ${res.status})`);
      if (res.status >= 400) {
        let detail = "";
        try { detail = (await res.json())?.message || ""; } catch { /* no body */ }
        return { fatal: `Resend rejected the batch (HTTP ${res.status}). ${detail}`.trim() };
      }

      let json;
      try { json = await res.json(); } catch { json = null; }

      const data = Array.isArray(json?.data) ? json.data : null;
      const errors = Array.isArray(json?.errors) ? json.errors : [];
      const errorAt = new Map();
      let indexable = true;
      for (const e of errors) {
        if (Number.isInteger(e?.index)) errorAt.set(e.index, e.message || "rejected");
        else indexable = false;
      }
      const okIndexes = messages.map((_, i) => i).filter((i) => !errorAt.has(i));

      // Anything that does not add up is retried, never assumed sent.
      if (!data || !indexable || data.length !== okIndexes.length) {
        console.warn("Resend batch reply was not in the expected shape; retrying later.");
        return allRetry(messages, "unexpected reply from Resend");
      }

      let next = 0;
      return {
        results: messages.map((_, i) =>
          errorAt.has(i)
            ? { ok: false, retryable: false, error: errorAt.get(i) }
            : { ok: true, id: data[next++]?.id ?? null },
        ),
      };
    },

    // Svix signature: HMAC-SHA256 over "<id>.<timestamp>.<raw body>" with
    // the secret's base64 part as the key, compared to each "v1,<sig>".
    verifyWebhook(headers, rawBody, { nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300 } = {}) {
      const id = headers?.["svix-id"];
      const timestamp = headers?.["svix-timestamp"];
      const signature = headers?.["svix-signature"];
      if (!webhookSecret || !id || !timestamp || !signature) return false;

      const ts = Number(timestamp);
      if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

      const secret = webhookSecret.startsWith("whsec_") ? webhookSecret.slice(6) : webhookSecret;
      const expected = createHmac("sha256", Buffer.from(secret, "base64"))
        .update(`${id}.${timestamp}.${rawBody}`)
        .digest("base64");

      return String(signature).split(" ").some((part) => {
        const [version, sig] = part.split(",");
        return version === "v1" && safeEqual(sig, expected);
      });
    },

    parseWebhook(payload) {
      const type = payload?.type;
      const data = payload?.data ?? {};
      const recipients = [].concat(data.to ?? data.email ?? []).filter(Boolean);
      const messageId = data.email_id ?? null;

      if (type === "email.complained") {
        return recipients.map((email) => ({ type: "complained", email, messageId, detail: null }));
      }
      if (type === "email.bounced") {
        const kind = String(data.bounce?.type ?? data.bounce_type ?? "").toLowerCase();
        const detail = data.bounce?.message ?? null;
        // Only a permanent bounce is treated as permanent. "Undetermined",
        // or anything not recognised, is treated as temporary, because a
        // stop cannot be undone and a full mailbox is not a reason to lose
        // somebody.
        const permanent = /perm|hard/.test(kind);
        return recipients.map((email) => ({
          type: permanent ? "bounced_permanent" : "bounced_transient",
          email, messageId, detail,
        }));
      }
      return [];
    },
  };
}

// ---------------------------------------------------------------------
// A stand-in provider. It contacts nobody. It exists so the engine can be
// tested against a provider that is not Resend, with different limits and
// different behaviour, which is the whole point of the adapter.
// ---------------------------------------------------------------------
export function createFakeAdapter({
  code = "fake",
  maxBatch = 3,
  pauseMs = 0,
  rejectEmails = [],   // refused for good
  retryEmails = [],    // refused for now
  fatal = null,        // a setup problem for the whole batch
  throttled = false,
} = {}) {
  const calls = [];
  return {
    code, maxBatch, pauseMs, webhookConfigured: true,
    calls,
    async sendBatch(messages, opts = {}) {
      calls.push({ messages, idempotencyKey: opts.idempotencyKey });
      if (fatal) return { fatal };
      if (throttled) return { throttled: true };
      return {
        results: messages.map((m, i) => {
          if (rejectEmails.includes(m.to)) return { ok: false, retryable: false, error: "rejected by fake" };
          if (retryEmails.includes(m.to)) return { ok: false, retryable: true, error: "try later" };
          return { ok: true, id: `${code}-${calls.length}-${i}` };
        }),
      };
    },
    verifyWebhook(headers) { return headers?.["x-fake-signature"] === "valid"; },
    parseWebhook(payload) {
      return (payload?.events ?? []).map((e) => ({
        type: e.type, email: e.email, messageId: e.messageId ?? null, detail: e.detail ?? null,
      }));
    },
  };
}

// ---------------------------------------------------------------------
// The registry: which adapters exist on this server. A provider is only
// available if its keys are set, so a missing key shows up as "no adapter
// for provider X" and not as a mystery failure.
// ---------------------------------------------------------------------
export function buildAdapters(env = process.env, extra = []) {
  const adapters = new Map();
  if (env.RESEND_API_KEY) {
    adapters.set("resend", createResendAdapter({
      apiKey: env.RESEND_API_KEY,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    }));
  }
  for (const a of extra) adapters.set(a.code, a);
  return adapters;
}
