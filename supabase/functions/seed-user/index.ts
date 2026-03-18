import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Delete old __check__ users
  const { data: { users } } = await adminClient.auth.admin.listUsers();
  for (const u of (users || [])) {
    if (u.email?.includes("__check__")) {
      await adminClient.auth.admin.deleteUser(u.id);
    }
  }

  // Create adam
  const { data, error } = await adminClient.auth.admin.createUser({
    email: "adam@app.local",
    password: "654321",
    email_confirm: true,
    user_metadata: { username: "adam", display_name: "adam" },
  });

  return new Response(JSON.stringify({ success: !error, data: data?.user?.id, error: error?.message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
