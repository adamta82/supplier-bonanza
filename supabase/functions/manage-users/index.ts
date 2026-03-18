import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, ...params } = body;

    // Bootstrap: allow creating first user without auth
    if (action === "create") {
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
      const hasUsers = (existingUsers || []).length > 0;

      if (hasUsers) {
        // Require auth for subsequent creates
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const token = authHeader.replace("Bearer ", "");
        const verifyClient = createClient(supabaseUrl, anonKey);
        const { data: { user }, error: authError } = await verifyClient.auth.getUser(token);
        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      // All other actions require auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const verifyClient = createClient(supabaseUrl, anonKey);
      const { data: { user: caller }, error: authError } = await verifyClient.auth.getUser(token);
      if (authError || !caller) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Store caller for delete check
      (globalThis as any).__caller = caller;
    }

    if (action === "list") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;
      // Get profiles for usernames
      const { data: profiles } = await adminClient.from("profiles").select("*");
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const result = (users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        username: profileMap.get(u.id)?.username || u.email?.split("@")[0],
        display_name: profileMap.get(u.id)?.display_name || "",
        created_at: u.created_at,
      }));
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { username, password, display_name } = params;
      if (!username || !password) {
        return new Response(JSON.stringify({ error: "Username and password required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const email = `${username}@app.local`;
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: display_name || username },
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, user: data.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_password") {
      const { user_id, password } = params;
      if (!user_id || !password) {
        return new Response(JSON.stringify({ error: "user_id and password required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = params;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Don't allow deleting yourself
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
