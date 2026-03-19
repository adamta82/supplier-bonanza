import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIORITY_BASE_URL =
  "https://bsb.netrun.co.il/odata/Priority/tabula.ini/zabilo";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Priority credentials
    const priorityUsername = Deno.env.get("PRIORITY_API_USERNAME");
    const priorityPassword = Deno.env.get("PRIORITY_API_PASSWORD");
    if (!priorityUsername || !priorityPassword) {
      return new Response(
        JSON.stringify({ error: "Priority API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const basicAuth = btoa(`${priorityUsername}:${priorityPassword}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse body - expect { item_codes: string[] }
    let itemCodes: string[] = [];
    try {
      const body = await req.json();
      itemCodes = body.item_codes || [];
    } catch {
      // no body
    }

    if (!itemCodes.length) {
      return new Response(
        JSON.stringify({ error: "No item_codes provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load supplier map
    const { data: suppliersData } = await supabaseAdmin
      .from("suppliers")
      .select("id, supplier_number, name");
    const supplierIdMap = new Map<string, string>();
    const supplierNameMap = new Map<string, string>();
    (suppliersData || []).forEach((s: any) => {
      if (s.supplier_number) {
        supplierIdMap.set(s.supplier_number, s.id);
        supplierNameMap.set(s.supplier_number, s.name);
      }
    });

    // Deduplicate item codes
    const uniqueCodes = [...new Set(itemCodes)];
    let resolved = 0;
    let notFound = 0;
    let errors = 0;

    // Process in batches of 10 to avoid overwhelming Priority
    const BATCH_SIZE = 10;
    // Cache: item_code -> { supplierNumber, supplierName }
    const cache = new Map<string, { supplierNumber: string; supplierName: string } | null>();

    for (let i = 0; i < uniqueCodes.length; i += BATCH_SIZE) {
      const batch = uniqueCodes.slice(i, i + BATCH_SIZE);

      // Query Priority for each item code in parallel
      const results = await Promise.allSettled(
        batch.map(async (code) => {
          const encodedCode = encodeURIComponent(`'${code}'`);
          const url = `${PRIORITY_BASE_URL}/LOGPART?$filter=PARTNAME eq ${encodedCode}&$select=PARTNAME,SUPNAME,SUPDES&$top=1`;

          const response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            console.error(`LOGPART query failed for ${code}: ${response.status}`);
            return { code, supplier: null, error: true };
          }

          const data = await response.json();
          const parts = data.value || [];
          if (parts.length === 0 || !parts[0].SUPNAME) {
            return { code, supplier: null, error: false };
          }

          return {
            code,
            supplier: {
              supplierNumber: parts[0].SUPNAME,
              supplierName: parts[0].SUPDES || parts[0].SUPNAME,
            },
            error: false,
          };
        })
      );

      for (const result of results) {
        if (result.status === "rejected") {
          errors++;
          continue;
        }
        const { code, supplier, error } = result.value;
        if (error) {
          errors++;
          cache.set(code, null);
        } else if (!supplier) {
          notFound++;
          cache.set(code, null);
        } else {
          cache.set(code, supplier);
        }
      }
    }

    // Now update sales_records using the cache
    for (const [itemCode, supplierInfo] of cache.entries()) {
      if (!supplierInfo) continue;

      const suppId = supplierIdMap.get(supplierInfo.supplierNumber) || null;
      const suppName = supplierNameMap.get(supplierInfo.supplierNumber) || supplierInfo.supplierName;

      const updateData: any = { supplier_name: suppName };
      if (suppId) updateData.supplier_id = suppId;

      const { error: updateError } = await supabaseAdmin
        .from("sales_records")
        .update(updateData)
        .eq("item_code", itemCode)
        .is("supplier_id", null)
        .is("supplier_name", null);

      if (updateError) {
        console.error(`Failed to update sales_records for ${itemCode}:`, updateError);
        errors++;
      } else {
        resolved++;
      }
    }

    console.log(`Resolve suppliers: resolved=${resolved}, notFound=${notFound}, errors=${errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        resolved,
        not_found: notFound,
        errors,
        total_codes: uniqueCodes.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
