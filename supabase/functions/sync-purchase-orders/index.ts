import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIORITY_BASE_URL =
  "https://bsb.netrun.co.il/odata/Priority/tabula.ini/zabilo";
const PAGE_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET-equivalent (POST to trigger, but we only do GET to Priority)
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

    // Parse request body for optional date filter
    let dateFilter = "2025-01-01T00:00:00+02:00";
    try {
      const body = await req.json();
      if (body.from_date) {
        dateFilter = body.from_date;
      }
    } catch {
      // Use default date
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

    // Fetch all purchase orders with pagination (GET only!)
    let allRecords: any[] = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
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
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await response.json();
      const orders = data.value || [];

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      // Flatten: one record per order line item
      for (const order of orders) {
        const items = order.PORDERITEMS_SUBFORM || [];
        for (const item of items) {
          allRecords.push({
            order_number: order.ORDNAME || null,
            order_date: order.CURDATE
              ? order.CURDATE.split("T")[0]
              : null,
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
            due_date: item.DUEDATE
              ? item.DUEDATE.split("T")[0]
              : null,
            barcode: item.BARCODE || null,
            upload_batch: `priority_sync_${new Date().toISOString().split("T")[0]}`,
          });
        }
      }

      skip += PAGE_SIZE;
      if (orders.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    console.log(`Total records fetched from Priority: ${allRecords.length}`);

    if (allRecords.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No purchase orders found for the given date range",
          records_synced: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role to write data
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete existing records from priority sync batches, then insert fresh
    const { error: deleteError } = await supabaseAdmin
      .from("purchase_records")
      .delete()
      .like("upload_batch", "priority_sync_%");

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return new Response(
        JSON.stringify({
          error: "Failed to clear old sync data",
          detail: deleteError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let insertedCount = 0;

    for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
      const batch = allRecords.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabaseAdmin
        .from("purchase_records")
        .insert(batch);

      if (insertError) {
        console.error(`Insert error at batch ${i}:`, insertError);
        return new Response(
          JSON.stringify({
            error: "Failed to insert records",
            detail: insertError.message,
            inserted_so_far: insertedCount,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      insertedCount += batch.length;
    }

    console.log(`Successfully synced ${insertedCount} purchase records`);

    return new Response(
      JSON.stringify({
        success: true,
        records_synced: insertedCount,
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
