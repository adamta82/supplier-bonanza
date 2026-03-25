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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear(), 0, 1); // Jan 1 of current year
    const fromDateStr = fromDate.toISOString().slice(0, 10);

    const results: Record<string, any> = {};

    // Sync purchase orders - paginate fully
    let purchaseTotal = 0;
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-purchase-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          startSkip: skip,
          max_pages: 5,
          clear_existing: skip === 0,
          from_date: fromDateStr,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        results.purchase_error = data.error;
        break;
      }
      purchaseTotal += data.records_synced || 0;
      hasMore = data.has_more;
      skip = data.nextSkip || skip + 500;
    }
    results.purchase_records_synced = purchaseTotal;

    // Sync sales orders - paginate fully
    let salesTotal = 0;
    skip = 0;
    hasMore = true;
    while (hasMore) {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-sales-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          startSkip: skip,
          max_pages: 5,
          clear_existing: skip === 0,
          from_date: fromDateStr,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        results.sales_error = data.error;
        break;
      }
      salesTotal += data.records_synced || 0;
      hasMore = data.has_more;
      skip = data.nextSkip || skip + 500;
    }
    results.sales_records_synced = salesTotal;

    results.success = true;
    results.sync_date = new Date().toISOString();

    console.log("Scheduled sync completed:", JSON.stringify(results));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Scheduled sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
