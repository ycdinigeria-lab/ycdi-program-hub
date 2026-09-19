// netlify/lib/send-engine.mjs
//
// Batch 30. The sending loop. It knows nothing about any email company
// and nothing about Supabase: it is handed a `db` (three calls that map
// onto the database functions from batch30-campaign-sending.sql) and a
// set of `adapters` (see email-providers.mjs).
//
//   db.claim(campaignId, limit)     -> rows   the next people to write to (the database
//                                              applies the daily limit and the do-not-email
//                                              list, and marks them taken)
//   db.record(campaignId, results)  -> void   what the provider said, one entry per person
//   db.release(campaignId, emails)  -> void   give claims back untouched
//
// The loop:
//   claim a batch -> pick the adapter named on the rows -> build each
//   message -> send in chunks the adapter can carry -> record the results.
//
// It stops when there is nothing to claim (finished, or waiting for the
// daily allowance to free up), when the time is up, or when something is
// wrong with the setup rather than with a person:
//
//   no adapter    the provider's key is not set on this server
//   fatal         the provider refused the request (bad key, unverified domain)
//   throttled     the provider said slow down
//
// In each of those cases the claimed people are given back untouched and
// no attempt is counted against them, because it was not their fault.

import { createHash } from "node:crypto";
import { buildMessage } from "./campaign-render.mjs";

function chunksOf(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += Math.max(1, size)) out.push(list.slice(i, i + size));
  return out;
}

// One key per exact batch: the same people on the same attempt give the
// same key, so a request that is repeated by accident is not sent twice
// (the provider remembers keys for a day). The attempt number is part of
// it on purpose: a person put back in the queue after a failure must
// really be tried again, not answered from the provider's memory of the
// failure. The one gap this leaves is a run that dies after the provider
// accepted a batch but before the result was written down; that batch is
// claimed again after 15 minutes under a new key. That is rare, and it
// means a duplicate, never a missed person.
export function idempotencyKey(campaignId, rows) {
  const digest = createHash("sha256")
    .update(rows.map((r) => `${r.email}#${r.attempt}`).sort().join("\n"))
    .digest("hex")
    .slice(0, 32);
  return `campaign-${campaignId}-${digest}`;
}

export async function runSendLoop({
  db, adapters, campaignId, secret, baseUrl, deadline,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const summary = { sent: 0, failed: 0, requeued: 0, stopped: "idle", message: null };

  while (now() < deadline) {
    const rows = await db.claim(campaignId, 100);
    if (!rows.length) { summary.stopped = "idle"; return summary; }

    const adapter = adapters.get(rows[0].provider);
    if (!adapter) {
      await db.release(campaignId, rows.map((r) => r.email));
      summary.stopped = "no_adapter";
      summary.message = `This server has no way to send through "${rows[0].provider}". Check that its key is set.`;
      return summary;
    }

    const chunks = chunksOf(rows, adapter.maxBatch);
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      const messages = chunk.map((row) => buildMessage({ row, secret, baseUrl }));
      const outcome = await adapter.sendBatch(messages, { idempotencyKey: idempotencyKey(campaignId, chunk) });

      if (outcome.fatal || outcome.throttled) {
        // Give back this chunk and every chunk not yet tried.
        const unsent = chunks.slice(c).flat().map((r) => r.email);
        await db.release(campaignId, unsent);
        summary.stopped = outcome.fatal ? "fatal" : "throttled";
        summary.message = outcome.fatal || "The provider asked us to slow down. Sending will carry on shortly.";
        return summary;
      }

      const results = chunk.map((row, i) => ({ email: row.email, ...outcome.results[i] }));
      await db.record(campaignId, results);
      results.forEach((r, i) => {
        if (r.ok) summary.sent += 1;
        else if (r.retryable && chunk[i].attempt < 3) summary.requeued += 1;
        else summary.failed += 1;
      });

      if (adapter.pauseMs) await sleep(adapter.pauseMs);
    }
  }

  summary.stopped = "time";
  return summary;
}
