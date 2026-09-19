// netlify/lib/campaign-db.mjs
//
// Batch 30. Maps the send engine's three database calls onto the
// functions in batch30-campaign-sending.sql. `admin` is a Supabase client
// made with the server (service role) key. Nothing here can be reached
// from the browser.

export function makeDb(admin) {
  const call = async (name, args) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  };
  return {
    async claim(campaignId, limit) {
      return (await call("claim_campaign_batch", { p_campaign: campaignId, p_limit: limit })) || [];
    },
    async record(campaignId, results) {
      await call("record_batch_results", { p_campaign: campaignId, p_results: results });
    },
    async release(campaignId, emails) {
      await call("release_batch", { p_campaign: campaignId, p_emails: emails });
    },
  };
}
