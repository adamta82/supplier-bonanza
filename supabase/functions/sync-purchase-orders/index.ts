import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIORITY_BASE_URL =
  "https://bsb.netrun.co.il/odata/Priority/tabula.ini/zabilo";
const PAGE_SIZE = 500; // Priority supports up to 1000
const EXCLUDED_STATUSES = ["מבוטלת", "טיוטא"];

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
    // Authenticate the calling user
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

    // Parse request body
    let dateFilter = "2025-01-01T00:00:00+02:00";
    let startSkip = 0;
    let maxPages = 10; // Process up to 10 pages per invocation (5000 orders)
    let clearExisting = true; // Only clear on first chunk

    try {
      const body = await req.json();
      if (body.from_date) {
        // Ensure DateTimeOffset format required by Priority: yyyy-mm-ddThh:mm:ss+hh:mm
        const d = body.from_date.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          dateFilter = `${d}T00:00:00+02:00`;
        } else {
          dateFilter = d;
        }
      }
      if (body.startSkip !== undefined) startSkip = body.startSkip;
      else if (body.start_skip !== undefined) startSkip = body.start_skip;
      if (body.max_pages !== undefined) maxPages = body.max_pages;
      if (body.clear_existing !== undefined) clearExisting = body.clear_existing;
    } catch {
      // Use defaults
    }

    // Priority API credentials
    const priorityUsername = Deno.env.get("PRIORITY_API_USERNAME");
    const priorityPassword = Deno.env.get("PRIORITY_API_PASSWORD");
    if (!priorityUsername || !priorityPassword) {
      return new Response(
        JSON.stringify({ error: "Priority API credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const basicAuth = btoa(`${priorityUsername}:${priorityPassword}`);
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clear existing priority sync data only on first chunk
    if (clearExisting && startSkip === 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("purchase_records")
        .delete()
        .like("upload_batch", "priority_sync_%");

      if (deleteError) {
        console.error("Delete error:", deleteError);
        return new Response(
          JSON.stringify({ error: "Failed to clear old sync data", detail: deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Cleared existing priority sync data");
    }

    // Fetch purchase orders with pagination (GET only!)
    let skip = startSkip;
    let pagesProcessed = 0;
    let totalInserted = 0;
    let hasMore = true;
    const batchId = `priority_sync_${new Date().toISOString().split("T")[0]}`;

    while (hasMore && pagesProcessed < maxPages) {
      const encodedDate = encodeURIComponent(dateFilter);
      const url = `${PRIORITY_BASE_URL}/PORDERS?$filter=CURDATE ge ${encodedDate}&$expand=PORDERITEMS_SUBFORM&$top=${PAGE_SIZE}&$skip=${skip}`;

      console.log(`Fetching Priority PORDERS: skip=${skip}`);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Priority API error: ${response.status} - ${errorText}`);
        return new Response(
          JSON.stringify({
            error: "Priority API request failed",
            status: response.status,
            detail: errorText,
            inserted_so_far: totalInserted,
            last_skip: skip,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const orders = data.value || [];

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      // Flatten: one record per order line item
      const records: any[] = [];
      for (const order of orders) {
        // Skip excluded statuses
        if (EXCLUDED_STATUSES.includes(order.STATDES)) continue;
        const items = order.PORDERITEMS_SUBFORM || [];
        for (const item of items) {
          records.push({
            order_number: order.ORDNAME || null,
            order_date: order.CURDATE ? order.CURDATE.split("T")[0] : null,
            supplier_number: order.SUPNAME || null,
            supplier_name: order.CDES || null,
            customer_po: order.CORDNAME || null,
            order_status: order.STATDES || null,
            item_code: item.PARTNAME || null,
            item_description: item.PDES || null,
            quantity: item.TQUANT ?? null,
            unit_price: item.PRICE ?? null,
            total_amount: item.QPRICE ?? null,
            total_with_vat: item.VATPRICE ?? null,
            due_date: item.DUEDATE ? item.DUEDATE.split("T")[0] : null,
            barcode: item.BARCODE || null,
            upload_batch: batchId,
          });
        }
      }

      // Insert this page's records immediately
      if (records.length > 0) {
        // Insert in sub-batches of 500
        for (let i = 0; i < records.length; i += 500) {
          const batch = records.slice(i, i + 500);
          const { error: insertError } = await supabaseAdmin
            .from("purchase_records")
            .insert(batch);

          if (insertError) {
            console.error(`Insert error at skip=${skip}:`, insertError);
            return new Response(
              JSON.stringify({
                error: "Failed to insert records",
                detail: insertError.message,
                inserted_so_far: totalInserted,
                last_skip: skip,
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          totalInserted += batch.length;
        }
      }

      skip += PAGE_SIZE;
      pagesProcessed++;

      if (orders.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    console.log(`Synced ${totalInserted} records. hasMore=${hasMore}, nextSkip=${skip}`);

    return new Response(
      JSON.stringify({
        success: true,
        records_synced: totalInserted,
        has_more: hasMore,
        next_skip: hasMore ? skip : null,
        sync_date: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
