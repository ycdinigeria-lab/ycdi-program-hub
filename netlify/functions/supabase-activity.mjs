import { createClient } from "@supabase/supabase-js";

export default async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { error } = await supabase
    .from("announcements")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Supabase activity check failed:", error.message);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500 }
    );
  }

  console.log("Supabase activity check successful");

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200 }
  );
};

export const config = {
  schedule: "0 9 * * *"
};
